// Blaster Duel — single-player Levels engine (client-side).
//
// Mirrors the arcade's Space Invaders loop: clear escalating levels against AI
// rivals, earn coins per hit / per clear, and spend them in an upgrade shop.
// The arena layout cycles every level, difficulty ramps up, and the final level
// pits you against TWO rivals at once. Runs entirely in the browser (no server)
// and reuses the same shared physics/config as online, so it feels identical.

import {
  BLASTER,
  CAMPAIGN,
  EVENT,
  PLAYER,
  ROUNDS,
  SPAWNS,
  ARENA,
  mapForLevel,
  playerStats,
  rivalStats,
  type GameEvent,
  type PlayerState,
  type Projectile,
  type Seat,
  type Upgrades,
} from "./protocol";
import type { RenderState } from "./net";
import { lineBlocked, pointSegmentDist, resolveBody } from "@/shared/blaster/physics.mjs";

export type CampaignPhase = "countdown" | "live" | "levelClear" | "dead" | "won";
type Obstacle = { x: number; y: number; w: number; h: number };

interface Stats {
  maxHealth: number;
  speed: number;
  damage: number;
  fireCooldownMs: number;
  pellets: number;
}

interface Entity {
  seat: Seat;
  x: number;
  y: number;
  aim: number;
  hp: number;
  maxHp: number;
  ammo: number;
  magazine: number;
  reloading: boolean;
  reloadEndMs: number;
  fireReadyAtMs: number;
  alive: boolean;
  speed: number;
  damage: number;
  fireCooldownMs: number;
  pellets: number;
  // Rival AI memory (unused for the player).
  aimSpread: number;
  strafeDir: number;
  strafeFlipAtMs: number;
  aimError: number;
  aimJitterAtMs: number;
  desiredRange: number;
  prevPX: number;
  prevPY: number;
}

interface Input {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  reload: boolean;
}

interface CProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Seat;
  damage: number;
  life: number;
}

const IDLE: Input = { up: false, down: false, left: false, right: false, fire: false, reload: false };
const BOUNDS = { minX: 0, minY: 0, maxX: ARENA.width, maxY: ARENA.height };

function makeEntity(seat: Seat, spawn: { x: number; y: number; aim: number }, stats: Stats, magazine: number): Entity {
  return {
    seat,
    x: spawn.x,
    y: spawn.y,
    aim: spawn.aim,
    hp: stats.maxHealth,
    maxHp: stats.maxHealth,
    ammo: magazine,
    magazine,
    reloading: false,
    reloadEndMs: 0,
    fireReadyAtMs: 0,
    alive: true,
    speed: stats.speed,
    damage: stats.damage,
    fireCooldownMs: stats.fireCooldownMs,
    pellets: stats.pellets,
    aimSpread: 0,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    strafeFlipAtMs: 0,
    aimError: 0,
    aimJitterAtMs: 0,
    desiredRange: 290,
    prevPX: spawn.x,
    prevPY: spawn.y,
  };
}

function rivalSpawns(count: number) {
  if (count >= 2) {
    return [
      { x: 1150, y: 220, aim: Math.PI },
      { x: 1150, y: 500, aim: Math.PI },
    ];
  }
  return [{ x: SPAWNS.b.x, y: SPAWNS.b.y, aim: Math.PI }];
}

export class CampaignGame {
  level: number;
  coins: number;
  upgrades: Upgrades;
  phase: CampaignPhase = "countdown";

  private timeMs = 0;
  private phaseUntilMs = 0;
  private map: Obstacle[] = mapForLevel(1);
  private player!: Entity;
  private rivals: Entity[] = [];
  private projectiles: CProjectile[] = [];
  private nextId = 1;
  private input: Input = { ...IDLE };
  private events: GameEvent[] = [];

  constructor(progress: { level: number; coins: number; upgrades: Upgrades }) {
    this.level = progress.level;
    this.coins = progress.coins;
    this.upgrades = progress.upgrades;
    this.startLevel(this.level);
  }

