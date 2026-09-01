// Blaster Duel — shared game configuration.
//
// This module is the SINGLE SOURCE OF TRUTH for arena layout, tuning numbers,
// and the network protocol. It is imported unchanged by BOTH the authoritative
// Node server (server/blaster/*.mjs) and the browser client (src/lib/blaster/*),
// so the two can never drift out of sync. Keep it dependency-free and pure data.

/** Logical arena dimensions. All positions/velocities are in these units. */
export const ARENA = {
  width: 1280,
  height: 720,
};

/**
 * Static obstacles (walls / platforms / cover). Laid out with 180° rotational
 * symmetry about the arena center so neither spawn has an advantage.
 * @type {{x:number,y:number,w:number,h:number}[]}
 */
export const OBSTACLES = [
  { x: 200, y: 150, w: 84, h: 190 }, // upper-left pillar
  { x: 996, y: 380, w: 84, h: 190 }, // lower-right pillar (mirror)
  { x: 360, y: 470, w: 210, h: 58 }, // lower-left platform
  { x: 710, y: 192, w: 210, h: 58 }, // upper-right platform (mirror)
  { x: 592, y: 316, w: 96, h: 88 }, // center block (self-symmetric)
];

/** Per-side spawn points (point-symmetric). Player "a" is left, "b" is right. */
export const SPAWNS = {
  a: { x: 130, y: 360, aim: 0 },
  b: { x: 1150, y: 360, aim: Math.PI },
};

/**
 * Alternate arena layouts. Online play always uses MAPS[0] (=== OBSTACLES).
 * The single-player Levels mode cycles through all of these as you progress.
 * @type {{x:number,y:number,w:number,h:number}[][]}
 */
export const MAPS = [
  OBSTACLES,
  // Four corner posts around a central block.
  [
    { x: 250, y: 120, w: 74, h: 158 },
    { x: 956, y: 442, w: 74, h: 158 },
    { x: 250, y: 442, w: 74, h: 158 },
    { x: 956, y: 120, w: 74, h: 158 },
    { x: 560, y: 300, w: 160, h: 120 },
  ],
  // Two long ramparts with a center pillar (fight around the ends).
  [
    { x: 300, y: 176, w: 680, h: 48 },
    { x: 300, y: 496, w: 680, h: 48 },
    { x: 590, y: 300, w: 100, h: 120 },
  ],
  // Staggered diagonal pillars.
  [
    { x: 180, y: 280, w: 80, h: 160 },
    { x: 1020, y: 280, w: 80, h: 160 },
    { x: 470, y: 150, w: 80, h: 150 },
    { x: 730, y: 420, w: 80, h: 150 },
    { x: 600, y: 330, w: 80, h: 80 },
  ],
];

/** Obstacle layout for a given Levels-mode level (1-indexed). */
export function mapForLevel(level) {
  return MAPS[(Math.max(1, level) - 1) % MAPS.length];
}

export const PLAYER = {
  radius: 22,
  speed: 340, // px per second
  maxHealth: 100,
};

export const BLASTER = {
  damage: 13,
  magazine: 6, // shots before a reload is required
  reloadMs: 1500,
  fireCooldownMs: 220,
  projectileSpeed: 780, // px per second
  projectileRadius: 7,
  projectileLifeMs: 2600,
  muzzleOffset: 26, // spawn distance from player center along aim
};

export const ROUNDS = {
  bestOf: 5,
  winTarget: 3, // first to this many round wins takes the match
  countdownMs: 3000,
  roundEndMs: 2400,
  /**
   * Playable-area inset per round number (1-indexed). The playable rectangle
   * shrinks inward in later rounds to force closer, more intense fights.
   * Index 0 is unused.
   */
  shrinkInset: [0, 0, 0, 110, 190, 250],
};

export const NET = {
  tickHz: 30, // authoritative simulation rate
  snapshotHz: 30, // state broadcast rate
  inputHz: 30, // client input send rate
  interpolationMs: 100, // render remote entities this far in the past
  botSearchTimeoutMs: 8000, // after this long searching, offer an AI opponent
  heartbeatMs: 5000,
  timeoutMs: 12000, // drop a client silent this long
};

