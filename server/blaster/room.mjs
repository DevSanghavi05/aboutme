// Blaster Duel — authoritative match simulation.
//
// One Match owns the full game state for a single 1v1 (best-of-5). The SERVER
// is the sole authority: it spawns projectiles, moves bodies, resolves hits and
// mutates health. Client "input" is treated purely as intent and is sanitized
// here, so a tampered client cannot set its own health, ammo, or fake hits.

import {
  ARENA,
  BLASTER,
  EVENT,
  MSG,
  PHASE,
  PLAYER,
  ROUNDS,
  SPAWNS,
  TICK_MS,
  playableBounds,
} from "../../src/shared/blaster/config.mjs";
import { lineBlocked, pointSegmentDist, resolveBody } from "../../src/shared/blaster/physics.mjs";
import { BotBrain } from "./bot.mjs";

const DT = TICK_MS / 1000;
const MAX_PROJECTILES = 40;

function makePlayer(seat) {
  const spawn = SPAWNS[seat];
  return {
    seat,
    x: spawn.x,
    y: spawn.y,
    aim: spawn.aim,
    hp: PLAYER.maxHealth,
    ammo: BLASTER.magazine,
    reloading: false,
    reloadEndMs: 0,
    fireReadyAtMs: 0,
    alive: true,
    lastAckSeq: 0,
    input: { up: false, down: false, left: false, right: false, aim: spawn.aim, fire: false, reload: false, seq: 0 },
  };
}

export class Match {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {{name:string,isBot:boolean}} opts.aMeta
   * @param {{name:string,isBot:boolean}} opts.bMeta
   * @param {(seat:'a'|'b', msg:object)=>void} opts.emit
   */
  constructor({ id, aMeta, bMeta, emit }) {
    this.id = id;
    this.meta = { a: aMeta, b: bMeta };
    this.emit = emit;
    this.players = { a: makePlayer("a"), b: makePlayer("b") };
    this.projectiles = [];
    this.nextProjectileId = 1;
    this.round = 1;
    this.score = { a: 0, b: 0 };
    this.timeMs = 0;
    this.tickCount = 0;
    this.phase = PHASE.COUNTDOWN;
    this.phaseUntilMs = 0;
    this.events = [];
    this.finished = false;
    this.roundResolved = false;
    this.bots = {
      a: aMeta.isBot ? new BotBrain("a") : null,
      b: bMeta.isBot ? new BotBrain("b") : null,
    };
    this.resetRound(true);
  }

  hasHuman() {
    return !this.meta.a.isBot || !this.meta.b.isBot;
  }

  resetRound(keepScore) {
    if (!keepScore) {
      // score already tracked separately
    }
    const bounds = playableBounds(this.round);
    for (const seat of ["a", "b"]) {
      const p = this.players[seat];
      const spawn = SPAWNS[seat];
      const pos = resolveBody(spawn.x, spawn.y, PLAYER.radius, bounds);
      p.x = pos.x;
      p.y = pos.y;
      p.aim = spawn.aim;
      p.hp = PLAYER.maxHealth;
      p.ammo = BLASTER.magazine;
      p.reloading = false;
      p.reloadEndMs = 0;
      p.fireReadyAtMs = 0;
      p.alive = true;
      p.input = { up: false, down: false, left: false, right: false, aim: spawn.aim, fire: false, reload: false, seq: p.input.seq };
    }
    this.projectiles = [];
    this.phase = PHASE.COUNTDOWN;
    this.phaseUntilMs = this.timeMs + ROUNDS.countdownMs;
    this.roundResolved = false;
  }

  /** Sanitize and store the latest input for a seat. */
  setInput(seat, raw) {
    const p = this.players[seat];
    if (!p) return;
    const seq = Number.isFinite(raw.seq) ? raw.seq | 0 : p.input.seq;
    p.input = {
      up: !!raw.up,
      down: !!raw.down,
      left: !!raw.left,
      right: !!raw.right,
      fire: !!raw.fire,
      reload: !!raw.reload,
      aim: Number.isFinite(raw.aim) ? raw.aim : p.input.aim,
      seq,
    };
    if (seq > p.lastAckSeq) p.lastAckSeq = seq;
  }