  startLevel(level: number) {
    this.level = level;
    this.map = mapForLevel(level);
    const ps = playerStats(this.upgrades);
    this.player = makeEntity("a", SPAWNS.a, ps, ps.magazine);

    const twoRivals = level >= CAMPAIGN.totalLevels;
    const rs = rivalStats(level);
    const spawns = rivalSpawns(twoRivals ? 2 : 1);
    this.rivals = spawns.map((sp) => {
      const hpScale = twoRivals ? 0.7 : 1;
      const stats: Stats = {
        maxHealth: Math.round(rs.maxHealth * hpScale),
        speed: rs.speed,
        damage: twoRivals ? Math.round(rs.damage * 0.85) : rs.damage,
        fireCooldownMs: twoRivals ? Math.round(rs.fireCooldownMs * 1.1) : rs.fireCooldownMs,
        pellets: 1,
      };
      const e = makeEntity("b", sp, stats, rs.magazine);
      e.aimSpread = rs.aimSpread;
      e.desiredRange = 260 + Math.random() * 90;
      const fixed = resolveBody(e.x, e.y, PLAYER.radius, BOUNDS, this.map);
      e.x = fixed.x;
      e.y = fixed.y;
      return e;
    });

    this.projectiles = [];
    this.phase = "countdown";
    this.phaseUntilMs = this.timeMs + ROUNDS.countdownMs;
  }

  retryLevel() {
    this.startLevel(this.level);
  }

  nextLevel() {
    if (this.level < CAMPAIGN.totalLevels) this.startLevel(this.level + 1);
  }

  buyUpgrade(key: keyof Upgrades): boolean {
    const lvl = this.upgrades[key] || 0;
    if (lvl >= CAMPAIGN.maxUpgradeLevel) return false;
    const cost = CAMPAIGN.upgrades[key].baseCost + CAMPAIGN.upgrades[key].step * lvl;
    if (this.coins < cost) return false;
    this.coins -= cost;
    this.upgrades = { ...this.upgrades, [key]: lvl + 1 };
    return true;
  }

  setInput(input: Input) {
    this.input = input;
  }

  private startReload(e: Entity) {
    if (e.reloading || e.ammo >= e.magazine) return;
    e.reloading = true;
    e.reloadEndMs = this.timeMs + BLASTER.reloadMs;
    this.events.push({ type: EVENT.RELOAD_START, seat: e.seat });
  }