/** Network message type tags (client<->server). */
export const MSG = {
  // server -> client
  WELCOME: "welcome",
  SEARCHING: "searching",
  BOT_OFFER: "botOffer",
  MATCH_FOUND: "matchFound",
  STATE: "state",
  ROUND_RESULT: "roundResult",
  MATCH_RESULT: "matchResult",
  OPPONENT_LEFT: "opponentLeft",
  PONG: "pong",
  // client -> server
  QUEUE: "queue",
  CANCEL: "cancel",
  INPUT: "input",
  REMATCH: "rematch",
  LEAVE: "leave",
  PING: "ping",
};

/** Match phases reported in state snapshots. */
export const PHASE = {
  COUNTDOWN: "countdown",
  LIVE: "live",
  ROUND_END: "roundEnd",
  MATCH_END: "matchEnd",
};

/** One-shot gameplay events attached to snapshots (drive sfx / particles). */
export const EVENT = {
  SHOOT: "shoot",
  HIT: "hit",
  RELOAD_START: "reloadStart",
  RELOAD_DONE: "reloadDone",
  EMPTY: "empty",
  DEATH: "death",
};

/**
 * Compute the playable rectangle for a given round number (1-indexed).
 * @param {number} round
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function playableBounds(round) {
  const inset = ROUNDS.shrinkInset[Math.min(round, ROUNDS.shrinkInset.length - 1)] || 0;
  return {
    minX: inset,
    minY: inset,
    maxX: ARENA.width - inset,
    maxY: ARENA.height - inset,
  };
}

export const TICK_MS = 1000 / NET.tickHz;

/**
 * Single-player Campaign tuning (client-side only). Mirrors the arcade's Space
 * Invaders loop: clear escalating levels, earn coins, spend them in a shop.
 */
export const CAMPAIGN = {
  totalLevels: 12,
  maxUpgradeLevel: 6,
  coinPerHit: 2,
  levelClearCoins: 10, // + level * 4
  /** @type {Record<string,{label:string,desc:string,baseCost:number,step:number}>} */
  upgrades: {
    damage: { label: "Damage", desc: "Harder-hitting blaster bolts", baseCost: 8, step: 5 },
    firerate: { label: "Fire Rate", desc: "Shorter cooldown between shots", baseCost: 8, step: 5 },
    speed: { label: "Speed", desc: "Move around the arena faster", baseCost: 6, step: 4 },
    vitality: { label: "Vitality", desc: "Raise your maximum health", baseCost: 7, step: 5 },
    multishot: { label: "Multi-Shot", desc: "Fire extra bolts per shot", baseCost: 12, step: 8 },
    magazine: { label: "Magazine", desc: "Carry more shots per reload", baseCost: 7, step: 5 },
  },
};

export const UPGRADE_ORDER = ["damage", "firerate", "speed", "vitality", "multishot", "magazine"];

/**
 * Cost to raise an upgrade from `level` to `level+1`.
 * @param {string} key @param {number} level
 */
export function upgradeCost(key, level) {
  const m = CAMPAIGN.upgrades[key];
  return m.baseCost + m.step * level;
}

/** Derived player stats for a given upgrade level set. */
export function playerStats(upgrades) {
  const u = upgrades || {};
  const lvl = (k) => Math.max(0, Math.min(CAMPAIGN.maxUpgradeLevel, u[k] || 0));
  return {
    maxHealth: PLAYER.maxHealth + lvl("vitality") * 20,
    speed: PLAYER.speed + lvl("speed") * 22,
    damage: BLASTER.damage + lvl("damage") * 3,
    fireCooldownMs: Math.round(BLASTER.fireCooldownMs * (1 - lvl("firerate") * 0.09)),
    pellets: 1 + Math.floor(lvl("multishot") / 2),
    magazine: BLASTER.magazine + lvl("magazine"),
  };
}

/** Rival (enemy) stats scaled by campaign level (1-indexed). */
export function rivalStats(level) {
  const L = Math.max(1, level);
  return {
    maxHealth: 60 + L * 15,
    speed: PLAYER.speed * (0.82 + Math.min(L, 12) * 0.02),
    damage: 7 + Math.floor(L * 0.9),
    fireCooldownMs: Math.max(150, 320 - L * 13),
    aimSpread: Math.max(0.03, 0.28 - L * 0.02), // lower = more accurate
    magazine: BLASTER.magazine + Math.floor(L / 4),
  };
}
