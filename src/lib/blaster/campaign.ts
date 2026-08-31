// Blaster Duel — single-player Campaign engine (client-side).
//
// Mirrors the arcade's Space Invaders loop: clear escalating levels against an
// AI rival, earn coins per hit / per clear, and spend them in an upgrade shop
// between levels. Runs entirely in the browser (no server) and reuses the same
// shared physics/config as the online mode, so movement/collisions feel identical.

import {
  ARENA,
  BLASTER,
  CAMPAIGN,
  EVENT,
  PLAYER,
  ROUNDS,
  SPAWNS,
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
  aimSpread: number;
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

interface Input {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  reload: boolean;
}

const IDLE: Input = { up: false, down: false, left: false, right: false, fire: false, reload: false };
const BOUNDS = { minX: 0, minY: 0, maxX: ARENA.width, maxY: ARENA.height };

function makeEntity(seat: Seat, stats: { maxHealth: number; speed: number; damage: number; fireCooldownMs: number; pellets: number }, magazine: number): Entity {
  const spawn = SPAWNS[seat];
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
  };
}

export class CampaignGame {
  level: number;
  coins: number;
  upgrades: Upgrades;
  phase: CampaignPhase = "countdown";

  private timeMs = 0;
  private phaseUntilMs = 0;
  private player!: Entity;
  private rival!: Entity;
  private projectiles: CProjectile[] = [];
  private nextId = 1;
  private input: Input = { ...IDLE };
  private events: GameEvent[] = [];

  // Rival AI memory.
  private strafeDir = 1;
  private strafeFlipAtMs = 0;
  private aimError = 0;
  private aimJitterAtMs = 0;
  private desiredRange = 300;
  private prevPX = 0;
  private prevPY = 0;

  constructor(progress: { level: number; coins: number; upgrades: Upgrades }) {
    this.level = progress.level;
    this.coins = progress.coins;
    this.upgrades = progress.upgrades;
    this.startLevel(this.level);
  }

  /** (Re)build both fighters for a level using current upgrades. */
  startLevel(level: number) {
    this.level = level;
    const ps = playerStats(this.upgrades);
    this.player = makeEntity("a", ps, ps.magazine);
    const rs = rivalStats(level);
    this.rival = makeEntity("b", { maxHealth: rs.maxHealth, speed: rs.speed, damage: rs.damage, fireCooldownMs: rs.fireCooldownMs, pellets: 1 }, rs.magazine);
    this.rival.aimSpread = rs.aimSpread;
    this.projectiles = [];
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.desiredRange = 280 + Math.random() * 80;
    this.prevPX = this.player.x;
    this.prevPY = this.player.y;
    this.phase = "countdown";
    this.phaseUntilMs = this.timeMs + ROUNDS.countdownMs;
  }

  retryLevel() {
    this.startLevel(this.level);
  }

  nextLevel() {
    if (this.level < CAMPAIGN.totalLevels) this.startLevel(this.level + 1);
  }