  private fire(e: Entity) {
    const cos = Math.cos(e.aim);
    const sin = Math.sin(e.aim);
    const mx = e.x + cos * BLASTER.muzzleOffset;
    const my = e.y + sin * BLASTER.muzzleOffset;
    const n = e.pellets;
    const spreadTotal = (n - 1) * 0.14;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -spreadTotal / 2 + (spreadTotal / (n - 1)) * i;
      const a = e.aim + off;
      this.projectiles.push({
        id: this.nextId++,
        x: mx,
        y: my,
        vx: Math.cos(a) * BLASTER.projectileSpeed,
        vy: Math.sin(a) * BLASTER.projectileSpeed,
        owner: e.seat,
        damage: e.damage,
        life: BLASTER.projectileLifeMs,
      });
    }
    e.ammo -= 1;
    e.fireReadyAtMs = this.timeMs + e.fireCooldownMs;
    this.events.push({ type: EVENT.SHOOT, seat: e.seat, x: mx, y: my, aim: e.aim });
    if (e.ammo <= 0) this.startReload(e);
  }

  private simEntity(e: Entity, input: Input, dt: number) {
    if (!e.alive) return;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      const nx = e.x + (mx / len) * e.speed * dt;
      const ny = e.y + (my / len) * e.speed * dt;
      const res = resolveBody(nx, ny, PLAYER.radius, BOUNDS, this.map);
      e.x = res.x;
      e.y = res.y;
    }
    if (e.reloading && this.timeMs >= e.reloadEndMs) {
      e.reloading = false;
      e.ammo = e.magazine;
      this.events.push({ type: EVENT.RELOAD_DONE, seat: e.seat });
    }
    if (input.reload && !e.reloading && e.ammo < e.magazine) this.startReload(e);
    if (input.fire && this.timeMs >= e.fireReadyAtMs && !e.reloading) {
      if (e.ammo > 0) this.fire(e);
      else {
        this.events.push({ type: EVENT.EMPTY, seat: e.seat });
        e.fireReadyAtMs = this.timeMs + 250;
        this.startReload(e);
      }
    }
  }

  private simProjectiles(dt: number) {
    const survivors: CProjectile[] = [];
    for (const pr of this.projectiles) {
      pr.life -= dt * 1000;
      if (pr.life <= 0) continue;
      const px = pr.x;
      const py = pr.y;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.x < BOUNDS.minX || pr.x > BOUNDS.maxX || pr.y < BOUNDS.minY || pr.y > BOUNDS.maxY) continue;
      if (lineBlocked(px, py, pr.x, pr.y, this.map)) {
        this.events.push({ type: EVENT.HIT, wall: true, x: pr.x, y: pr.y, owner: pr.owner });
        continue;
      }

      if (pr.owner === "a") {
        // Player bolt: hit the closest rival in range.
        let best: Entity | null = null;
        let bestD = Infinity;
        for (const rival of this.rivals) {
          if (!rival.alive) continue;
          const d = pointSegmentDist(rival.x, rival.y, px, py, pr.x, pr.y);
          if (d <= BLASTER.projectileRadius + PLAYER.radius && d < bestD) {
            best = rival;
            bestD = d;
          }
        }
        if (best) {
          best.hp = Math.max(0, best.hp - pr.damage);
          this.coins += CAMPAIGN.coinPerHit;
          this.events.push({ type: EVENT.HIT, seat: "b", x: best.x, y: best.y, owner: "a", amount: pr.damage });
          if (best.hp <= 0) {
            best.alive = false;
            this.events.push({ type: EVENT.DEATH, seat: "b", x: best.x, y: best.y });
          }
          continue;
        }
      } else if (this.player.alive) {
        // Rival bolt: hit the player.
        const d = pointSegmentDist(this.player.x, this.player.y, px, py, pr.x, pr.y);
        if (d <= BLASTER.projectileRadius + PLAYER.radius) {
          this.player.hp = Math.max(0, this.player.hp - pr.damage);
          this.events.push({ type: EVENT.HIT, seat: "a", x: this.player.x, y: this.player.y, owner: "b", amount: pr.damage });
          if (this.player.hp <= 0) {
            this.player.alive = false;
            this.events.push({ type: EVENT.DEATH, seat: "a", x: this.player.x, y: this.player.y });
          }
          continue;
        }
      }
      survivors.push(pr);
    }
    this.projectiles = survivors;
  }

  private normalizeAngle(a: number) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  private nearestRival(): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const r of this.rivals) {
      if (!r.alive) continue;
      const d = Math.hypot(r.x - this.player.x, r.y - this.player.y);
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    return best;
  }

  private rivalThink(me: Entity, dt: number): Input {
    const foe = this.player;
    if (!me.alive || !foe.alive) return { ...IDLE };
    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const dist = Math.hypot(dx, dy) || 1;
    const toFoe = Math.atan2(dy, dx);
    const hasLoS = !lineBlocked(me.x, me.y, foe.x, foe.y, this.map);

    const travel = dist / BLASTER.projectileSpeed;
    const foeVx = (foe.x - me.prevPX) / Math.max(dt, 0.001);
    const foeVy = (foe.y - me.prevPY) / Math.max(dt, 0.001);
    me.prevPX = foe.x;
    me.prevPY = foe.y;
    const leadX = foe.x + foeVx * travel * 0.5;
    const leadY = foe.y + foeVy * travel * 0.5;
    if (this.timeMs >= me.aimJitterAtMs) {
      const spread = hasLoS ? me.aimSpread : me.aimSpread + 0.25;
      me.aimError = (Math.random() - 0.5) * 2 * spread;
      me.aimJitterAtMs = this.timeMs + 90 + Math.random() * 120;
    }
    me.aim = Math.atan2(leadY - me.y, leadX - me.x) + me.aimError;

    const perpX = -Math.sin(toFoe) * me.strafeDir;
    const perpY = Math.cos(toFoe) * me.strafeDir;
    let mvx: number;
    let mvy: number;
    if (me.reloading) {
      mvx = -Math.cos(toFoe) * 0.9 + perpX * 0.5;
      mvy = -Math.sin(toFoe) * 0.9 + perpY * 0.5;
    } else if (dist > me.desiredRange + 70) {
      mvx = Math.cos(toFoe) * 0.85 + perpX * 0.4;
      mvy = Math.sin(toFoe) * 0.85 + perpY * 0.4;
    } else if (dist < me.desiredRange - 70) {
      mvx = -Math.cos(toFoe) * 0.85 + perpX * 0.4;
      mvy = -Math.sin(toFoe) * 0.85 + perpY * 0.4;
    } else {
      mvx = perpX;
      mvy = perpY;
    }
    if (this.timeMs >= me.strafeFlipAtMs) {
      me.strafeDir *= Math.random() < 0.5 ? -1 : 1;
      me.strafeFlipAtMs = this.timeMs + 700 + Math.random() * 900;
    }

    const t = 0.35;
    const angleErr = Math.abs(this.normalizeAngle(me.aim - toFoe));
    return {
      up: mvy < -t,
      down: mvy > t,
      left: mvx < -t,
      right: mvx > t,
      fire: !me.reloading && me.ammo > 0 && hasLoS && angleErr < 0.16 && Math.random() < 0.9,
      reload: !me.reloading && me.ammo <= 1 && !hasLoS,
    };
  }

  private onLevelClear() {
    this.coins += CAMPAIGN.levelClearCoins + this.level * 4;
    this.phase = this.level >= CAMPAIGN.totalLevels ? "won" : "levelClear";
  }

  update(dt: number): GameEvent[] {
    this.events = [];
    this.timeMs += dt * 1000;

    // Auto-aim toward the nearest living rival.
    if (this.player.alive) {
      const t = this.nearestRival();
      if (t) this.player.aim = Math.atan2(t.y - this.player.y, t.x - this.player.x);
    }

    if (this.phase === "countdown") {
      if (this.timeMs >= this.phaseUntilMs) this.phase = "live";
    } else if (this.phase === "live") {
      for (const rival of this.rivals) {
        const input = this.rivalThink(rival, dt);
        this.simEntity(rival, input, dt);
      }
      this.simEntity(this.player, this.input, dt);
      this.simProjectiles(dt);
      if (this.rivals.every((r) => !r.alive)) this.onLevelClear();
      else if (!this.player.alive) this.phase = "dead";
    }
    return this.events;
  }

  private pub(e: Entity): PlayerState {
    return {
      x: e.x,
      y: e.y,
      aim: e.aim,
      hp: e.hp,
      ammo: e.ammo,
      reloading: e.reloading,
      reloadRemainMs: e.reloading ? Math.max(0, e.reloadEndMs - this.timeMs) : 0,
      alive: e.alive,
    };
  }

  getRenderState(): RenderState {
    const proj: Projectile[] = this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, owner: p.owner }));
    return {
      mySeat: "a",
      me: this.pub(this.player),
      foe: this.pub(this.rivals[0]),
      extraFoes: this.rivals.slice(1).map((r) => this.pub(r)),
      projectiles: proj,
      obstacles: this.map,
      phase: this.phase === "live" ? "live" : this.phase === "countdown" ? "countdown" : "roundEnd",
      round: this.level,
      bestOf: CAMPAIGN.totalLevels,
      score: { a: 0, b: 0 },
      countdownMs: this.phase === "countdown" ? Math.max(0, this.phaseUntilMs - this.timeMs) : 0,
      bounds: BOUNDS,
    };
  }

  getHud() {
    const rivalHp = this.rivals.reduce((s, r) => s + r.hp, 0);
    const rivalMaxHp = this.rivals.reduce((s, r) => s + r.maxHp, 0);
    return {
      level: this.level,
      totalLevels: CAMPAIGN.totalLevels,
      coins: this.coins,
      upgrades: { ...this.upgrades },
      phase: this.phase,
      rivalCount: this.rivals.length,
      countdownMs: this.phase === "countdown" ? Math.max(0, this.phaseUntilMs - this.timeMs) : 0,
      meHp: this.player.hp,
      meMaxHp: this.player.maxHp,
      meAmmo: this.player.ammo,
      magazine: this.player.magazine,
      meReloading: this.player.reloading,
      meReloadRemain: this.player.reloading ? Math.max(0, this.player.reloadEndMs - this.timeMs) : 0,
      rivalHp,
      rivalMaxHp,
    };
  }
}
