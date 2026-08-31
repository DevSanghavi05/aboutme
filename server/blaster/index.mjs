// Blaster Duel — authoritative WebSocket game server (standalone Node process).
//
//   node server/blaster/index.mjs          # dev
//   PORT=8787 node server/blaster/index.mjs
//
// Responsibilities: accept WS connections, run matchmaking (human queue + AI
// fallback), own a single fixed-rate simulation loop that ticks every active
// Match, and relay authoritative snapshots. All gameplay authority lives in
// room.mjs; this file is transport + matchmaking + lifecycle only.

import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { MSG, NET, TICK_MS } from "../../src/shared/blaster/config.mjs";
import { Match } from "./room.mjs";

const PORT = Number(process.env.PORT) || 8787;

/** @type {Map<string, Client>} */
const clients = new Map();
/** @type {Map<string, Match>} */
const matches = new Map();
/** @type {string[]} human matchmaking queue (client ids) */
let queue = [];

const ADJECTIVES = ["Turbo", "Neon", "Astro", "Pixel", "Hyper", "Cosmic", "Volt", "Nova", "Zippy", "Blitz"];
const NOUNS = ["Fox", "Comet", "Blaster", "Racer", "Photon", "Falcon", "Spark", "Rocket", "Drift", "Nyx"];
function randomName() {
  return `${ADJECTIVES[(Math.random() * ADJECTIVES.length) | 0]}${NOUNS[(Math.random() * NOUNS.length) | 0]}`;
}

class Client {
  constructor(ws) {
    this.ws = ws;
    this.id = randomUUID();
    this.name = randomName();
    this.state = "idle"; // idle | queued | matched
    this.matchId = null;
    this.seat = null;
    this.lastMode = "pvp";
    this.botOfferTimer = null;
    this.lastSeen = Date.now();
  }

  send(msg) {
    if (this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        /* socket closing */
      }
    }
  }
}

const wss = new WebSocketServer({ port: PORT });
wss.on("listening", () => {
  console.log(`[blaster] authoritative server listening on ws://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  const client = new Client(ws);
  clients.set(client.id, client);
  client.send({ t: MSG.WELCOME, id: client.id, name: client.name });

  ws.on("message", (data) => {
    client.lastSeen = Date.now();
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    handleMessage(client, msg);
  });

  ws.on("close", () => handleDisconnect(client));
  ws.on("error", () => handleDisconnect(client));
});

function handleMessage(client, msg) {
  switch (msg.t) {
    case MSG.QUEUE:
      startQueue(client, msg.mode === "bot" ? "bot" : "pvp");
      break;
    case MSG.CANCEL:
      leaveQueue(client);
      client.state = "idle";
      break;
    case MSG.INPUT: {
      const match = client.matchId ? matches.get(client.matchId) : null;
      if (match && client.seat) match.setInput(client.seat, msg);
      break;
    }
    case MSG.REMATCH:
      returnToMenu(client, false);
      startQueue(client, client.lastMode);
      break;
    case MSG.LEAVE:
      returnToMenu(client, true);
      break;
    case MSG.PING:
      client.send({ t: MSG.PONG, id: msg.id, serverTime: Date.now() });
      break;
    default:
      break;
  }
}

function startQueue(client, mode) {
  if (client.state === "matched") return;
  leaveQueue(client);
  client.lastMode = mode;

  if (mode === "bot") {
    startMatch(client, null);
    return;
  }

  // Pair with a waiting human if one exists.
  const partnerId = queue.find((id) => id !== client.id);
  if (partnerId) {
    queue = queue.filter((id) => id !== partnerId && id !== client.id);
    const partner = clients.get(partnerId);
    clearBotOffer(partner);
    startMatch(partner, client);
    return;
  }

  // Otherwise wait, and offer an AI opponent after a timeout.
  queue.push(client.id);
  client.state = "queued";
  client.send({ t: MSG.SEARCHING });
  clearBotOffer(client);
  client.botOfferTimer = setTimeout(() => {
    if (client.state === "queued") client.send({ t: MSG.BOT_OFFER });
  }, NET.botSearchTimeoutMs);
}

function leaveQueue(client) {
  queue = queue.filter((id) => id !== client.id);
  clearBotOffer(client);
}

function clearBotOffer(client) {
  if (client && client.botOfferTimer) {
    clearTimeout(client.botOfferTimer);
    client.botOfferTimer = null;
  }
}

/**
 * Create a match. If `bClient` is null, seat B is an AI bot.
 * @param {Client} aClient
 * @param {Client|null} bClient
 */
function startMatch(aClient, bClient) {
  const id = randomUUID();
  const isBotMatch = !bClient;
  const emit = (seat, msg) => {
    const c = seat === "a" ? aClient : bClient;
    if (c) c.send(msg);
  };
  const match = new Match({
    id,
    aMeta: { name: aClient.name, isBot: false },
    bMeta: { name: bClient ? bClient.name : "A.I. Rival", isBot: isBotMatch },
    emit,
  });
  matches.set(id, match);

  bindClientToMatch(aClient, id, "a");
  aClient.send({ t: MSG.MATCH_FOUND, you: "a", opponent: match.meta.b.name, mode: isBotMatch ? "bot" : "pvp" });
  if (bClient) {
    bindClientToMatch(bClient, id, "b");
    bClient.send({ t: MSG.MATCH_FOUND, you: "b", opponent: match.meta.a.name, mode: "pvp" });
  }
}

function bindClientToMatch(client, matchId, seat) {
  client.state = "matched";
  client.matchId = matchId;
  client.seat = seat;
  clearBotOffer(client);
}

/** Reset a client to the menu, optionally telling their opponent they left. */
function returnToMenu(client, notifyOpponent) {
  leaveQueue(client);
  const match = client.matchId ? matches.get(client.matchId) : null;
  if (match) {
    const opponent = otherHuman(match, client);
    if (opponent) {
      if (notifyOpponent) opponent.send({ t: MSG.OPPONENT_LEFT });
      opponent.state = "idle";
      opponent.matchId = null;
      opponent.seat = null;
    }
    matches.delete(match.id);
  }
  client.state = "idle";
  client.matchId = null;
  client.seat = null;
}

function otherHuman(match, client) {
  for (const c of clients.values()) {
    if (c !== client && c.matchId === match.id) return c;
  }
  return null;
}

function handleDisconnect(client) {
  if (!clients.has(client.id)) return;
  const match = client.matchId ? matches.get(client.matchId) : null;
  if (match) {
    const opponent = otherHuman(match, client);
    if (opponent) {
      opponent.send({ t: MSG.OPPONENT_LEFT });
      opponent.state = "idle";
      opponent.matchId = null;
      opponent.seat = null;
    }
    matches.delete(match.id);
  }
  leaveQueue(client);
  clients.delete(client.id);
}

// --- Single fixed-rate simulation loop drives every active match. ---
setInterval(() => {
  const now = Date.now();
  for (const [id, match] of matches) {
    match.tick();
    if (match.finished) {
      // Keep finished matches briefly so late REMATCH/LEAVE resolve cleanly;
      // they are removed when a player leaves or disconnects.
    }
    void id;
  }
  // Drop silent clients (dead sockets) to free matchmaking slots.
  for (const client of clients.values()) {
    if (now - client.lastSeen > NET.timeoutMs) {
      try {
        client.ws.terminate();
      } catch {
        /* ignore */
      }
      handleDisconnect(client);
    }
  }
}, TICK_MS);

process.on("SIGINT", () => {
  console.log("\n[blaster] shutting down");
  wss.close();
  process.exit(0);
});