  /** Buy one level of an upgrade. Returns true on success. */
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
      const res = resolveBody(nx, ny, PLAYER.radius, BOUNDS);
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
      if (lineBlocked(px, py, pr.x, pr.y)) {
        this.events.push({ type: EVENT.HIT, wall: true, x: pr.x, y: pr.y, owner: pr.owner });
        continue;
      }
      const target = pr.owner === "a" ? this.rival : this.player;
      if (target.alive) {
        const d = pointSegmentDist(target.x, target.y, px, py, pr.x, pr.y);
        if (d <= BLASTER.projectileRadius + PLAYER.radius) {
          target.hp = Math.max(0, target.hp - pr.damage);
          this.events.push({ type: EVENT.HIT, seat: target.seat, x: target.x, y: target.y, owner: pr.owner, amount: pr.damage });
          if (pr.owner === "a") this.coins += CAMPAIGN.coinPerHit;
          if (target.hp <= 0) {
            target.alive = false;
            this.events.push({ type: EVENT.DEATH, seat: target.seat });
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

  private rivalThink(dt: number): Input {
    const me = this.rival;
    const foe = this.player;
    if (!me.alive || !foe.alive) return { ...IDLE };
    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const dist = Math.hypot(dx, dy) || 1;
    const toFoe = Math.atan2(dy, dx);
    const hasLoS = !lineBlocked(me.x, me.y, foe.x, foe.y);

    const travel = dist / BLASTER.projectileSpeed;
    const foeVx = (foe.x - this.prevPX) / Math.max(dt, 0.001);
    const foeVy = (foe.y - this.prevPY) / Math.max(dt, 0.001);
    this.prevPX = foe.x;
    this.prevPY = foe.y;
    const leadX = foe.x + foeVx * travel * 0.5;
    const leadY = foe.y + foeVy * travel * 0.5;
    if (this.timeMs >= this.aimJitterAtMs) {
      const spread = hasLoS ? me.aimSpread : me.aimSpread + 0.25;
      this.aimError = (Math.random() - 0.5) * 2 * spread;
      this.aimJitterAtMs = this.timeMs + 90 + Math.random() * 120;
    }
    me.aim = Math.atan2(leadY - me.y, leadX - me.x) + this.aimError;

    const perpX = -Math.sin(toFoe) * this.strafeDir;
    const perpY = Math.cos(toFoe) * this.strafeDir;
    let mvx: number;
    let mvy: number;
    if (me.reloading) {
      mvx = -Math.cos(toFoe) * 0.9 + perpX * 0.5;
      mvy = -Math.sin(toFoe) * 0.9 + perpY * 0.5;
    } else if (dist > this.desiredRange + 70) {
      mvx = Math.cos(toFoe) * 0.85 + perpX * 0.4;
      mvy = Math.sin(toFoe) * 0.85 + perpY * 0.4;
    } else if (dist < this.desiredRange - 70) {
      mvx = -Math.cos(toFoe) * 0.85 + perpX * 0.4;
      mvy = -Math.sin(toFoe) * 0.85 + perpY * 0.4;
    } else {
      mvx = perpX;
      mvy = perpY;
    }
    if (this.timeMs >= this.strafeFlipAtMs) {
      this.strafeDir *= Math.random() < 0.5 ? -1 : 1;
      this.strafeFlipAtMs = this.timeMs + 700 + Math.random() * 900;
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

  /** Advance one frame; returns one-shot events for sfx/particles. */
  update(dt: number): GameEvent[] {
    this.events = [];
    this.timeMs += dt * 1000;

    // Auto-aim toward the rival.
    if (this.player.alive) this.player.aim = Math.atan2(this.rival.y - this.player.y, this.rival.x - this.player.x);

    if (this.phase === "countdown") {
      if (this.timeMs >= this.phaseUntilMs) this.phase = "live";
    } else if (this.phase === "live") {
      const rivalInput = this.rivalThink(dt);
      this.simEntity(this.player, this.input, dt);
      this.simEntity(this.rival, rivalInput, dt);
      this.simProjectiles(dt);
      if (!this.rival.alive) this.onLevelClear();
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
      foe: this.pub(this.rival),
      projectiles: proj,
      phase: this.phase === "live" ? "live" : this.phase === "countdown" ? "countdown" : "roundEnd",
      round: this.level,
      bestOf: CAMPAIGN.totalLevels,
      score: { a: 0, b: 0 },
      countdownMs: this.phase === "countdown" ? Math.max(0, this.phaseUntilMs - this.timeMs) : 0,
      bounds: BOUNDS,
    };
  }

  getHud() {
    return {
      level: this.level,
      totalLevels: CAMPAIGN.totalLevels,
      coins: this.coins,
      upgrades: { ...this.upgrades },
      phase: this.phase,
      countdownMs: this.phase === "countdown" ? Math.max(0, this.phaseUntilMs - this.timeMs) : 0,
      meHp: this.player.hp,
      meMaxHp: this.player.maxHp,
      meAmmo: this.player.ammo,
      magazine: this.player.magazine,
      meReloading: this.player.reloading,
      meReloadRemain: this.player.reloading ? Math.max(0, this.player.reloadEndMs - this.timeMs) : 0,
      rivalHp: this.rival.hp,
      rivalMaxHp: this.rival.maxHp,
    };
  }
}
