// Blaster Duel — server-side AI opponent.
//
// Bots feed the SAME authoritative input pipeline as humans (up/down/left/right/
// aim/fire/reload). They never touch state directly, so a match against a bot is
// simulated exactly like a real one — it's a legitimate single-player mode, not a
// fake stand-in for networking. Used to fill a match when no human is available.

import { BLASTER, PHASE, PLAYER } from "../../src/shared/blaster/config.mjs";
import { lineBlocked, pointHitsObstacle } from "../../src/shared/blaster/physics.mjs";

const IDLE = { up: false, down: false, left: false, right: false, aim: 0, fire: false, reload: false };

export class BotBrain {
  constructor(seat) {
    this.seat = seat;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeFlipAtMs = 0;
    this.aimError = 0;
    this.aimJitterAtMs = 0;
    this.desiredRange = 300 + Math.random() * 80;
    this.reactionMs = 120; // slight delay so it isn't frame-perfect
  }

  think(match, seat, timeMs) {
    const me = match.players[seat];
    const foe = match.players[seat === "a" ? "b" : "a"];
    if (!me.alive || !foe.alive || match.phase !== PHASE.LIVE) {
      return { ...IDLE, aim: Math.atan2(foe.y - me.y, foe.x - me.x) };
    }

    const dx = foe.x - me.x;
    const dy = foe.y - me.y;
    const dist = Math.hypot(dx, dy) || 1;
    const toFoe = Math.atan2(dy, dx);
    const hasLoS = !lineBlocked(me.x, me.y, foe.x, foe.y);

    // --- Aim: lead the target slightly and add wobbling error (skill cap). ---
    const travel = dist / BLASTER.projectileSpeed;
    const foeVx = (foe.x - (this._pfx ?? foe.x)) / 0.0333;
    const foeVy = (foe.y - (this._pfy ?? foe.y)) / 0.0333;
    this._pfx = foe.x;
    this._pfy = foe.y;
    const leadX = foe.x + foeVx * travel;
    const leadY = foe.y + foeVy * travel;
    if (timeMs >= this.aimJitterAtMs) {
      const spread = hasLoS ? 0.05 + dist / 6000 : 0.25;
      this.aimError = (Math.random() - 0.5) * 2 * spread;
      this.aimJitterAtMs = timeMs + 90 + Math.random() * 120;
    }
    const aim = Math.atan2(leadY - me.y, leadX - me.x) + this.aimError;

    // --- Movement: keep a preferred range and circle-strafe for cover. ---
    let mvx = 0;
    let mvy = 0;
    const perpX = -Math.sin(toFoe) * this.strafeDir;
    const perpY = Math.cos(toFoe) * this.strafeDir;

    if (me.reloading) {
      // Retreat while reloading to break line of sight.
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

    // Flip strafe direction periodically or when about to hit a wall.
    const stepX = me.x + mvx * PLAYER.speed * 0.12;
    const stepY = me.y + mvy * PLAYER.speed * 0.12;
    const wouldClip =
      pointHitsObstacle(stepX, stepY, PLAYER.radius + 6) ||
      stepX < PLAYER.radius ||
      stepX > 1280 - PLAYER.radius ||
      stepY < PLAYER.radius ||
      stepY > 720 - PLAYER.radius;
    if (wouldClip || timeMs >= this.strafeFlipAtMs) {
      this.strafeDir *= wouldClip ? -1 : (Math.random() < 0.5 ? -1 : 1);
      this.strafeFlipAtMs = timeMs + 700 + Math.random() * 900;
    }

    const threshold = 0.35;
    const input = {
      up: mvy < -threshold,
      down: mvy > threshold,
      left: mvx < -threshold,
      right: mvx > threshold,
      aim,
      fire: false,
      reload: false,
    };

    // --- Firing / reloading decisions. ---
    const angleErr = Math.abs(normalizeAngle(aim - toFoe));
    if (!me.reloading && me.ammo > 0 && hasLoS && angleErr < 0.14 && Math.random() < 0.9) {
      input.fire = true;
    }
    if (!me.reloading && me.ammo <= 1 && !hasLoS) {
      input.reload = true;
    }

    return input;
  }
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