  pushEvent(ev) {
    this.events.push(ev);
  }

  startReload(p) {
    if (p.reloading || p.ammo >= BLASTER.magazine) return;
    p.reloading = true;
    p.reloadEndMs = this.timeMs + BLASTER.reloadMs;
    this.pushEvent({ type: EVENT.RELOAD_START, seat: p.seat });
  }

  fire(p) {
    const mx = Math.cos(p.aim);
    const my = Math.sin(p.aim);
    const px = p.x + mx * BLASTER.muzzleOffset;
    const py = p.y + my * BLASTER.muzzleOffset;
    if (this.projectiles.length < MAX_PROJECTILES) {
      this.projectiles.push({
        id: this.nextProjectileId++,
        x: px,
        y: py,
        vx: mx * BLASTER.projectileSpeed,
        vy: my * BLASTER.projectileSpeed,
        owner: p.seat,
        life: BLASTER.projectileLifeMs,
      });
    }
    p.ammo -= 1;
    p.fireReadyAtMs = this.timeMs + BLASTER.fireCooldownMs;
    this.pushEvent({ type: EVENT.SHOOT, seat: p.seat, x: px, y: py, aim: p.aim });
    if (p.ammo <= 0) this.startReload(p);
  }

  simulatePlayer(seat, bounds) {
    const p = this.players[seat];
    if (!p.alive) return;
    const input = p.input;
    p.aim = input.aim;

    // Movement (server derives speed from booleans → cannot be spoofed fast).
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      const nx = p.x + mx * PLAYER.speed * DT;
      const ny = p.y + my * PLAYER.speed * DT;
      const res = resolveBody(nx, ny, PLAYER.radius, bounds);
      p.x = res.x;
      p.y = res.y;
    }

