"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Coins } from "lucide-react";
import { NetClient, type RenderState } from "@/lib/blaster/net";
import { Renderer } from "@/lib/blaster/render";
import { InputController } from "@/lib/blaster/input";
import { SoundEngine } from "@/lib/blaster/audio";
import { CampaignGame } from "@/lib/blaster/campaign";
import {
  CAMPAIGN,
  EVENT,
  PHASE,
  ROUNDS,
  UPGRADE_ORDER,
  type GameEvent,
  type Seat,
  type UpgradeKey,
  type Upgrades,
} from "@/lib/blaster/protocol";
import styles from "./blaster.module.css";

type Screen = "loading" | "menu" | "searching" | "match" | "result" | "gone" | "error" | "campaign";

interface Hud {
  phase: string;
  countdownMs: number;
  round: number;
  scoreMe: number;
  scoreFoe: number;
  meHp: number;
  foeHp: number;
  meAmmo: number;
  meReloading: boolean;
  meReloadRemain: number;
  isTouch: boolean;
}

interface CampaignHud {
  level: number;
  totalLevels: number;
  coins: number;
  upgrades: Upgrades;
  phase: string;
  countdownMs: number;
  meHp: number;
  meMaxHp: number;
  meAmmo: number;
  magazine: number;
  meReloading: boolean;
  rivalHp: number;
  rivalMaxHp: number;
  isTouch: boolean;
}

const MAX_HP = 100;
const EMPTY_HUD: Hud = {
  phase: PHASE.COUNTDOWN,
  countdownMs: 3000,
  round: 1,
  scoreMe: 0,
  scoreFoe: 0,
  meHp: MAX_HP,
  foeHp: MAX_HP,
  meAmmo: 6,
  meReloading: false,
  meReloadRemain: 0,
  isTouch: false,
};

const EMPTY_UPGRADES: Upgrades = { damage: 0, firerate: 0, speed: 0, vitality: 0, multishot: 0, magazine: 0 };
const EMPTY_CAMPAIGN_HUD: CampaignHud = {
  level: 1,
  totalLevels: CAMPAIGN.totalLevels,
  coins: 0,
  upgrades: EMPTY_UPGRADES,
  phase: "countdown",
  countdownMs: 3000,
  meHp: MAX_HP,
  meMaxHp: MAX_HP,
  meAmmo: 6,
  magazine: 6,
  meReloading: false,
  rivalHp: 100,
  rivalMaxHp: 100,
  isTouch: false,
};

const CAMPAIGN_KEY = "blaster_campaign";

function normalizeUpgrades(raw: unknown): Upgrades {
  const src = (raw ?? {}) as Record<string, number>;
  const out = { ...EMPTY_UPGRADES };
  for (const k of UPGRADE_ORDER) {
    const v = Number(src[k]);
    out[k as UpgradeKey] = Number.isFinite(v) ? Math.max(0, Math.min(CAMPAIGN.maxUpgradeLevel, Math.floor(v))) : 0;
  }
  return out;
}

function loadProgress(): { level: number; coins: number; upgrades: Upgrades } {
  try {
    const raw = localStorage.getItem(CAMPAIGN_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        level: Math.max(1, Math.min(CAMPAIGN.totalLevels, Math.floor(p.level) || 1)),
        coins: Math.max(0, Math.floor(p.coins) || 0),
        upgrades: normalizeUpgrades(p.upgrades),
      };
    }
  } catch {
    /* ignore */
  }
  return { level: 1, coins: 0, upgrades: { ...EMPTY_UPGRADES } };
}

function saveProgress(g: CampaignGame) {
  try {
    localStorage.setItem(CAMPAIGN_KEY, JSON.stringify({ level: g.level, coins: g.coins, upgrades: g.upgrades }));
  } catch {
    /* ignore */
  }
}

function resolveServerUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_BLASTER_SERVER_URL;
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "ws://localhost:8787";
  }
  return "";
}

