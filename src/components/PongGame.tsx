"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Difficulty = 'easy' | 'medium' | 'hard' | 'impossible';
type Mode = 'solo' | '2player';
type ArcadeGame = 'pong' | 'invaders';
type InvaderOutcome = 'victory' | 'defeat' | null;

type UpgradeKey = 'blaster' | 'damage' | 'thrusters' | 'spread' | 'hull';

type InvaderUpgradeState = Record<UpgradeKey, number>;

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
};

type Enemy = {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
};

type EnemyBullet = {
  x: number;
  y: number;
  vy: number;
  radius: number;
};

type DiveAttacker = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hp: number;
  steer: number;
};

type Boss = {
  x: number;
  y: number;
  vx: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  shotTimer: number;
  phase: number;
};

type PowerUpKind = 'rapidfire' | 'tripleshot' | 'speed' | 'shield';

type PowerUpDrop = {
  x: number;
  y: number;
  vy: number;
  kind: PowerUpKind;
  id: number;
};

type ActiveBuff = {
  kind: PowerUpKind;
  expiresAt: number;
};

const POWERUP_COLORS: Record<PowerUpKind, string> = {
  rapidfire: '#ffe040',
  tripleshot: '#40e0ff',
  speed:      '#50ff80',
  shield:     '#8888ff',
};
const POWERUP_LABELS: Record<PowerUpKind, string> = {
  rapidfire: '⚡',
  tripleshot: '✦',
  speed:      '▶',
  shield:     '◈',
};
const POWERUP_DURATION = 6000; // ms
const POWERUP_KINDS: PowerUpKind[] = ['rapidfire', 'tripleshot', 'speed', 'shield'];
let _puIdCounter = 0;

const DIFFICULTY_SETTINGS = {
  easy:       { cpuSpeed: 6,  cpuReaction: 0.78, ballSpeed: 6,  speedGain: 0.40, maxSpeed: 17, playerSpeed: 17, playerLerp: 0.30 },
  medium:     { cpuSpeed: 8,  cpuReaction: 0.90, ballSpeed: 8,  speedGain: 0.55, maxSpeed: 23, playerSpeed: 18, playerLerp: 0.30 },
  hard:       { cpuSpeed: 11, cpuReaction: 0.97, ballSpeed: 10, speedGain: 0.70, maxSpeed: 30, playerSpeed: 20, playerLerp: 0.30 },
  impossible: { cpuSpeed: 20, cpuReaction: 1.0,  ballSpeed: 11, speedGain: 0.9,  maxSpeed: 50, playerSpeed: 26, playerLerp: 0.50 },
};

const WIN_SCORE = 5;
const COUNTDOWN_SECS = 3;

const MAX_UPGRADE_LEVEL = 6;

const UPGRADE_META: Record<UpgradeKey, { label: string; desc: string; baseCost: number; step: number }> = {
  blaster: {
    label: 'Blaster Cooling',
    desc: 'Shoot faster with tighter cooldown.',
    baseCost: 80,
    step: 55,
  },
  damage: {
    label: 'Plasma Damage',
    desc: 'Each shot hits harder.',
    baseCost: 120,
    step: 70,
  },
  thrusters: {
    label: 'Thruster Power',
    desc: 'Move your ship faster.',
    baseCost: 90,
    step: 60,
  },
  spread: {
    label: 'Spread Shot',
    desc: 'Unlock side projectiles for crowd control.',
    baseCost: 160,
    step: 95,
  },
  hull: {
    label: 'Hull Reinforcement',
    desc: 'Start runs with extra lives.',
    baseCost: 140,
    step: 85,
  },
};