    // Reload completion.
    if (p.reloading && this.timeMs >= p.reloadEndMs) {
      p.reloading = false;
      p.ammo = BLASTER.magazine;
      this.pushEvent({ type: EVENT.RELOAD_DONE, seat });
    }
    // Manual reload request.
    if (input.reload && !p.reloading && p.ammo < BLASTER.magazine) {
      this.startReload(p);
    }
    // Firing.
    if (input.fire && this.timeMs >= p.fireReadyAtMs && !p.reloading) {
      if (p.ammo > 0) {
        this.fire(p);
      } else {
        this.pushEvent({ type: EVENT.EMPTY, seat });
        p.fireReadyAtMs = this.timeMs + 250;
        this.startReload(p);
      }
    }
  }

  simulateProjectiles(bounds) {
    const survivors = [];
    for (const pr of this.projectiles) {
      pr.life -= TICK_MS;
      if (pr.life <= 0) continue;
      const prevX = pr.x;
      const prevY = pr.y;
      pr.x += pr.vx * DT;
      pr.y += pr.vy * DT;

      // Out of playable bounds -> gone.
      if (pr.x < bounds.minX || pr.x > bounds.maxX || pr.y < bounds.minY || pr.y > bounds.maxY) {
        continue;
      }
      // Blocked by an obstacle (swept test avoids tunneling).
      if (lineBlocked(prevX, prevY, pr.x, pr.y)) {
        this.pushEvent({ type: EVENT.HIT, wall: true, x: pr.x, y: pr.y, owner: pr.owner });
        continue;
      }
      // Hit the opponent? (swept circle-vs-circle).
      const foeSeat = pr.owner === "a" ? "b" : "a";
      const foe = this.players[foeSeat];
      if (foe.alive) {
        const d = pointSegmentDist(foe.x, foe.y, prevX, prevY, pr.x, pr.y);
        if (d <= BLASTER.projectileRadius + PLAYER.radius) {
          foe.hp = Math.max(0, foe.hp - BLASTER.damage);
          this.pushEvent({ type: EVENT.HIT, seat: foeSeat, x: foe.x, y: foe.y, amount: BLASTER.damage, owner: pr.owner });
          if (foe.hp <= 0) {
            foe.alive = false;
            this.pushEvent({ type: EVENT.DEATH, seat: foeSeat });
            this.resolveRound(pr.owner);
          }
          continue;
        }
      }
      survivors.push(pr);
    }
    this.projectiles = survivors;
  }

  resolveRound(winnerSeat) {
    if (this.roundResolved) return;
    this.roundResolved = true;
    this.score[winnerSeat] += 1;
    this.phase = PHASE.ROUND_END;
    this.phaseUntilMs = this.timeMs + ROUNDS.roundEndMs;
    this.emitBoth({
      t: MSG.ROUND_RESULT,
      winner: winnerSeat,
      round: this.round,
      score: { a: this.score.a, b: this.score.b },
    });
  }

  advancePhase() {
    if (this.phase === PHASE.COUNTDOWN) {
      if (this.timeMs >= this.phaseUntilMs) this.phase = PHASE.LIVE;
    } else if (this.phase === PHASE.ROUND_END) {
      if (this.timeMs >= this.phaseUntilMs) {
        const matchWon = this.score.a >= ROUNDS.winTarget || this.score.b >= ROUNDS.winTarget;
        if (matchWon) {
          this.phase = PHASE.MATCH_END;
          this.finished = true;
          const winner = this.score.a >= ROUNDS.winTarget ? "a" : "b";
          this.emitBoth({ t: MSG.MATCH_RESULT, winner, score: { a: this.score.a, b: this.score.b } });
        } else {
          this.round += 1;
          this.resetRound(true);
        }
      }
    }
  }

  tick() {
    if (this.finished) return;
    this.timeMs += TICK_MS;
    this.tickCount += 1;
    const bounds = playableBounds(this.round);

    // Bot intent (authoritative — bots go through the same input pipeline).
    for (const seat of ["a", "b"]) {
      const brain = this.bots[seat];
      if (brain) {
        const intent = brain.think(this, seat, this.timeMs);
        this.setInput(seat, { ...intent, seq: this.players[seat].input.seq });
      }
    }

    if (this.phase === PHASE.LIVE) {
      this.simulatePlayer("a", bounds);
      this.simulatePlayer("b", bounds);
      this.simulateProjectiles(bounds);
    } else if (this.phase === PHASE.COUNTDOWN) {
      // Aim tracks during countdown; no movement / no firing.
      this.players.a.aim = this.players.a.input.aim;
      this.players.b.aim = this.players.b.input.aim;
    }

    this.advancePhase();
    this.broadcastState();
    this.events = [];
  }

  publicPlayer(seat) {
    const p = this.players[seat];
    return {
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      aim: Math.round(p.aim * 1000) / 1000,
      hp: p.hp,
      ammo: p.ammo,
      reloading: p.reloading,
      reloadRemainMs: p.reloading ? Math.max(0, p.reloadEndMs - this.timeMs) : 0,
      alive: p.alive,
    };
  }

  broadcastState() {
    const bounds = playableBounds(this.round);
    const base = {
      t: MSG.STATE,
      tick: this.tickCount,
      timeMs: this.timeMs,
      phase: this.phase,
      round: this.round,
      bestOf: ROUNDS.bestOf,
      score: { a: this.score.a, b: this.score.b },
      countdownMs: this.phase === PHASE.COUNTDOWN ? Math.max(0, this.phaseUntilMs - this.timeMs) : 0,
      bounds,
      players: { a: this.publicPlayer("a"), b: this.publicPlayer("b") },
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        owner: p.owner,
      })),
      events: this.events,
    };
    this.emit("a", { ...base, ackSeq: this.players.a.lastAckSeq });
    this.emit("b", { ...base, ackSeq: this.players.b.lastAckSeq });
  }

  emitBoth(msg) {
    this.emit("a", msg);
    this.emit("b", msg);
  }
}

export const ARENA_INFO = { width: ARENA.width, height: ARENA.height };