export function BlasterDuel({ onExit }: { onExit?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const netRef = useRef<NetClient | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const campaignRef = useRef<CampaignGame | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const intentionalCloseRef = useRef(false);
  const moveBaseRef = useRef<HTMLDivElement>(null);
  const moveKnobRef = useRef<HTMLDivElement>(null);
  const aimBaseRef = useRef<HTMLDivElement>(null);
  const aimKnobRef = useRef<HTMLDivElement>(null);

  const [screen, setScreen] = useState<Screen>("loading");
  const [muted, setMuted] = useState(false);
  const [botOffered, setBotOffered] = useState(false);
  const [opponent, setOpponent] = useState("Opponent");
  const [mode, setMode] = useState<"pvp" | "bot">("pvp");
  const [result, setResult] = useState<{ win: boolean; scoreMe: number; scoreFoe: number } | null>(null);
  const [banner, setBanner] = useState<{ text: string; win: boolean } | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [chud, setChud] = useState<CampaignHud>(EMPTY_CAMPAIGN_HUD);

  const screenRef = useRef(screen);
  screenRef.current = screen;

  // --- Connection + handler wiring (built once) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const renderer = new Renderer(canvas);
    rendererRef.current = renderer;
    renderer.resize();
    renderer.drawIdle();

    const input = new InputController();
    inputRef.current = input;

    const sound = new SoundEngine();
    soundRef.current = sound;
    sound.setMuted(muted);

    const ro = new ResizeObserver(() => {
      renderer.resize();
      if (screenRef.current !== "match" && screenRef.current !== "campaign") renderer.drawIdle();
    });
    ro.observe(stage);

    const url = resolveServerUrl();

    const handleEvents = (events: GameEvent[], mySeat: Seat) => {
      const r = rendererRef.current;
      const s = soundRef.current;
      if (!r || !s) return;
      dispatchEvents(events, mySeat, r, s, netRef.current?.getRenderState(performance.now()));
    };

    const connect = () => {
      if (!url) {
        setScreen("error");
        return;
      }
      intentionalCloseRef.current = false;
      const net = new NetClient(url, {
        onWelcome: () => setScreen((s) => (s === "loading" || s === "error" ? "menu" : s)),
        onSearching: () => {
          setBotOffered(false);
          setScreen("searching");
        },
        onBotOffer: () => setBotOffered(true),
        onMatchFound: (_you, opp, m) => {
          setOpponent(opp);
          setMode(m);
          setResult(null);
          setBanner(null);
          setHud(EMPTY_HUD);
          setScreen("match");
        },
        onRoundResult: (winner) => {
          const mine = winner === netRef.current?.mySeat;
          setBanner({ text: mine ? "Round won" : "Round lost", win: mine });
          window.setTimeout(() => setBanner(null), 1800);
        },
        onMatchResult: (winner, score) => {
          const seat = netRef.current?.mySeat ?? "a";
          const other: Seat = seat === "a" ? "b" : "a";
          const win = winner === seat;
          setResult({ win, scoreMe: score[seat], scoreFoe: score[other] });
          setScreen("result");
          if (win) soundRef.current?.matchWin();
          else soundRef.current?.matchLose();
        },
        onOpponentLeft: () => {
          if (screenRef.current === "match") setScreen("gone");
        },
        onEvents: handleEvents,
        onLatency: (ms) => setLatency(ms),
        onClose: () => {
          if (!intentionalCloseRef.current && screenRef.current !== "menu" && screenRef.current !== "campaign") setScreen("error");
        },
        onError: () => {
          if (screenRef.current === "loading") setScreen("error");
        },
      });
      netRef.current = net;
      net.connect();
    };

    connectRef.current = connect;
    connect();

    return () => {
      intentionalCloseRef.current = true;
      ro.disconnect();
      input.detach();
      netRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Online match loop ---
  useEffect(() => {
    if (screen !== "match") {
      if (screen !== "campaign") rendererRef.current?.drawIdle();
      return;
    }
    const canvas = canvasRef.current;
    const input = inputRef.current;
    if (!canvas || !input) return;
    input.attach(canvas);

    let raf = 0;
    let last = performance.now();
    let lastHudAt = 0;
    let beepSec = 99;
    let prevPhase = "";
    const moveBase = moveBaseRef.current;
    const moveKnob = moveKnobRef.current;
    const aimBase = aimBaseRef.current;
    const aimKnob = aimKnobRef.current;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const net = netRef.current;
      const renderer = rendererRef.current;
      const sound = soundRef.current;
      if (!net || !renderer || !sound) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const pre = net.getRenderState(now);
      if (pre) {
        const aim = Math.atan2(pre.foe.y - pre.me.y, pre.foe.x - pre.me.x);
        net.setInput({
          up: input.up,
          down: input.down,
          left: input.left,
          right: input.right,
          fire: input.firing,
          reload: input.reloadDown,
          aim,
        });
      }

      net.update(now);
      renderer.update(dt);

      const rs = net.getRenderState(now);
      if (rs) {
        renderer.draw(rs);
        if (rs.phase === PHASE.COUNTDOWN) {
          const sec = Math.ceil(rs.countdownMs / 1000);
          if (sec !== beepSec && sec >= 1 && sec <= 3) {
            sound.countdownBeep(false);
            beepSec = sec;
          }
        }
        if (prevPhase === PHASE.COUNTDOWN && rs.phase === PHASE.LIVE) {
          sound.countdownBeep(true);
          beepSec = 99;
        }
        prevPhase = rs.phase;
        updateSticks(input, moveBase, moveKnob, aimBase, aimKnob);
        if (now - lastHudAt > 60) {
          lastHudAt = now;
          const other: Seat = rs.mySeat === "a" ? "b" : "a";
          setHud({
            phase: rs.phase,
            countdownMs: rs.countdownMs,
            round: rs.round,
            scoreMe: rs.score[rs.mySeat],
            scoreFoe: rs.score[other],
            meHp: rs.me.hp,
            foeHp: rs.foe.hp,
            meAmmo: rs.me.ammo,
            meReloading: rs.me.reloading,
            meReloadRemain: rs.me.reloadRemainMs,
            isTouch: inputRef.current?.isTouch ?? false,
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      input.detach();
    };
  }, [screen]);

  // --- Campaign loop (single-player, client-side) ---
  useEffect(() => {
    if (screen !== "campaign") return;
    const canvas = canvasRef.current;
    const input = inputRef.current;
    if (!canvas || !input) return;
    input.attach(canvas);

    let raf = 0;
    let last = performance.now();
    let lastHudAt = 0;
    let beepSec = 99;
    let prevPhase = "countdown";
    const moveBase = moveBaseRef.current;
    const moveKnob = moveKnobRef.current;
    const aimBase = aimBaseRef.current;
    const aimKnob = aimKnobRef.current;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const eng = campaignRef.current;
      const renderer = rendererRef.current;
      const sound = soundRef.current;
      if (!eng || !renderer || !sound) {
        raf = requestAnimationFrame(loop);
        return;
      }

      eng.setInput({
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
        fire: input.firing,
        reload: input.reloadDown,
      });
      const events = eng.update(dt);
      renderer.update(dt);
      const rs = eng.getRenderState();
      dispatchEvents(events, "a", renderer, sound, rs);
      renderer.draw(rs);

      // Countdown beeps.
      if (eng.phase === "countdown") {
        const sec = Math.ceil(rs.countdownMs / 1000);
        if (sec !== beepSec && sec >= 1 && sec <= 3) {
          sound.countdownBeep(false);
          beepSec = sec;
        }
      }
      if (prevPhase === "countdown" && eng.phase === "live") {
        sound.countdownBeep(true);
        beepSec = 99;
      }

      // Phase-change side effects (once).
      if (prevPhase === "live" && eng.phase !== "live") {
        saveProgress(eng);
        if (eng.phase === "dead") sound.matchLose();
        else sound.matchWin();
      }
      prevPhase = eng.phase;

      updateSticks(input, moveBase, moveKnob, aimBase, aimKnob);
      if (now - lastHudAt > 60) {
        lastHudAt = now;
        const h = eng.getHud();
        setChud({ ...h, isTouch: inputRef.current?.isTouch ?? false });
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      input.detach();
    };
  }, [screen]);

  // Keep sound engine mute in sync.
  useEffect(() => {
    soundRef.current?.setMuted(muted);
  }, [muted]);

  // --- Menu / lifecycle actions ---
  const startSearch = useCallback(() => {
    soundRef.current?.ensureStarted();
    soundRef.current?.uiClick();
    setBotOffered(false);
    netRef.current?.queue("pvp");
    setScreen("searching");
  }, []);

  const playBot = useCallback(() => {
    soundRef.current?.ensureStarted();
    soundRef.current?.uiClick();
    netRef.current?.queue("bot");
  }, []);

  const startCampaign = useCallback(() => {
    soundRef.current?.ensureStarted();
    soundRef.current?.uiClick();
    const prog = loadProgress();
    campaignRef.current = new CampaignGame(prog);
    setChud({ ...campaignRef.current.getHud(), isTouch: inputRef.current?.isTouch ?? false });
    setScreen("campaign");
  }, []);

  const cancelSearch = useCallback(() => {
    soundRef.current?.uiClick();
    netRef.current?.cancel();
    setBotOffered(false);
    setScreen("menu");
  }, []);

  const playAgain = useCallback(() => {
    soundRef.current?.uiClick();
    setBotOffered(false);
    if (mode === "bot") netRef.current?.queue("bot");
    else {
      netRef.current?.rematch();
      setScreen("searching");
    }
  }, [mode]);

  const backToMenu = useCallback(() => {
    soundRef.current?.uiClick();
    netRef.current?.leave();
    setScreen("menu");
  }, []);

  const campaignToMenu = useCallback(() => {
    soundRef.current?.uiClick();
    if (campaignRef.current) saveProgress(campaignRef.current);
    setScreen("menu");
  }, []);

  const buyUpgrade = useCallback((key: UpgradeKey) => {
    const g = campaignRef.current;
    if (!g) return;
    if (g.buyUpgrade(key)) {
      soundRef.current?.uiClick();
      saveProgress(g);
      setChud((h) => ({ ...h, coins: g.coins, upgrades: { ...g.upgrades } }));
    } else {
      soundRef.current?.empty();
    }
  }, []);

  const nextLevel = useCallback(() => {
    const g = campaignRef.current;
    if (!g) return;
    soundRef.current?.uiClick();
    g.nextLevel();
    saveProgress(g);
  }, []);

  const retryLevel = useCallback(() => {
    const g = campaignRef.current;
    if (!g) return;
    soundRef.current?.uiClick();
    g.retryLevel();
    saveProgress(g);
  }, []);

  const newCampaign = useCallback(() => {
    const g = campaignRef.current;
    if (!g) return;
    soundRef.current?.uiClick();
    g.startLevel(1);
    saveProgress(g);
  }, []);

  const retry = useCallback(() => {
    setScreen("loading");
    connectRef.current?.();
  }, []);

  const pct = (hp: number, max: number) => `${Math.max(0, (hp / Math.max(1, max)) * 100)}%`;
  const shopPhase = screen === "campaign" && (chud.phase === "levelClear" || chud.phase === "dead" || chud.phase === "won");

  return (
    <div className={styles.root}>
      <div className={styles.stage} ref={stageRef}>
        <canvas ref={canvasRef} className={styles.canvas} aria-label="Blaster Duel arena" />

        {/* In-match HUD (online) */}
        {screen === "match" && (
          <div className={styles.hud} aria-hidden="true">
            <div className={styles.hudTop}>
              <div className={styles.hudSide}>
                <div className={styles.hudName}>
                  You
                  <span className={styles.pips}>
                    {Array.from({ length: ROUNDS.winTarget }).map((_, i) => (
                      <span key={i} className={`${styles.pip} ${i < hud.scoreMe ? styles.onMe : ""}`} />
                    ))}
                  </span>
                </div>
                <div className={styles.healthTrack}>
                  <div className={`${styles.healthFill} ${styles.me}`} style={{ width: `${Math.max(0, hud.meHp)}%` }} />
                </div>
              </div>

              <div className={styles.roundBadge}>Round {hud.round}</div>

              <div className={`${styles.hudSide} ${styles.right}`}>
                <div className={styles.hudName}>
                  <span className={styles.pips}>
                    {Array.from({ length: ROUNDS.winTarget }).map((_, i) => (
                      <span key={i} className={`${styles.pip} ${i < hud.scoreFoe ? styles.onFoe : ""}`} />
                    ))}
                  </span>
                  {opponent}
                </div>
                <div className={styles.healthTrack}>
                  <div className={`${styles.healthFill} ${styles.foe}`} style={{ width: `${Math.max(0, hud.foeHp)}%` }} />
                </div>
              </div>
            </div>

            <div className={styles.hudBottom}>
              <div className={styles.ammo}>
                {hud.meReloading ? (
                  <span className={styles.reloadLabel}>Reloading…</span>
                ) : (
                  Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className={`${styles.ammoCell} ${i < hud.meAmmo ? styles.filled : ""}`} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* In-match HUD (campaign) */}
        {screen === "campaign" && (
          <div className={styles.hud} aria-hidden="true">
            <div className={styles.hudTop}>
              <div className={styles.hudSide}>
                <div className={styles.hudName}>You</div>
                <div className={styles.healthTrack}>
                  <div className={`${styles.healthFill} ${styles.me}`} style={{ width: pct(chud.meHp, chud.meMaxHp) }} />
                </div>
              </div>

              <div className={styles.hudCenter}>
                <div className={styles.roundBadge}>
                  Level {chud.level} / {chud.totalLevels}
                </div>
                <div className={styles.coinHud}>
                  <Coins size={13} /> {chud.coins}
                </div>
              </div>

              <div className={`${styles.hudSide} ${styles.right}`}>
                <div className={styles.hudName}>Rival Lv.{chud.level}</div>
                <div className={styles.healthTrack}>
                  <div className={`${styles.healthFill} ${styles.foe}`} style={{ width: pct(chud.rivalHp, chud.rivalMaxHp) }} />
                </div>
              </div>
            </div>

            <div className={styles.hudBottom}>
              <div className={styles.ammo}>
                {chud.meReloading ? (
                  <span className={styles.reloadLabel}>Reloading…</span>
                ) : (
                  Array.from({ length: chud.magazine }).map((_, i) => (
                    <span key={i} className={`${styles.ammoCell} ${i < chud.meAmmo ? styles.filled : ""}`} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Countdown */}
        {(screen === "match" || screen === "campaign") &&
          (screen === "match" ? hud.phase === PHASE.COUNTDOWN : chud.phase === "countdown") && (
            <div className={styles.centerOverlay}>
              <div className={styles.countStack}>
                {screen === "campaign" && <div className={styles.levelLabel}>Level {chud.level}</div>}
                <div className={styles.countdown}>
                  {Math.max(1, Math.ceil((screen === "match" ? hud.countdownMs : chud.countdownMs) / 1000))}
                </div>
              </div>
            </div>
          )}
        {screen === "match" && banner && (
          <div className={styles.centerOverlay}>
            <div className={`${styles.banner} ${banner.win ? styles.bannerWin : styles.bannerLose}`}>{banner.text}</div>
          </div>
        )}

        {/* Touch joysticks */}
        <div ref={moveBaseRef} className={styles.stickBase} style={{ display: "none" }} />
        <div ref={moveKnobRef} className={styles.stickKnob} style={{ display: "none" }} />
        <div ref={aimBaseRef} className={styles.stickBase} style={{ display: "none" }} />
        <div ref={aimKnobRef} className={styles.stickKnob} style={{ display: "none" }} />
        {(screen === "match" || screen === "campaign") && (screen === "match" ? hud.isTouch : chud.isTouch) && (
          <div className={styles.touchHint}>Left: move · Right: hold to fire</div>
        )}

        {/* Campaign shop / level-clear / defeat / complete */}
        {shopPhase && (
          <div className={styles.overlay}>
            <div className={styles.shopPanel}>
              <div className={styles.shopHead}>
                <h2 className={styles.shopTitle}>
                  {chud.phase === "levelClear" && `Level ${chud.level} cleared`}
                  {chud.phase === "dead" && `Defeated · Level ${chud.level}`}
                  {chud.phase === "won" && "All levels complete"}
                </h2>
                <div className={styles.coinPill}>
                  <Coins size={15} /> {chud.coins}
                </div>
              </div>
              <p className={styles.shopSub}>
                {chud.phase === "levelClear" && "Spend your coins, then take on the next rival."}
                {chud.phase === "dead" && "Upgrade your fighter and try the level again."}
                {chud.phase === "won" && `You beat all ${chud.totalLevels} rivals. Start over with your upgrades kept.`}
              </p>

              <div className={styles.shopGrid}>
                {UPGRADE_ORDER.map((key) => {
                  const meta = CAMPAIGN.upgrades[key];
                  const lvl = chud.upgrades[key as UpgradeKey] || 0;
                  const maxed = lvl >= CAMPAIGN.maxUpgradeLevel;
                  const cost = meta.baseCost + meta.step * lvl;
                  const afford = chud.coins >= cost;
                  return (
                    <div key={key} className={styles.shopCard}>
                      <div className={styles.shopCardTop}>
                        <span className={styles.shopCardName}>{meta.label}</span>
                        <span className={styles.levelDots}>
                          {Array.from({ length: CAMPAIGN.maxUpgradeLevel }).map((_, i) => (
                            <span key={i} className={`${styles.dot} ${i < lvl ? styles.dotOn : ""}`} />
                          ))}
                        </span>
                      </div>
                      <div className={styles.shopCardDesc}>{meta.desc}</div>
                      <button
                        className={styles.buyBtn}
                        disabled={maxed || !afford}
                        onClick={() => buyUpgrade(key as UpgradeKey)}
                      >
                        {maxed ? (
                          "Maxed"
                        ) : (
                          <>
                            <Coins size={13} /> {cost}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className={styles.btnRow}>
                {chud.phase === "levelClear" && (
                  <button className={styles.btnPrimary} onClick={nextLevel}>
                    Next level →
                  </button>
                )}
                {chud.phase === "dead" && (
                  <button className={styles.btnPrimary} onClick={retryLevel}>
                    Retry level
                  </button>
                )}
                {chud.phase === "won" && (
                  <button className={styles.btnPrimary} onClick={newCampaign}>
                    Play again
                  </button>
                )}
                <button className={styles.btnGhost} onClick={campaignToMenu}>
                  Main menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Menu */}
        {screen === "menu" && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h1 className={styles.logo}>
                <span className={styles.logoBlast}>BLASTER</span> <span className={styles.logoDuel}>DUEL</span>
              </h1>
              <p className={styles.tagline}>
                Battle AI rivals through escalating Levels with an upgrade shop, or duel a real player online.
              </p>
              <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={startCampaign}>
                  Levels
                </button>
                <button className={styles.btnPrimary} onClick={startSearch}>
                  Play Online
                </button>
                <button className={styles.btnGhost} onClick={playBot}>
                  Quick match vs A.I.
                </button>
              </div>
              <div className={styles.controls}>
                <div>
                  Move <span className={styles.kbd}>W</span> <span className={styles.kbd}>A</span>{" "}
                  <span className={styles.kbd}>S</span> <span className={styles.kbd}>D</span> · <b>Auto-aim</b> at your rival · Fire{" "}
                  <b>Left-click</b> / <span className={styles.kbd}>Space</span> · Reload <span className={styles.kbd}>R</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Searching */}
        {screen === "searching" && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <div className={styles.spinner} />
              <h2 className={styles.resultScore}>Searching for opponent…</h2>
              <p className={styles.tagline}>
                It&apos;s a real 1v1, so open this page in another tab or on a friend&apos;s device to face off.
              </p>
              <div className={styles.btnRow}>
                {botOffered && (
                  <button className={styles.btnPrimary} onClick={playBot}>
                    Play vs A.I. now
                  </button>
                )}
                <button className={styles.btnGhost} onClick={cancelSearch}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result (online) */}
        {screen === "result" && result && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={`${styles.resultTitle} ${result.win ? styles.win : styles.lose}`}>
                {result.win ? "VICTORY" : "DEFEAT"}
              </h2>
              <div className={styles.resultScore}>
                {result.scoreMe} <span style={{ opacity: 0.5 }}>–</span> {result.scoreFoe}
              </div>
              <p className={styles.resultSub}>{result.win ? `You beat ${opponent}` : `${opponent} won this one`}</p>
              <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={playAgain}>
                  Play again
                </button>
                <button className={styles.btnGhost} onClick={backToMenu}>
                  Main menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Opponent left */}
        {screen === "gone" && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={`${styles.resultTitle} ${styles.win}`}>Opponent left</h2>
              <p className={styles.resultSub}>Your opponent disconnected. The match ended.</p>
              <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={playAgain}>
                  Find new match
                </button>
                <button className={styles.btnGhost} onClick={backToMenu}>
                  Main menu
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {screen === "loading" && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <div className={styles.spinner} />
              <h2 className={styles.resultScore}>Connecting…</h2>
            </div>
          </div>
        )}

        {/* Error */}
        {screen === "error" && (
          <div className={styles.overlay}>
            <div className={styles.panel}>
              <h2 className={styles.resultScore}>Can&apos;t reach the game server</h2>
              <p className={styles.tagline}>
                Online play needs the game server running. You can still play the Levels offline.
              </p>
              <div className={styles.btnRow}>
                <button className={styles.btnPrimary} onClick={startCampaign}>
                  Play Levels
                </button>
                <button className={styles.btnGhost} onClick={retry}>
                  Retry connection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back to arcade (when embedded) */}
        {onExit && (
          <button
            className={styles.exitBtn}
            onClick={() => {
              soundRef.current?.uiClick();
              netRef.current?.leave();
              if (campaignRef.current) saveProgress(campaignRef.current);
              onExit();
            }}
          >
            ← Games
          </button>
        )}

        {/* Corner chrome */}
        <div className={styles.corner}>
          {screen === "match" && latency != null && <span className={styles.latency}>{latency} ms</span>}
          <button
            className={styles.iconBtn}
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared event → sfx/particles dispatch for both online and campaign.
function dispatchEvents(
  events: GameEvent[],
  mySeat: Seat,
  r: Renderer,
  s: SoundEngine,
  rs: RenderState | null | undefined,
) {
  for (const e of events) {
    switch (e.type) {
      case EVENT.SHOOT: {
        const mine = e.seat === mySeat;
        if (e.x != null && e.y != null && e.aim != null) r.muzzleFlash(e.x, e.y, e.aim, mine);
        s.shoot(mine);
        break;
      }
      case EVENT.HIT: {
        if (e.wall) {
          if (e.x != null && e.y != null) r.wallSpark(e.x, e.y, e.owner === mySeat);
          s.wallHit();
        } else if (e.seat) {
          const mineHit = e.seat === mySeat;
          if (e.x != null && e.y != null) r.impactBurst(e.x, e.y, e.owner === mySeat, false);
          r.triggerFlash(e.seat);
          s.hit(mineHit);
          r.addShake(mineHit ? 15 : 7);
        }
        break;
      }
      case EVENT.DEATH: {
        if (e.seat) {
          const pos = e.seat === mySeat ? rs?.me : rs?.foe;
          if (pos) r.deathBurst(pos.x, pos.y, e.seat);
          r.addShake(22);
        }
        break;
      }
      case EVENT.RELOAD_START:
        if (e.seat === mySeat) s.reloadStart();
        break;
      case EVENT.RELOAD_DONE:
        if (e.seat === mySeat) s.reloadDone();
        break;
      case EVENT.EMPTY:
        if (e.seat === mySeat) s.empty();
        break;
    }
  }
}

// Position the on-screen touch joysticks (imperative, no React churn).
function updateSticks(
  input: InputController,
  moveBase: HTMLDivElement | null,
  moveKnob: HTMLDivElement | null,
  aimBase: HTMLDivElement | null,
  aimKnob: HTMLDivElement | null,
) {
  place(moveBase, moveKnob, input.moveStick);
  place(aimBase, aimKnob, input.aimStick);
}

function place(
  base: HTMLDivElement | null,
  knob: HTMLDivElement | null,
  stick: InputController["moveStick"],
) {
  if (!base || !knob) return;
  if (!stick.active) {
    base.style.display = "none";
    knob.style.display = "none";
    return;
  }
  base.style.display = "block";
  knob.style.display = "block";
  base.style.left = `${stick.ox}px`;
  base.style.top = `${stick.oy}px`;
  const dx = stick.cx - stick.ox;
  const dy = stick.cy - stick.oy;
  const len = Math.hypot(dx, dy);
  const max = 46;
  const cl = len > max ? max / len : 1;
  knob.style.left = `${stick.ox + dx * cl}px`;
  knob.style.top = `${stick.oy + dy * cl}px`;
}
