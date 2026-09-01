// Blaster Duel — network client.
//
// Owns the WebSocket, applies client-side PREDICTION to the local player (input
// is felt instantly, then softly reconciled to the authoritative position), and
// INTERPOLATES the remote player + projectiles from a buffered snapshot history
// so their motion stays smooth despite discrete 30 Hz updates.

import {
  MSG,
  NET,
  OBSTACLES,
  PHASE,
  PLAYER,
  type GameEvent,
  type InputState,
  type PlayerState,
  type Projectile,
  type Seat,
  type ServerMessage,
  type Snapshot,
} from "./protocol";
import { resolveBody } from "@/shared/blaster/physics.mjs";

export interface RenderState {
  mySeat: Seat;
  me: PlayerState;
  foe: PlayerState;
  extraFoes?: PlayerState[];
  projectiles: Projectile[];
  obstacles: { x: number; y: number; w: number; h: number }[];
  phase: string;
  round: number;
  bestOf: number;
  score: { a: number; b: number };
  countdownMs: number;
  bounds: Snapshot["bounds"];
}

export interface NetHandlers {
  onWelcome?: (name: string) => void;
  onSearching?: () => void;
  onBotOffer?: () => void;
  onMatchFound?: (you: Seat, opponent: string, mode: "pvp" | "bot") => void;
  onRoundResult?: (winner: Seat, round: number, score: { a: number; b: number }) => void;
  onMatchResult?: (winner: Seat, score: { a: number; b: number }) => void;
  onOpponentLeft?: () => void;
  onEvents?: (events: GameEvent[], mySeat: Seat) => void;
  onClose?: () => void;
  onError?: () => void;
  onLatency?: (ms: number) => void;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private handlers: NetHandlers;
  private url: string;

  id = "";
  name = "";
  mySeat: Seat | null = null;
  opponentName = "";
  mode: "pvp" | "bot" = "pvp";
  connected = false;
  latencyMs = 0;

