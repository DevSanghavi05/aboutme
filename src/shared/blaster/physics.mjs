// Blaster Duel — shared collision & movement math.
//
// Pure, allocation-light geometry helpers used by BOTH the authoritative server
// simulation and the client-side prediction, so predicted and authoritative
// motion resolve identically. No imports beyond config so it can run anywhere.

import { OBSTACLES } from "./config.mjs";

/** Clamp a scalar. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Push a circle out of an axis-aligned rectangle if overlapping.
 * Returns the corrected center; unchanged if there is no overlap.
 * @param {number} px @param {number} py @param {number} r
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {{x:number,y:number,hit:boolean}}
 */
export function resolveCircleRect(px, py, r, rect) {
  const nearestX = clamp(px, rect.x, rect.x + rect.w);
  const nearestY = clamp(py, rect.y, rect.y + rect.h);
  const dx = px - nearestX;
  const dy = py - nearestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= r * r) return { x: px, y: py, hit: false };

  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const push = r - dist;
    return { x: px + (dx / dist) * push, y: py + (dy / dist) * push, hit: true };
  }

  // Center is inside the rect: eject along the shallowest axis.
  const left = px - rect.x;
  const right = rect.x + rect.w - px;
  const top = py - rect.y;
  const bottom = rect.y + rect.h - py;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: rect.x - r, y: py, hit: true };
  if (min === right) return { x: rect.x + rect.w + r, y: py, hit: true };
  if (min === top) return { x: px, y: rect.y - r, hit: true };
  return { x: px, y: rect.y + rect.h + r, hit: true };
}

/**
 * Resolve a circle against arena bounds + all obstacles. Iterated a couple
 * times so a body wedged into a corner settles cleanly.
 * @param {number} px @param {number} py @param {number} r
 * @param {{minX:number,minY:number,maxX:number,maxY:number}} bounds
 * @returns {{x:number,y:number}}
 */
export function resolveBody(px, py, r, bounds) {
  let x = clamp(px, bounds.minX + r, bounds.maxX - r);
  let y = clamp(py, bounds.minY + r, bounds.maxY - r);
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < OBSTACLES.length; i++) {
      const res = resolveCircleRect(x, y, r, OBSTACLES[i]);
      x = res.x;
      y = res.y;
    }
    x = clamp(x, bounds.minX + r, bounds.maxX - r);
    y = clamp(y, bounds.minY + r, bounds.maxY - r);
  }
  return { x, y };
}

/** True if the point (with radius) overlaps any obstacle. */
export function pointHitsObstacle(px, py, r) {
  for (let i = 0; i < OBSTACLES.length; i++) {
    const rect = OBSTACLES[i];
    const nx = clamp(px, rect.x, rect.x + rect.w);
    const ny = clamp(py, rect.y, rect.y + rect.h);
    const dx = px - nx;
    const dy = py - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/**
 * Segment (x1,y1)->(x2,y2) vs axis-aligned rect intersection (slab method).
 * Used for projectile tunneling and line-of-sight checks.
 */
export function segmentHitsRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tMin = 0;
  let tMax = 1;
  const minX = rect.x;
  const maxX = rect.x + rect.w;
  const minY = rect.y;
  const maxY = rect.y + rect.h;

  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (x1 < minX || x1 > maxX) return false;
  } else {
    let t1 = (minX - x1) / dx;
    let t2 = (maxX - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  // Y slab
  if (Math.abs(dy) < 1e-9) {
    if (y1 < minY || y1 > maxY) return false;
  } else {
    let t1 = (minY - y1) / dy;
    let t2 = (maxY - y1) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** True if a straight line between two points is blocked by any obstacle. */
export function lineBlocked(x1, y1, x2, y2) {
  for (let i = 0; i < OBSTACLES.length; i++) {
    if (segmentHitsRect(x1, y1, x2, y2, OBSTACLES[i])) return true;
  }
  return false;
}

/**
 * Distance from point P to segment AB. Used for swept projectile-vs-circle
 * so fast projectiles can't tunnel through a player between ticks.
 */
export function pointSegmentDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 1e-9 ? ((px - ax) * abx + (py - ay) * aby) / lenSq : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return Math.hypot(dx, dy);
}
