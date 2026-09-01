// Blaster Duel — typed client-side view of the shared protocol.
//
// Re-exports the shared runtime config (single source of truth, also used by the
// server) and layers TypeScript types over the wire messages for the client.

export {
  ARENA,
  OBSTACLES,
  SPAWNS,
  PLAYER,
  BLASTER,
  ROUNDS,
  NET,
  MSG,
  PHASE,
  EVENT,
  CAMPAIGN,
  UPGRADE_ORDER,
  MAPS,
  playableBounds,
  mapForLevel,
  upgradeCost,
  playerStats,
  rivalStats,
} from "@/shared/blaster/config.mjs";

export type UpgradeKey = "damage" | "firerate" | "speed" | "vitality" | "multishot" | "magazine";
export type Upgrades = Record<UpgradeKey, number>;

export type Seat = "a" | "b";

export interface PlayerState {
  x: number;
  y: number;
  aim: number;
  hp: number;
  ammo: number;
  reloading: boolean;
  reloadRemainMs: number;
  alive: boolean;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Seat;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GameEvent {
  type: string;
  seat?: Seat;
  owner?: Seat;
  x?: number;
  y?: number;
  aim?: number;
  amount?: number;
  wall?: boolean;
}

export interface Snapshot {
  t: "state";
  tick: number;
  timeMs: number;
  phase: string;
  round: number;
  bestOf: number;
  score: { a: number; b: number };
  countdownMs: number;
  bounds: Bounds;
  players: { a: PlayerState; b: PlayerState };
  projectiles: Projectile[];
  events: GameEvent[];
  ackSeq: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  reload: boolean;
  aim: number;
}

export type ServerMessage =
  | { t: "welcome"; id: string; name: string }
  | { t: "searching" }
  | { t: "botOffer" }
  | { t: "matchFound"; you: Seat; opponent: string; mode: "pvp" | "bot" }
  | Snapshot
  | { t: "roundResult"; winner: Seat; round: number; score: { a: number; b: number } }
  | { t: "matchResult"; winner: Seat; score: { a: number; b: number } }
  | { t: "opponentLeft" }
  | { t: "pong"; id: number; serverTime: number };