  private latest: Snapshot | null = null;
  private buffer: { clientTime: number; snap: Snapshot }[] = [];
  private predicted: { x: number; y: number } | null = null;
  private currentInput: InputState = { up: false, down: false, left: false, right: false, fire: false, reload: false, aim: 0 };
  private inputSeq = 0;
  private lastSentAt = 0;
  private lastUpdate = 0;
  private pingSeq = 0;
  private pingSentAt = new Map<number, number>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(url: string, handlers: NetHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.handlers.onError?.();
      return;
    }
    this.ws.onopen = () => {
      this.connected = true;
      this.pingTimer = setInterval(() => this.ping(), NET.heartbeatMs);
    };
    this.ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      this.handle(msg);
    };
    this.ws.onclose = () => {
      this.connected = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.handlers.onClose?.();
    };
    this.ws.onerror = () => {
      this.handlers.onError?.();
    };
  }

  private send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private ping() {
    const id = ++this.pingSeq;
    this.pingSentAt.set(id, performance.now());
    this.send({ t: MSG.PING, id });
  }

  private handle(msg: ServerMessage) {
    switch (msg.t) {
      case "welcome":
        this.id = msg.id;
        this.name = msg.name;
        this.handlers.onWelcome?.(msg.name);
        break;
      case "searching":
        this.handlers.onSearching?.();
        break;
      case "botOffer":
        this.handlers.onBotOffer?.();
        break;
      case "matchFound":
        this.mySeat = msg.you;
        this.opponentName = msg.opponent;
        this.mode = msg.mode;
        this.latest = null;
        this.buffer = [];
        this.predicted = null;
        this.handlers.onMatchFound?.(msg.you, msg.opponent, msg.mode);
        break;
      case "state":
        this.onSnapshot(msg);
        break;
      case "roundResult":
        this.handlers.onRoundResult?.(msg.winner, msg.round, msg.score);
        break;
      case "matchResult":
        this.handlers.onMatchResult?.(msg.winner, msg.score);
        break;
      case "opponentLeft":
        this.handlers.onOpponentLeft?.();
        break;
      case "pong": {
        const sent = this.pingSentAt.get(msg.id);
        if (sent != null) {
          this.latencyMs = Math.round(performance.now() - sent);
          this.pingSentAt.delete(msg.id);
          this.handlers.onLatency?.(this.latencyMs);
        }
        break;
      }
    }
  }

  private onSnapshot(snap: Snapshot) {
    this.latest = snap;
    const now = performance.now();
    this.buffer.push({ clientTime: now, snap });
    if (this.buffer.length > 40) this.buffer.shift();
    if (this.mySeat && snap.events.length) {
      this.handlers.onEvents?.(snap.events, this.mySeat);
    }
  }

  // --- Matchmaking / lifecycle commands ---
  queue(mode: "pvp" | "bot") {
    this.send({ t: MSG.QUEUE, mode });
  }
  cancel() {
    this.send({ t: MSG.CANCEL });
  }
  rematch() {
    this.send({ t: MSG.REMATCH });
  }
  leave() {
    this.send({ t: MSG.LEAVE });
  }
  close() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }

  setInput(input: InputState) {
    this.currentInput = input;
  }

  /** Advance prediction + reconcile + throttle-send input. Call once per frame. */
  update(now: number) {
    if (this.lastUpdate === 0) this.lastUpdate = now;
    const dt = Math.min((now - this.lastUpdate) / 1000, 0.1);
    this.lastUpdate = now;

    const snap = this.latest;
    if (!snap || !this.mySeat) return;
    const me = snap.players[this.mySeat];
    if (!this.predicted) this.predicted = { x: me.x, y: me.y };

    if (snap.phase === PHASE.LIVE && me.alive) {
      const i = this.currentInput;
      let mx = (i.right ? 1 : 0) - (i.left ? 1 : 0);
      let my = (i.down ? 1 : 0) - (i.up ? 1 : 0);
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        this.predicted.x += (mx / len) * PLAYER.speed * dt;
        this.predicted.y += (my / len) * PLAYER.speed * dt;
      }
      const res = resolveBody(this.predicted.x, this.predicted.y, PLAYER.radius, snap.bounds);
      this.predicted.x = res.x;
      this.predicted.y = res.y;

      // Reconcile toward authoritative position.
      const ex = me.x - this.predicted.x;
      const ey = me.y - this.predicted.y;
      const err = Math.hypot(ex, ey);
      if (err > 140) {
        this.predicted.x = me.x;
        this.predicted.y = me.y;
      } else if (err > 1.5) {
        const k = 1 - Math.exp(-6 * dt);
        this.predicted.x += ex * k;
        this.predicted.y += ey * k;
      }
    } else {
      this.predicted.x = me.x;
      this.predicted.y = me.y;
    }

    if (now - this.lastSentAt >= 1000 / NET.inputHz) {
      this.lastSentAt = now;
      this.send({ t: MSG.INPUT, seq: ++this.inputSeq, ...this.currentInput });
    }
  }

  getRenderState(now: number): RenderState | null {
    const snap = this.latest;
    if (!snap || !this.mySeat || !this.predicted) return null;
    const foeSeat: Seat = this.mySeat === "a" ? "b" : "a";
    const authoritativeMe = snap.players[this.mySeat];
    const authoritativeFoe = snap.players[foeSeat];

    const me: PlayerState = { ...authoritativeMe, x: this.predicted.x, y: this.predicted.y };
    const { foe, projectiles } = this.interpolate(now, foeSeat, authoritativeFoe);

    return {
      mySeat: this.mySeat,
      me,
      foe,
      projectiles,
      obstacles: OBSTACLES,
      phase: snap.phase,
      round: snap.round,
      bestOf: snap.bestOf,
      score: snap.score,
      countdownMs: snap.countdownMs,
      bounds: snap.bounds,
    };
  }

  private interpolate(now: number, foeSeat: Seat, fallbackFoe: PlayerState) {
    const renderTime = now - NET.interpolationMs;
    const buf = this.buffer;
    if (buf.length < 2) {
      const p = this.latest ? this.latest.projectiles : [];
      return { foe: fallbackFoe, projectiles: p };
    }

    let older = buf[0];
    let newer = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].clientTime <= renderTime && buf[i + 1].clientTime >= renderTime) {
        older = buf[i];
        newer = buf[i + 1];
        break;
      }
    }
    const span = newer.clientTime - older.clientTime;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - older.clientTime) / span)) : 1;

    const fa = older.snap.players[foeSeat];
    const fb = newer.snap.players[foeSeat];
    const foe: PlayerState = {
      ...fb,
      x: lerp(fa.x, fb.x, t),
      y: lerp(fa.y, fb.y, t),
      aim: lerpAngle(fa.aim, fb.aim, t),
    };

    // Projectiles: interpolate ids present in both frames, else show the newer.
    const olderById = new Map(older.snap.projectiles.map((p) => [p.id, p]));
    const projectiles: Projectile[] = newer.snap.projectiles.map((p) => {
      const prev = olderById.get(p.id);
      if (prev) return { ...p, x: lerp(prev.x, p.x, t), y: lerp(prev.y, p.y, t) };
      return p;
    });

    return { foe, projectiles };
  }
}