const getUpgradeCost = (key: UpgradeKey, level: number): number => {
  const m = UPGRADE_META[key];
  return m.baseCost + m.step * level;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

export function PongGame() {
  const [isOpen, setIsOpen] = useState(false);
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [arcadeGame, setArcadeGame] = useState<ArcadeGame>('pong');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [mode, setMode] = useState<Mode>('solo');
  const [winner, setWinner] = useState<'player' | 'cpu' | null>(null);
  const [invaderOutcome, setInvaderOutcome] = useState<InvaderOutcome>(null);
  const [pongFinalScore, setPongFinalScore] = useState({ player: 0, cpu: 0 });
  const [invaderFinalStats, setInvaderFinalStats] = useState({ score: 0, wave: 1, coins: 0 });
  const [bankCoins, setBankCoins] = useState(0);
  const [storeOpen, setStoreOpen] = useState(false);
  const [upgrades, setUpgrades] = useState<InvaderUpgradeState>({
    blaster: 0,
    damage: 0,
    thrusters: 0,
    spread: 0,
    hull: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const storeOpenRef = useRef(false);
  const bankCoinsRef = useRef(0);
  const upgradesRef = useRef<InvaderUpgradeState>(upgrades);

  const playerRef = useRef({ x: 300, y: 0, width: 120, height: 12 });
  const cpuRef    = useRef({ x: 300, y: 40, width: 120, height: 12 });
  const ballRef   = useRef({ x: 300, y: 200, dx: 0, dy: 0, size: 50 });
  const mouseRef  = useRef(300);
  // keysRef: P1 — left/right for solo, up/down for 2P
  const keysRef   = useRef({ left: false, right: false, up: false, down: false });
  // keys2Ref: P2 — up/down arrows
  const keys2Ref  = useRef({ up: false, down: false });
  const inputModeRef = useRef<'mouse' | 'keyboard'>('mouse');
  const modeRef   = useRef<Mode>('solo');
  const countdownRef = useRef({ active: false, start: 0, pendingDx: 0, pendingDy: 0 });
  const hitCountRef    = useRef(0);
  const playerScoreRef = useRef(0);
  const cpuScoreRef    = useRef(0);

  const invPlayerRef = useRef({ x: 0, y: 0, width: 56, height: 26 });
  const invadersRef = useRef<Enemy[]>([]);
  const playerBulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<EnemyBullet[]>([]);
  const diveAttackersRef = useRef<DiveAttacker[]>([]);
  const bossRef = useRef<Boss | null>(null);
  const powerUpDropsRef = useRef<PowerUpDrop[]>([]);
  const activeBuffsRef = useRef<ActiveBuff[]>([]);
  const invaderDirectionRef = useRef(1);
  const invaderScoreRef = useRef(0);
  const invaderWaveRef = useRef(1);
  const invaderLivesRef = useRef(3);
  const runCoinsRef = useRef(0);
  const invaderKeysRef = useRef({ left: false, right: false, fire: false });
  const lastShotAtRef = useRef(0);
  const enemyShotTimerRef = useRef(0);
  const diveSpawnTimerRef = useRef(0);
  const starsRef = useRef<{ x: number; y: number; r: number; s: number }[]>([]);

  useEffect(() => {
    storeOpenRef.current = storeOpen;
  }, [storeOpen]);

  useEffect(() => {
    bankCoinsRef.current = bankCoins;
  }, [bankCoins]);

  useEffect(() => {
    upgradesRef.current = upgrades;
  }, [upgrades]);

  // Toggle overlay with P key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setIsOpen(prev => {
          if (prev) {
            setGameState('menu');
            setWinner(null);
            setInvaderOutcome(null);
            setStoreOpen(false);
            playerScoreRef.current = 0;
            cpuScoreRef.current    = 0;
          }
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const startGame = useCallback((diff: Difficulty) => {
    setArcadeGame('pong');
    setStoreOpen(false);
    modeRef.current = 'solo';
    setMode('solo');
    setDifficulty(diff);
    setGameState('playing');
    setWinner(null);
    setPongFinalScore({ player: 0, cpu: 0 });
    playerScoreRef.current = 0;
    cpuScoreRef.current    = 0;
  }, []);

  const startTwoPlayer = useCallback(() => {
    setArcadeGame('pong');
    setStoreOpen(false);
    modeRef.current = '2player';
    setMode('2player');
    setDifficulty('medium');
    setGameState('playing');
    setWinner(null);
    setPongFinalScore({ player: 0, cpu: 0 });
    playerScoreRef.current = 0;
    cpuScoreRef.current    = 0;
  }, []);

  const startInvaders = useCallback(() => {
    setArcadeGame('invaders');
    setStoreOpen(false);
    setGameState('playing');
    setInvaderOutcome(null);
    setInvaderFinalStats({ score: 0, wave: 1, coins: 0 });
    invaderScoreRef.current = 0;
    invaderWaveRef.current = 1;
    runCoinsRef.current = 0;
    invaderLivesRef.current = 3 + upgradesRef.current.hull;
    enemyShotTimerRef.current = 0;
    diveSpawnTimerRef.current = 0;
    lastShotAtRef.current = 0;
    bossRef.current = null;
    powerUpDropsRef.current = [];
    activeBuffsRef.current = [];
    invaderKeysRef.current = { left: false, right: false, fire: false };
  }, []);

  const finishPong = useCallback((nextWinner: 'player' | 'cpu') => {
    setPongFinalScore({ player: playerScoreRef.current, cpu: cpuScoreRef.current });
    setWinner(nextWinner);
    setGameState('gameover');
  }, []);

  const finishInvaders = useCallback((outcome: 'victory' | 'defeat') => {
    setInvaderFinalStats({
      score: invaderScoreRef.current,
      wave: invaderWaveRef.current,
      coins: runCoinsRef.current,
    });
    setInvaderOutcome(outcome);
    setGameState('gameover');
  }, []);

  const purchaseUpgrade = useCallback((key: UpgradeKey) => {
    setUpgrades(prev => {
      const level = prev[key];
      if (level >= MAX_UPGRADE_LEVEL) return prev;
      const price = getUpgradeCost(key, level);
      if (bankCoinsRef.current < price) return prev;

      setBankCoins(c => {
        const next = c - price;
        bankCoinsRef.current = next;
        return next;
      });

      return { ...prev, [key]: level + 1 };
    });
  }, []);

  const spawnInvaderWave = useCallback((canvas: HTMLCanvasElement) => {
    const wave = invaderWaveRef.current;

    playerBulletsRef.current = [];
    enemyBulletsRef.current = [];
    diveAttackersRef.current = [];
    diveSpawnTimerRef.current = 0;
    invaderDirectionRef.current = 1;

    // Wave 8 = final boss — no grid enemies
    if (wave >= 8) {
      invadersRef.current = [];
      const bossHp = 420;
      bossRef.current = {
        x: canvas.width / 2 - 80,
        y: 70,
        vx: 2.6,
        width: 160,
        height: 52,
        hp: bossHp,
        maxHp: bossHp,
        shotTimer: 0,
        phase: 1,
      };
      return;
    }

    bossRef.current = null;

    // Enemy count: 5 on wave 1, grows steadily
    const baseCount = 5 + (wave - 1) * 8;
    const totalEnemies = Math.min(baseCount, 80);
    const enemyW = 38;
    const enemyH = 24;
    const gapX = 12;
    const gapY = 10;

    // Compute grid dimensions that fit totalEnemies
    const cols = clamp(Math.ceil(Math.sqrt(totalEnemies * 1.6)), 5, 13);
    const rows = Math.ceil(totalEnemies / cols);

    const formationWidth = cols * enemyW + (cols - 1) * gapX;
    const startX = (canvas.width - formationWidth) / 2;
    const startY = 80;
    const hpBase = 1 + Math.floor(wave / 1.5);

    const enemies: Enemy[] = [];
    let placed = 0;
    for (let row = 0; row < rows && placed < totalEnemies; row += 1) {
      for (let col = 0; col < cols && placed < totalEnemies; col += 1) {
        enemies.push({
          x: startX + col * (enemyW + gapX),
          y: startY + row * (enemyH + gapY),
          width: enemyW,
          height: enemyH,
          hp: hpBase + (row === 0 ? 1 : 0),
        });
        placed += 1;
      }
    }

    invadersRef.current = enemies;
    powerUpDropsRef.current = [];
    activeBuffsRef.current = [];
  }, []);

  const drawInvaderStore = useCallback(() => {
    const order: UpgradeKey[] = ['blaster', 'damage', 'thrusters', 'spread', 'hull'];
    return (
      <div className="pointer-events-auto w-[min(760px,92vw)] rounded-3xl border border-zinc-700 bg-zinc-950/95 shadow-2xl flex flex-col max-h-[min(540px,88vh)]">
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-3 md:px-8 md:pt-8">
          <h3 className="text-white text-2xl font-black tracking-[0.12em] uppercase">Ship Upgrades</h3>
          <p className="text-emerald-300 text-sm tracking-widest uppercase">Coins: {bankCoins}</p>
        </div>

        <div
          className="overflow-y-auto flex-1 min-h-0 px-6 md:px-8 pb-2"
          style={{ scrollbarWidth: 'auto', scrollbarColor: '#52525b transparent' }}
          onWheel={e => e.stopPropagation()}
        >
        <div className="grid gap-3">
          {order.map((key) => {
            const meta = UPGRADE_META[key];
            const level = upgrades[key];
            const maxed = level >= MAX_UPGRADE_LEVEL;
            const price = getUpgradeCost(key, level);
            const afford = bankCoins >= price;
            return (
              <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-white text-sm font-bold tracking-wide">{meta.label}</p>
                  <p className="text-zinc-400 text-xs">{meta.desc}</p>
                  <p className="text-zinc-500 text-[11px] mt-1 uppercase tracking-widest">Level {level}/{MAX_UPGRADE_LEVEL}</p>
                </div>
                <button
                  onClick={() => purchaseUpgrade(key)}
                  disabled={maxed || !afford}
                  className="cursor-target px-4 py-2 rounded-lg border border-dashed border-zinc-600 text-xs font-bold tracking-[0.1em] uppercase text-white disabled:opacity-35 disabled:cursor-not-allowed hover:border-emerald-400 hover:bg-emerald-400/10 transition"
                >
                  {maxed ? 'Max' : `${price} C`}
                </button>
              </div>
            );
          })}
        </div>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-500 tracking-wide px-6 py-4 md:px-8 border-t border-zinc-800/60">
          <p>Earn coins by destroying invaders and clearing waves.</p>
          <button
            onClick={() => setStoreOpen(false)}
            className="cursor-target px-3 py-2 rounded-lg border border-zinc-700 hover:border-white hover:bg-white/5 text-white text-[11px] uppercase tracking-[0.12em]"
          >
            Close
          </button>
        </div>
      </div>
    );
  }, [bankCoins, purchaseUpgrade, upgrades]);

  // Hide the TargetCursor boxing effect during gameplay
  useEffect(() => {
    const cursorEl = document.querySelector('.target-cursor-wrapper') as HTMLElement | null;
    if (!cursorEl) return;
    if (isOpen && gameState === 'playing') {
      cursorEl.style.display = 'none';
    } else {
      cursorEl.style.display = '';
    }
    return () => { cursorEl.style.display = ''; };
  }, [isOpen, gameState]);

  // Game loop
  useEffect(() => {
    if (!isOpen || gameState !== 'playing') {
      document.body.style.overflow = isOpen ? 'hidden' : '';
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    document.body.style.overflow = 'hidden';

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (arcadeGame === 'invaders') {
      const resizeInvaders = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        invPlayerRef.current.width = 56;
        invPlayerRef.current.height = 26;
        invPlayerRef.current.x = canvas.width / 2 - invPlayerRef.current.width / 2;
        invPlayerRef.current.y = canvas.height - 76;

        if (starsRef.current.length === 0 || starsRef.current.length < 130) {
          starsRef.current = Array.from({ length: 140 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 1.8 + 0.4,
            s: Math.random() * 0.3 + 0.1,
          }));
        }
      };

      resizeInvaders();
      spawnInvaderWave(canvas);

      const onResize = () => {
        resizeInvaders();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'arrowleft' || key === 'a') {
          invaderKeysRef.current.left = true;
          e.preventDefault();
        }
        if (key === 'arrowright' || key === 'd') {
          invaderKeysRef.current.right = true;
          e.preventDefault();
        }
        if (key === ' ' || key === 'spacebar') {
          invaderKeysRef.current.fire = true;
          e.preventDefault();
        }
        if (key === 'b') {
          setStoreOpen(prev => !prev);
          e.preventDefault();
        }
      };

      const onKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if (key === 'arrowleft' || key === 'a') invaderKeysRef.current.left = false;
        if (key === 'arrowright' || key === 'd') invaderKeysRef.current.right = false;
        if (key === ' ' || key === 'spacebar') invaderKeysRef.current.fire = false;
      };

      const onBlur = () => {
        invaderKeysRef.current.left = false;
        invaderKeysRef.current.right = false;
        invaderKeysRef.current.fire = false;
      };

      window.addEventListener('resize', onResize);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);

      let prevFrame = performance.now();

      const firePlayerShot = (now: number) => {
        const ship = invPlayerRef.current;
        const up = upgradesRef.current;
        const buffs = activeBuffsRef.current;
        const hasRapid = buffs.some(b => b.kind === 'rapidfire' && b.expiresAt > now);
        const hasTriple = buffs.some(b => b.kind === 'tripleshot' && b.expiresAt > now);
        const cooldown = Math.max(60, (340 - up.blaster * 26) * (hasRapid ? 0.3 : 1));
        if (now - lastShotAtRef.current < cooldown) return;
        lastShotAtRef.current = now;

        const baseDamage = 1 + up.damage * 0.8;
        const mainSpeed = 8.4 + up.blaster * 0.35;
        const baseBullet: Bullet = {
          x: ship.x + ship.width / 2,
          y: ship.y,
          vx: 0,
          vy: -mainSpeed,
          radius: 4,
          damage: baseDamage,
        };

        playerBulletsRef.current.push(baseBullet);

        const wantTriple = up.spread >= 2 || hasTriple;
        const wantFive   = up.spread >= 5;
        if (wantTriple) {
          playerBulletsRef.current.push({ ...baseBullet, vx: -1.4, radius: 3.5 });
          playerBulletsRef.current.push({ ...baseBullet, vx:  1.4, radius: 3.5 });
        }
        if (wantFive) {
          playerBulletsRef.current.push({ ...baseBullet, vx: -2.4, radius: 3 });
          playerBulletsRef.current.push({ ...baseBullet, vx:  2.4, radius: 3 });
        }
      };

      const loopInvaders = () => {
        const now = performance.now();
        const delta = Math.min(40, now - prevFrame);
        prevFrame = now;
        const dt = delta / 16.666;

        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const bg = ctx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, '#05070f');
        bg.addColorStop(1, '#0c1222');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        const stars = starsRef.current;
        ctx.fillStyle = 'rgba(180,200,255,0.6)';
        for (let i = 0; i < stars.length; i += 1) {
          const star = stars[i];
          star.y += star.s * dt;
          if (star.y > height) {
            star.y = 0;
            star.x = Math.random() * width;
          }
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (storeOpenRef.current) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(0, 0, width, height);
          requestRef.current = requestAnimationFrame(loopInvaders);
          return;
        }

        const up = upgradesRef.current;
        const ship = invPlayerRef.current;
        const buffsNow = activeBuffsRef.current.filter(b => b.expiresAt > now);
        activeBuffsRef.current = buffsNow;
        const hasSpeed  = buffsNow.some(b => b.kind === 'speed');
        const hasShield = buffsNow.some(b => b.kind === 'shield');
        const shipSpeed = (5.7 + up.thrusters * 0.75) * (hasSpeed ? 1.7 : 1);

        if (invaderKeysRef.current.left) ship.x -= shipSpeed * dt;
        if (invaderKeysRef.current.right) ship.x += shipSpeed * dt;
        ship.x = clamp(ship.x, 20, width - ship.width - 20);

        if (invaderKeysRef.current.fire) {
          firePlayerShot(now);
        }

        const bullets = playerBulletsRef.current;
        for (let i = bullets.length - 1; i >= 0; i -= 1) {
          bullets[i].x += bullets[i].vx * dt;
          bullets[i].y += bullets[i].vy * dt;
          if (bullets[i].y < -20 || bullets[i].x < -20 || bullets[i].x > width + 20) {
            bullets.splice(i, 1);
          }
        }

        // ── Boss logic ──
        const wave = invaderWaveRef.current;
        const boss = bossRef.current;
        if (boss) {
          boss.phase = boss.hp <= boss.maxHp * 0.5 ? 2 : 1;
          const bossSpeed = (2.8 + wave * 0.3 + (boss.phase === 2 ? 1.6 : 0)) * dt;
          boss.x += boss.vx * bossSpeed;
          if (boss.x <= 0 || boss.x + boss.width >= width) boss.vx *= -1;

          // Boss shoots spread bursts
          boss.shotTimer += delta;
          const bossShotInterval = boss.phase === 2 ? 320 : 560;
          if (boss.shotTimer >= bossShotInterval) {
            boss.shotTimer = 0;
            const cx = boss.x + boss.width / 2;
            const cy = boss.y + boss.height;
            const bulletCount = boss.phase === 2 ? 5 : 3;
            for (let s = 0; s < bulletCount; s += 1) {
              const spread = ((s - Math.floor(bulletCount / 2)) / Math.floor(bulletCount / 2)) * 3.5;
              enemyBulletsRef.current.push({
                x: cx,
                y: cy,
                vy: 5.5 + Math.abs(spread) * 0.4,
                radius: 5.5,
              });
              // Mutate the last-pushed bullet's vx via a cast since EnemyBullet lacks vx —
              // add vx directly to the object at runtime for boss bullets only
              (enemyBulletsRef.current[enemyBulletsRef.current.length - 1] as EnemyBullet & { vx?: number }).vx = spread;
            }
          }

          // Check player bullets vs boss
          for (let b = bullets.length - 1; b >= 0; b -= 1) {
            const bullet = bullets[b];
            if (
              bullet.x > boss.x &&
              bullet.x < boss.x + boss.width &&
              bullet.y > boss.y &&
              bullet.y < boss.y + boss.height
            ) {
              boss.hp -= bullet.damage;
              bullets.splice(b, 1);
              if (boss.hp <= 0) {
                bossRef.current = null;
                invaderScoreRef.current += 2000;
                const bossEarn = 350;
                runCoinsRef.current += bossEarn;
                setBankCoins(c => { const next = c + bossEarn; bankCoinsRef.current = next; return next; });
                finishInvaders('victory');
                return;
              }
            }
          }

          // Boss dive-ram into player
          if (
            boss.x < ship.x + ship.width + 16 &&
            boss.x + boss.width > ship.x - 16 &&
            boss.y + boss.height > ship.y - 16
          ) {
            invaderLivesRef.current -= 1;
            if (invaderLivesRef.current <= 0) { finishInvaders('defeat'); return; }
            bossRef.current = null;
            finishInvaders('defeat');
            return;
          }
        }

        const enemies = invadersRef.current;
        if (!boss && enemies.length === 0 && diveAttackersRef.current.length === 0) {
          invaderWaveRef.current += 1;
          const waveBonus = 80 + invaderWaveRef.current * 20;
          runCoinsRef.current += waveBonus;
          setBankCoins(c => {
            const next = c + waveBonus;
            bankCoinsRef.current = next;
            return next;
          });

          spawnInvaderWave(canvas);
        }

        const wavePressure = 1 + Math.max(0, wave - 1) * 0.2;
        const lateWaveBoost = wave >= 4 ? 1 + (wave - 3) * 0.18 : 1;
        const enemySpeed = (0.62 + wave * 0.17) * wavePressure * lateWaveBoost * dt;
        let touchEdge = false;

        for (let i = 0; i < enemies.length; i += 1) {
          enemies[i].x += enemySpeed * invaderDirectionRef.current;
          if (enemies[i].x <= 24 || enemies[i].x + enemies[i].width >= width - 24) {
            touchEdge = true;
          }
        }

        if (touchEdge) {
          invaderDirectionRef.current *= -1;
          const dropDistance = 20 + wave * 3;
          for (let i = 0; i < enemies.length; i += 1) {
            enemies[i].y += dropDistance;
            if (enemies[i].y + enemies[i].height >= ship.y - 6) {
              finishInvaders('defeat');
              return;
            }
          }
        }

        for (let b = bullets.length - 1; b >= 0; b -= 1) {
          const bullet = bullets[b];
          let consumed = false;
          for (let e = enemies.length - 1; e >= 0; e -= 1) {
            const enemy = enemies[e];
            if (
              bullet.x > enemy.x &&
              bullet.x < enemy.x + enemy.width &&
              bullet.y > enemy.y &&
              bullet.y < enemy.y + enemy.height
            ) {
              enemy.hp -= bullet.damage;
              consumed = true;

              if (enemy.hp <= 0) {
                const earn = 12 + invaderWaveRef.current * 4;
                invaderScoreRef.current += 100;
                runCoinsRef.current += earn;
                setBankCoins(c => {
                  const next = c + earn;
                  bankCoinsRef.current = next;
                  return next;
                });
                // 22% chance to drop a power-up
                if (Math.random() < 0.22) {
                  const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
                  powerUpDropsRef.current.push({
                    x: enemy.x + enemy.width / 2,
                    y: enemy.y + enemy.height / 2,
                    vy: 1.8,
                    kind,
                    id: ++_puIdCounter,
                  });
                }
                enemies.splice(e, 1);
              }
              break;
            }
          }
          if (consumed) bullets.splice(b, 1);
        }

        // ── Power-up drops ──
        const drops = powerUpDropsRef.current;
        for (let i = drops.length - 1; i >= 0; i -= 1) {
          const drop = drops[i];
          drop.y += drop.vy * dt;

          // Collect
          if (
            drop.x > ship.x - 18 &&
            drop.x < ship.x + ship.width + 18 &&
            drop.y > ship.y - 18 &&
            drop.y < ship.y + ship.height + 18
          ) {
            drops.splice(i, 1);
            if (drop.kind === 'shield') {
              // Shield: push with long TTL — consumed on first bullet hit
              activeBuffsRef.current.push({ kind: 'shield', expiresAt: now + 30000 });
            } else {
              activeBuffsRef.current.push({ kind: drop.kind, expiresAt: now + POWERUP_DURATION });
            }
            continue;
          }

          if (drop.y > height + 40) drops.splice(i, 1);
        }

        enemyShotTimerRef.current += delta;
        diveSpawnTimerRef.current += delta;
        const alive = invadersRef.current;
        const densityFactor = Math.max(0.64, alive.length / 88);
        const shootInterval = Math.max(
          110,
          (820 - wave * 105 - Math.max(0, wave - 3) * 70) * densityFactor,
        );
        const diveInterval = Math.max(260, 1700 - wave * 170 - Math.max(0, wave - 4) * 100);

        if (alive.length > 0 && enemyShotTimerRef.current >= shootInterval) {
          enemyShotTimerRef.current = 0;

          const candidates = alive
            .slice()
            .sort((a, b) => a.x - b.x)
            .filter((enemy, idx, arr) => {
              const sameColumnFront = arr.some(other => Math.abs(other.x - enemy.x) < 12 && other.y > enemy.y);
              return !sameColumnFront;
            });

          const shooterPool = candidates.length > 0 ? candidates : alive;
          const shooter = shooterPool[Math.floor(Math.random() * shooterPool.length)];
          enemyBulletsRef.current.push({
            x: shooter.x + shooter.width / 2,
            y: shooter.y + shooter.height,
            vy: 5.3 + wave * 0.7 + Math.max(0, wave - 4) * 0.4,
            radius: 4.5,
          });
        }

        if (alive.length > 0 && diveSpawnTimerRef.current >= diveInterval) {
          diveSpawnTimerRef.current = 0;
          const diveCount = wave >= 6 ? 2 : 1;

          for (let n = 0; n < diveCount; n += 1) {
            if (alive.length === 0) break;
            const shipCenter = ship.x + ship.width / 2;

            let pickIndex = 0;
            let bestDist = Number.POSITIVE_INFINITY;
            for (let i = 0; i < alive.length; i += 1) {
              const dist = Math.abs(alive[i].x + alive[i].width / 2 - shipCenter);
              if (dist < bestDist) {
                bestDist = dist;
                pickIndex = i;
              }
            }

            const picked = alive.splice(pickIndex, 1)[0];
            const px = picked.x + picked.width / 2;
            const py = picked.y + picked.height;
            const dx = shipCenter - px;

            diveAttackersRef.current.push({
              x: px,
              y: py,
              vx: clamp(dx * 0.012, -3.4, 3.4),
              vy: 5.8 + wave * 0.8,
              size: 14,
              hp: Math.max(1, Math.ceil(picked.hp * 0.75)),
              steer: 0.22 + wave * 0.03,
            });
          }
        }

        const eBullets = enemyBulletsRef.current;
        for (let i = eBullets.length - 1; i >= 0; i -= 1) {
          const shot = eBullets[i];
          const shotVx = (shot as EnemyBullet & { vx?: number }).vx ?? 0;
          shot.x = (shot.x ?? 0) + shotVx * dt;
          shot.y += shot.vy * dt;

          if (
            shot.x > ship.x &&
            shot.x < ship.x + ship.width &&
            shot.y > ship.y &&
            shot.y < ship.y + ship.height
          ) {
            eBullets.splice(i, 1);
            // Shield absorbs one bullet
            const shieldIdx = activeBuffsRef.current.findIndex(b => b.kind === 'shield');
            if (shieldIdx !== -1) {
              activeBuffsRef.current.splice(shieldIdx, 1);
              continue;
            }
            invaderLivesRef.current -= 1;
            if (invaderLivesRef.current <= 0) {
              finishInvaders('defeat');
              return;
            }
            continue;
          }

          if (shot.y > height + 30) eBullets.splice(i, 1);
        }

        const divers = diveAttackersRef.current;
        for (let d = divers.length - 1; d >= 0; d -= 1) {
          const diver = divers[d];
          const shipCenter = ship.x + ship.width / 2;
          diver.vx += clamp((shipCenter - diver.x) * 0.0032 * diver.steer, -0.22, 0.22) * dt;
          diver.vx = clamp(diver.vx, -8.4, 8.4);
          diver.vy = Math.min(diver.vy + 0.05 * dt, 10.5 + wave * 0.7);

          diver.x += diver.vx * dt;
          diver.y += diver.vy * dt;

          for (let b = bullets.length - 1; b >= 0; b -= 1) {
            const bullet = bullets[b];
            if (
              bullet.x > diver.x - diver.size &&
              bullet.x < diver.x + diver.size &&
              bullet.y > diver.y - diver.size &&
              bullet.y < diver.y + diver.size
            ) {
              diver.hp -= bullet.damage;
              bullets.splice(b, 1);
              if (diver.hp <= 0) {
                divers.splice(d, 1);
                invaderScoreRef.current += 180;
                const diveEarn = 18 + wave * 5;
                runCoinsRef.current += diveEarn;
                setBankCoins(c => {
                  const next = c + diveEarn;
                  bankCoinsRef.current = next;
                  return next;
                });
                break;
              }
            }
          }

          if (!divers[d]) continue;

          const hitShip =
            diver.x > ship.x - diver.size &&
            diver.x < ship.x + ship.width + diver.size &&
            diver.y > ship.y - diver.size &&
            diver.y < ship.y + ship.height + diver.size;

          if (hitShip) {
            divers.splice(d, 1);
            finishInvaders('defeat');
            return;
          }

          if (diver.y > height + 50 || diver.x < -60 || diver.x > width + 60) {
            divers.splice(d, 1);
          }
        }

        ctx.save();
        ctx.fillStyle = '#5ce8ff';
        ctx.beginPath();
        ctx.moveTo(ship.x + ship.width / 2, ship.y - 12);
        ctx.lineTo(ship.x + ship.width, ship.y + ship.height);
        ctx.lineTo(ship.x, ship.y + ship.height);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(ship.x + ship.width / 2 - 5, ship.y + 4, 10, 9);
        ctx.restore();

        for (let i = 0; i < bullets.length; i += 1) {
          const bullet = bullets[i];
          ctx.fillStyle = '#8ef9a8';
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        for (let i = 0; i < eBullets.length; i += 1) {
          const bullet = eBullets[i];
          ctx.fillStyle = '#ff6e8c';
          ctx.beginPath();
          ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        const diversToDraw = diveAttackersRef.current;
        for (let i = 0; i < diversToDraw.length; i += 1) {
          const diver = diversToDraw[i];
          ctx.fillStyle = '#ff4466';
          ctx.beginPath();
          ctx.moveTo(diver.x, diver.y + diver.size);
          ctx.lineTo(diver.x + diver.size * 0.8, diver.y - diver.size);
          ctx.lineTo(diver.x - diver.size * 0.8, diver.y - diver.size);
          ctx.closePath();
          ctx.fill();
        }

        // Draw boss
        const bossDrawn = bossRef.current;
        if (bossDrawn) {
          const bx = bossDrawn.x;
          const by = bossDrawn.y;
          const bw = bossDrawn.width;
          const bh = bossDrawn.height;
          const hpPct = bossDrawn.hp / bossDrawn.maxHp;
          const isPhase2 = bossDrawn.phase === 2;

          ctx.fillStyle = isPhase2 ? '#ff2244' : '#cc2266';
          ctx.fillRect(bx, by, bw, bh);

          // Eyes
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(bx + 22, by + 12, 16, 14);
          ctx.fillRect(bx + bw - 38, by + 12, 16, 14);
          ctx.fillStyle = '#111';
          ctx.fillRect(bx + 28, by + 15, 8, 8);
          ctx.fillRect(bx + bw - 32, by + 15, 8, 8);

          // HP bar
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(bx, by + bh + 6, bw, 7);
          ctx.fillStyle = isPhase2 ? '#ff4422' : '#22ff88';
          ctx.fillRect(bx, by + bh + 6, bw * hpPct, 7);

          // Label
          ctx.fillStyle = isPhase2 ? '#ff6688' : '#ff99aa';
          ctx.font = `700 ${isPhase2 ? 13 : 11}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(isPhase2 ? '⚠ FINAL BOSS — PHASE 2' : 'FINAL BOSS', bx + bw / 2, by - 8);
          ctx.textAlign = 'left';
        }

        for (let i = 0; i < enemies.length; i += 1) {
          const enemy = enemies[i];
          const tone = clamp(250 - enemy.hp * 22, 90, 250);
          ctx.fillStyle = `rgb(${tone}, ${Math.max(80, tone - 70)}, 110)`;
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(enemy.x + 6, enemy.y + 6, 6, 6);
          ctx.fillRect(enemy.x + enemy.width - 12, enemy.y + 6, 6, 6);
        }

        // Draw power-up drops
        for (let i = 0; i < drops.length; i += 1) {
          const drop = drops[i];
          const col = POWERUP_COLORS[drop.kind];
          const pulse = 0.7 + 0.3 * Math.sin(now * 0.005 + i);
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(drop.x, drop.y, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(POWERUP_LABELS[drop.kind], drop.x, drop.y);
          ctx.textBaseline = 'alphabetic';
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '700 14px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Score ${invaderScoreRef.current}`, 22, 34);
        ctx.fillText(`Wave ${invaderWaveRef.current}/8`, 22, 56);
        ctx.fillText(`Lives ${invaderLivesRef.current}`, 22, 78);
        ctx.fillStyle = hasShield ? '#8888ff' : '#79ffa1';
        ctx.fillText(hasShield ? `Coins +${runCoinsRef.current}  🛡 SHIELDED` : `Coins +${runCoinsRef.current}`, 22, 100);
        ctx.fillStyle = '#ff6f86';
        ctx.fillText(`Divers ${diveAttackersRef.current.length}`, 22, 122);

        // Active buff icons (top-right)
        if (buffsNow.length > 0) {
          ctx.font = 'bold 12px system-ui, sans-serif';
          ctx.textAlign = 'right';
          let bY = 36;
          for (let i = 0; i < buffsNow.length; i += 1) {
            const buff = buffsNow[i];
            const remaining = Math.max(0, (buff.expiresAt - now) / 1000);
            ctx.fillStyle = POWERUP_COLORS[buff.kind];
            const label = buff.kind === 'shield' ? `${POWERUP_LABELS[buff.kind]} SHIELD` :
              `${POWERUP_LABELS[buff.kind]} ${buff.kind.toUpperCase()} ${remaining.toFixed(1)}s`;
            ctx.fillText(label, width - 22, bY);
            bY += 20;
          }
          ctx.textAlign = 'left';
        }

        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'right';
        ctx.fillText('Move: A/D or <- ->  Fire: Hold SPACE  Store: B  Exit: P', width - 22, height - 18);

        requestRef.current = requestAnimationFrame(loopInvaders);
      };

      requestRef.current = requestAnimationFrame(loopInvaders);

      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
      };
    }

    const img = new window.Image();
    img.src = '/profile.jpg';

    const settings = DIFFICULTY_SETTINGS[difficulty];
    modeRef.current = mode;
    const is2P = mode === '2player';

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (is2P) {
        // Vertical paddles on left/right sides
        playerRef.current.width  = 12;
        playerRef.current.height = 100;
        cpuRef.current.width     = 12;
        cpuRef.current.height    = 100;
        playerRef.current.x = 40;
        playerRef.current.y = canvas.height / 2 - 50;
        cpuRef.current.x    = canvas.width - 52;
        cpuRef.current.y    = canvas.height / 2 - 50;
      } else {
        playerRef.current.width  = 120;
        playerRef.current.height = 12;
        cpuRef.current.width     = 120;
        cpuRef.current.height    = 12;
        playerRef.current.y = canvas.height - 60;
        cpuRef.current.y    = 48;
        mouseRef.current    = canvas.width / 2;
      }
    };
    window.addEventListener('resize', resize);
    resize();

    if (!is2P) {
      playerRef.current.x = canvas.width / 2 - playerRef.current.width / 2;
      cpuRef.current.x    = canvas.width / 2 - cpuRef.current.width  / 2;
    }

    hitCountRef.current = 0;

    const ball = ballRef.current;
    ball.x  = canvas.width / 2;
    ball.y  = canvas.height / 2;
    ball.dx = 0;
    ball.dy = 0;

    const initSpd = is2P ? 12 : settings.ballSpeed;
    if (is2P) {
      // ±20° from horizontal so ball heads toward a paddle, not the corners
      const angle = (Math.random() - 0.5) * (Math.PI / 4.5);
      countdownRef.current = {
        active: true,
        start:  performance.now(),
        pendingDx: initSpd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1),
        pendingDy: initSpd * Math.sin(angle),
      };
    } else {
      // ±25° from vertical so ball heads toward a paddle, not the corners
      const angle = (Math.random() - 0.5) * (Math.PI / 3.6);
      countdownRef.current = {
        active: true,
        start:  performance.now(),
        pendingDx: initSpd * Math.sin(angle),
        pendingDy: initSpd * Math.cos(angle),
      };
    }

    const handleMouse = (e: MouseEvent) => {
      if (modeRef.current === '2player') return;
      mouseRef.current   = e.clientX;
      inputModeRef.current = 'mouse';
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Solo mode — horizontal movement
      if (e.key === 'ArrowLeft')           { keysRef.current.left  = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
      if (e.key === 'ArrowRight')          { keysRef.current.right = true; inputModeRef.current = 'keyboard'; e.preventDefault(); }
      // 2P P1 — W/S vertical
      if (e.key === 'w' || e.key === 'W') { keysRef.current.up    = true; e.preventDefault(); }
      if (e.key === 's' || e.key === 'S') { keysRef.current.down  = true; e.preventDefault(); }
      // 2P P2 — arrow up/down vertical
      if (e.key === 'ArrowUp')             { keys2Ref.current.up   = true; e.preventDefault(); }
      if (e.key === 'ArrowDown')           { keys2Ref.current.down = true; e.preventDefault(); }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')           keysRef.current.left  = false;
      if (e.key === 'ArrowRight')          keysRef.current.right = false;
      if (e.key === 'w' || e.key === 'W') keysRef.current.up    = false;
      if (e.key === 's' || e.key === 'S') keysRef.current.down  = false;
      if (e.key === 'ArrowUp')             keys2Ref.current.up   = false;
      if (e.key === 'ArrowDown')           keys2Ref.current.down = false;
    };

    const handleBlur = () => {
      keysRef.current.left  = false;
      keysRef.current.right = false;
      keysRef.current.up    = false;
      keysRef.current.down  = false;
      keys2Ref.current.up   = false;
      keys2Ref.current.down = false;
    };

    window.addEventListener('mousemove', handleMouse);
    window.addEventListener('keydown',   handleKeyDown);
    window.addEventListener('keyup',     handleKeyUp);
    window.addEventListener('blur',      handleBlur);

    const resetBall = () => {
      hitCountRef.current = 0;
      ball.x  = canvas.width  / 2;
      ball.y  = canvas.height / 2;
      ball.dx = 0;
      ball.dy = 0;
      const spd = modeRef.current === '2player' ? 12 : settings.ballSpeed;
      if (modeRef.current === '2player') {
        const angle = (Math.random() - 0.5) * (Math.PI / 4.5);
        countdownRef.current = {
          active: true,
          start:  performance.now(),
          pendingDx: spd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1),
          pendingDy: spd * Math.sin(angle),
        };
      } else {
        const angle = (Math.random() - 0.5) * (Math.PI / 3.6);
        countdownRef.current = {
          active: true,
          start:  performance.now(),
          pendingDx: spd * Math.sin(angle),
          pendingDy: spd * Math.cos(angle) * (Math.random() > 0.5 ? 1 : -1),
        };
      }
    };

    const checkPaddleCollision = (
      px: number, py: number, pw: number, ph: number, goingToward: boolean
    ): boolean => {
      if (!goingToward) return false;
      const ballR    = ball.size / 2;
      const closestX = Math.max(px, Math.min(ball.x, px + pw));
      const closestY = Math.max(py, Math.min(ball.y, py + ph));
      const distX    = ball.x - closestX;
      const distY    = ball.y - closestY;
      return (distX * distX + distY * distY) <= (ballR * ballR);
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const player = playerRef.current;
      const cpu    = cpuRef.current;
      const cd     = countdownRef.current;

      // Resolve countdown — apply velocity when time expires
      if (cd.active) {
        const elapsed = (performance.now() - cd.start) / 1000;
        if (elapsed >= COUNTDOWN_SECS) {
          ball.dx  = cd.pendingDx;
          ball.dy  = cd.pendingDy;
          cd.active = false;
        }
      }

      const pSpd = modeRef.current === '2player' ? 20 : settings.playerSpeed;

      if (modeRef.current === '2player') {
        // P1 (left paddle) — W/S keys, vertical movement
        if (keysRef.current.up)        player.y -= pSpd;
        else if (keysRef.current.down) player.y += pSpd;
        player.y = Math.max(0, Math.min(player.y, canvas.height - player.height));

        // P2 (right paddle) — arrow up/down, vertical movement
        if (keys2Ref.current.up)        cpu.y -= pSpd;
        else if (keys2Ref.current.down) cpu.y += pSpd;
        cpu.y = Math.max(0, Math.min(cpu.y, canvas.height - cpu.height));
      } else {
        // P1 (bottom paddle) — arrows or mouse, horizontal movement
        if (keysRef.current.left)       player.x -= pSpd;
        else if (keysRef.current.right) player.x += pSpd;
        else if (inputModeRef.current === 'mouse')
          player.x += (mouseRef.current - player.width / 2 - player.x) * settings.playerLerp;
        player.x = Math.max(0, Math.min(player.x, canvas.width - player.width));

        // CPU AI (top paddle)
        const cpuCenter = cpu.x + cpu.width / 2;
        if (difficulty === 'impossible') {
          const dynCpuSpeed = settings.cpuSpeed + hitCountRef.current * 0.5;
          if (cpuCenter < ball.x - 4) cpu.x += dynCpuSpeed;
          else if (cpuCenter > ball.x + 4) cpu.x -= dynCpuSpeed;
        } else if (ball.dy < 0) {
          const target = ball.x + (Math.random() - 0.5) * (1 - settings.cpuReaction) * 80;
          if (cpuCenter < target - 8) cpu.x += settings.cpuSpeed;
          else if (cpuCenter > target + 8) cpu.x -= settings.cpuSpeed;
        } else {
          const center = canvas.width / 2 - cpu.width / 2;
          if (cpu.x < center - 5) cpu.x += settings.cpuSpeed * 0.3;
          else if (cpu.x > center + 5) cpu.x -= settings.cpuSpeed * 0.3;
        }
        cpu.x = Math.max(0, Math.min(cpu.x, canvas.width - cpu.width));
      }

      // Ball movement
      ball.x += ball.dx;
      ball.y += ball.dy;

      const curSpeedGain = modeRef.current === '2player' ? 0.9 : settings.speedGain;
      const curMaxSpeed  = modeRef.current === '2player' ? 40  : settings.maxSpeed;

      if (modeRef.current === '2player') {
        // Top/bottom walls bounce
        if (ball.y < ball.size / 2)                  { ball.dy = Math.abs(ball.dy);  ball.y = ball.size / 2; }
        if (ball.y > canvas.height - ball.size / 2)  { ball.dy = -Math.abs(ball.dy); ball.y = canvas.height - ball.size / 2; }

        // Left paddle (P1) collision — ball moving left
        if (checkPaddleCollision(player.x, player.y, player.width, player.height, ball.dx < 0)) {
          const hitPoint = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.cos(angle) * speed;
          ball.dy = Math.sin(angle) * speed;
          ball.x  = player.x + player.width + ball.size / 2;
        }

        // Right paddle (P2) collision — ball moving right
        if (checkPaddleCollision(cpu.x, cpu.y, cpu.width, cpu.height, ball.dx > 0)) {
          const hitPoint = (ball.y - (cpu.y + cpu.height / 2)) / (cpu.height / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = -Math.cos(angle) * speed;
          ball.dy = Math.sin(angle) * speed;
          ball.x  = cpu.x - ball.size / 2;
        }

        // Scoring — ball exits left (P2 scores) or right (P1 scores)
        if (ball.x > canvas.width + ball.size) {
          playerScoreRef.current += 1;
          if (playerScoreRef.current >= WIN_SCORE) { finishPong('player'); return; }
          resetBall();
        }
        if (ball.x < -ball.size) {
          cpuScoreRef.current += 1;
          if (cpuScoreRef.current >= WIN_SCORE) { finishPong('cpu'); return; }
          resetBall();
        }
      } else {
        // Left/right walls bounce (solo mode)
        if (ball.x < ball.size / 2)                  { ball.dx = Math.abs(ball.dx);  ball.x = ball.size / 2; }
        if (ball.x > canvas.width - ball.size / 2)   { ball.dx = -Math.abs(ball.dx); ball.x = canvas.width - ball.size / 2; }

        // P1 paddle collision (bottom)
        if (checkPaddleCollision(player.x, player.y, player.width, player.height, ball.dy > 0)) {
          const hitPoint = (ball.x - (player.x + player.width / 2)) / (player.width / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          if (difficulty === 'impossible') {
            const rampGain = curSpeedGain + hitCountRef.current * 0.25;
            const rampMax  = curMaxSpeed  + hitCountRef.current * 3;
            speed = Math.min(speed + rampGain, rampMax);
            hitCountRef.current += 1;
          } else {
            speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          }
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed;
          ball.dy = -Math.cos(angle) * speed;
          ball.y  = player.y - ball.size / 2;
        }

        // Top paddle collision (CPU)
        if (checkPaddleCollision(cpu.x, cpu.y, cpu.width, cpu.height, ball.dy < 0)) {
          const hitPoint = (ball.x - (cpu.x + cpu.width / 2)) / (cpu.width / 2);
          let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
          if (difficulty === 'impossible') {
            const rampGain = curSpeedGain + hitCountRef.current * 0.25;
            const rampMax  = curMaxSpeed  + hitCountRef.current * 3;
            speed = Math.min(speed + rampGain, rampMax);
            hitCountRef.current += 1;
          } else {
            speed = Math.min(speed + curSpeedGain, curMaxSpeed);
          }
          const angle = hitPoint * (Math.PI / 3);
          ball.dx = Math.sin(angle) * speed;
          ball.dy = Math.cos(angle) * speed;
          ball.y  = cpu.y + cpu.height + ball.size / 2;
        }

        // Scoring — ball exits bottom (CPU scores) or top (player scores)
        if (ball.y > canvas.height + ball.size) {
          cpuScoreRef.current += 1;
          if (cpuScoreRef.current >= WIN_SCORE) { finishPong('cpu'); return; }
          resetBall();
        }
        if (ball.y < -ball.size) {
          playerScoreRef.current += 1;
          if (playerScoreRef.current >= WIN_SCORE) { finishPong('player'); return; }
          resetBall();
        }
      }

      // ── Draw ──

      // Center line — vertical for 2P, horizontal for solo
      ctx.setLineDash([8, 12]);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      if (modeRef.current === '2player') {
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
      } else {
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Ball
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (img.complete) {
        ctx.drawImage(img, ball.x - ball.size / 2, ball.y - ball.size / 2, ball.size, ball.size);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.restore();

      // P1 paddle
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(player.x, player.y, player.width, player.height, 6);
      ctx.fill();

      // P2 / CPU paddle
      ctx.fillStyle = modeRef.current === '2player' ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.roundRect(cpu.x, cpu.y, cpu.width, cpu.height, 6);
      ctx.fill();

      // Scores
      ctx.fillStyle    = 'rgba(255,255,255,0.2)';
      ctx.font         = '700 80px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'alphabetic';
      if (modeRef.current === '2player') {
        // P1 score left half, P2 score right half
        ctx.fillText(`${playerScoreRef.current}`, canvas.width / 4,     canvas.height / 2 + 40);
        ctx.fillText(`${cpuScoreRef.current}`,    canvas.width * 3 / 4, canvas.height / 2 + 40);
      } else {
        ctx.fillText(`${cpuScoreRef.current}`,    canvas.width / 2, canvas.height / 2 - 30);
        ctx.fillText(`${playerScoreRef.current}`, canvas.width / 2, canvas.height / 2 + 90);
      }

      // 2P control hints — shown near each paddle
      if (modeRef.current === '2player') {
        ctx.fillStyle    = 'rgba(255,255,255,0.22)';
        ctx.font         = '500 11px system-ui, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign    = 'left';
        ctx.fillText('P1  ·  W / S', player.x + player.width + 10, canvas.height / 2);
        ctx.textAlign    = 'right';
        ctx.fillText('P2  ·  ↑ / ↓', cpu.x - 10, canvas.height / 2);
      }

      // Countdown overlay
      if (cd.active) {
        const elapsed = (performance.now() - cd.start) / 1000;
        const num     = COUNTDOWN_SECS - Math.floor(elapsed);
        const pulse   = 1 - (elapsed % 1);
        ctx.save();
        ctx.font         = '700 100px system-ui, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = `rgba(255,255,255,${0.2 + 0.5 * pulse})`;
        const countdownY = canvas.height * 0.2;
        ctx.fillText(String(num), canvas.width / 2, countdownY);
        ctx.restore();
      }

      // Impossible rally counter
      if (difficulty === 'impossible' && hitCountRef.current > 0) {
        const heat = Math.min(hitCountRef.current / 10, 1);
        const r = Math.round(239);
        const g = Math.round(68  * (1 - heat));
        const b = Math.round(68  * (1 - heat));
        ctx.save();
        ctx.font         = `700 ${13 + hitCountRef.current}px system-ui, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle    = `rgba(${r},${g},${b},${0.4 + 0.4 * heat})`;
        ctx.fillText(`× ${hitCountRef.current}`, canvas.width / 2, canvas.height * 0.25 + 60);
        ctx.restore();
      }

      // Mode / difficulty label (bottom-left)
      ctx.fillStyle    = difficulty === 'impossible' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.2)';
      ctx.font         = '600 11px system-ui, sans-serif';
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(modeRef.current === '2player' ? '2P' : difficulty.toUpperCase(), 20, canvas.height - 16);

      // Exit hint
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font      = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText("'P' to exit", canvas.width - 20, canvas.height - 16);

      // Win target
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.font      = '500 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`First to ${WIN_SCORE}`, canvas.width / 2, canvas.height - 16);

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize',    resize);
      window.removeEventListener('mousemove', handleMouse);
      window.removeEventListener('keydown',   handleKeyDown);
      window.removeEventListener('keyup',     handleKeyUp);
      window.removeEventListener('blur',      handleBlur);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isOpen, gameState, difficulty, mode, arcadeGame, spawnInvaderWave, finishInvaders, finishPong]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center">

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="flex flex-col items-center gap-8 w-full px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setArcadeGame('pong')}
              className={`cursor-target px-5 py-2 rounded-lg border text-xs font-bold tracking-[0.12em] uppercase transition ${
                arcadeGame === 'pong' ? 'border-white text-white bg-white/10' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              Pong
            </button>
            <button
              onClick={() => setArcadeGame('invaders')}
              className={`cursor-target px-5 py-2 rounded-lg border text-xs font-bold tracking-[0.12em] uppercase transition ${
                arcadeGame === 'invaders' ? 'border-emerald-300 text-emerald-300 bg-emerald-300/10' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              Space Invaders
            </button>
          </div>

          {arcadeGame === 'pong' && (
            <>
              <h2 className="text-white text-4xl font-black tracking-[0.2em] uppercase">Pong</h2>

              <div className="flex flex-col items-center gap-4">
                <p className="text-zinc-500 text-xs tracking-widest uppercase">VS CPU</p>
                <div className="flex gap-4 flex-wrap justify-center">
                  {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => startGame(d)}
                      className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    onClick={() => startGame('impossible')}
                    className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-red-900 bg-transparent text-red-500 font-bold text-sm uppercase tracking-[0.15em] hover:border-red-500 hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
                  >
                    impossible
                  </button>
                </div>
              </div>

              <div className="w-64 border-t border-zinc-800" />

              <div className="flex flex-col items-center gap-4">
                <p className="text-zinc-500 text-xs tracking-widest uppercase">Local Multiplayer</p>
                <button
                  onClick={startTwoPlayer}
                  className="cursor-target px-10 py-3 rounded-xl border-2 border-dashed border-zinc-600 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
                >
                  2 Player
                </button>
                <p className="text-zinc-600 text-xs tracking-widest">P1: W / S  ·  P2: ↑ / ↓</p>
              </div>

              <p className="text-zinc-600 text-xs tracking-widest">First to {WIN_SCORE} wins · Press P to close</p>
            </>
          )}

          {arcadeGame === 'invaders' && (
            <div className="flex flex-col items-center gap-5">
              <h2 className="text-4xl md:text-5xl font-black uppercase tracking-[0.14em] text-emerald-300">Space Invaders</h2>
              <p className="text-zinc-400 text-sm tracking-wide text-center max-w-xl">
                Hold space to unleash rapid plasma fire, dodge incoming shots, and clear 8 escalating waves.
                Press B during gameplay to open the store without leaving the run.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={startInvaders}
                  className="cursor-target px-10 py-3 rounded-xl border-2 border-dashed border-emerald-300/70 bg-emerald-300/10 text-emerald-200 font-bold text-sm uppercase tracking-[0.15em] hover:bg-emerald-300/20 transition-all duration-200"
                >
                  Launch Mission
                </button>
                <button
                  onClick={() => setStoreOpen(prev => !prev)}
                  className="cursor-target px-10 py-3 rounded-xl border-2 border-dashed border-zinc-600 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200"
                >
                  {storeOpen ? 'Hide Store' : 'Open Store'}
                </button>
              </div>
              <p className="text-zinc-600 text-xs tracking-widest">Coins: {bankCoins} · Press P to close</p>
              {storeOpen && drawInvaderStore()}
            </div>
          )}
        </div>
      )}

      {/* Playing */}
      {gameState === 'playing' && (
        <>
          <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full cursor-none" />
          {arcadeGame === 'invaders' && storeOpen && (
            <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/35">
              {drawInvaderStore()}
            </div>
          )}
        </>
      )}

      {/* Game Over */}
      {gameState === 'gameover' && (
        <div className="flex flex-col items-center gap-6">
          <h2 className="text-white text-5xl font-black tracking-[0.15em] uppercase">
            {arcadeGame === 'pong'
              ? (mode === '2player'
                ? (winner === 'player' ? 'Player 1 Wins!' : 'Player 2 Wins!')
                : (winner === 'player' ? 'You Win!' : 'CPU Wins'))
              : (invaderOutcome === 'victory' ? 'Sector Cleared!' : 'Ship Destroyed')}
          </h2>
          {arcadeGame === 'pong' ? (
            <p className="text-zinc-500 text-sm tracking-widest">
              {pongFinalScore.player} — {pongFinalScore.cpu}
            </p>
          ) : (
            <p className="text-zinc-500 text-sm tracking-widest">
              Score {invaderFinalStats.score} · Wave {invaderFinalStats.wave} · Coins +{invaderFinalStats.coins}
            </p>
          )}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => arcadeGame === 'pong'
                ? (mode === '2player' ? startTwoPlayer() : startGame(difficulty))
                : startInvaders()}
              className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
            >
              {arcadeGame === 'pong' ? 'Rematch' : 'Retry'}
            </button>
            <button
              onClick={() => {
                setGameState('menu');
                setWinner(null);
                setInvaderOutcome(null);
              }}
              className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-zinc-700 bg-transparent text-white font-bold text-sm uppercase tracking-[0.15em] hover:border-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
            >
              Menu
            </button>
            {arcadeGame === 'invaders' && (
              <button
                onClick={() => setStoreOpen(true)}
                className="cursor-target px-8 py-3 rounded-xl border-2 border-dashed border-emerald-700 bg-transparent text-emerald-300 font-bold text-sm uppercase tracking-[0.15em] hover:border-emerald-300 hover:bg-emerald-300/10 transition-all duration-200 cursor-pointer"
              >
                Store
              </button>
            )}
          </div>
          <p className="text-zinc-600 text-xs tracking-widest mt-2">Press P to close</p>
        </div>
      )}

    </div>
  );
}
