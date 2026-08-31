# Blaster Duel — multiplayer game server

Blaster Duel is a real-time 1v1 online shooter in the arcade (open the arcade
with **P**, pick **Blaster Duel**). It uses a **standalone authoritative Node
WebSocket server** — the server owns all game state (positions, projectiles,
health, hits), so a tampered client cannot change its own health, ammo, or fake
hits. Clients do prediction + interpolation for smooth motion.

Because the server holds long-lived WebSocket connections, it **cannot run on
Vercel** (serverless). It runs as its own small process.

## Run it locally (development)

In one terminal, start the game server:

```bash
npm run game-server          # listens on ws://localhost:8787
```

In another terminal, start the site as usual:

```bash
npm run dev
```

When the site is served from `localhost`, the client automatically connects to
`ws://localhost:8787` — no config needed. Open the arcade in **two browser tabs**
(or two devices) and click **Play Online** in both to play a real 1v1. A lone
player can pick **Practice vs A.I.** (or wait ~8s for the "Play vs A.I." offer).

## Deploy it (production)

The site stays on Vercel. Deploy **this server** to any host that supports
long-lived WebSockets — e.g. Render, Railway, or Fly.io. It's a plain Node
process with one dependency (`ws`):

- Start command: `node server/blaster/index.mjs`
- It listens on `process.env.PORT` (falls back to `8787`).

Then point the site at it by setting an environment variable in Vercel:

```
NEXT_PUBLIC_BLASTER_SERVER_URL = wss://your-blaster-server.example.com
```

Use `wss://` (TLS) in production so it works on the HTTPS site. Redeploy the
site after setting the variable. If the variable is unset in production, the
game shows a clear "Can't reach the game server" screen with a Retry button.

## Layout

```
server/blaster/
  index.mjs   WebSocket transport + matchmaking + lifecycle (this file)
  room.mjs    authoritative match simulation (rounds, shrink zone, hit/health)
  bot.mjs     server-side AI opponent (feeds the same input pipeline as humans)

src/shared/blaster/   single source of truth shared by BOTH server and client
  config.mjs   arena, tuning numbers, protocol message types
  physics.mjs  collision / movement math (server sim + client prediction)

src/lib/blaster/      browser client (net, render, audio, input)
src/components/BlasterDuel.tsx   React UI (menu, matchmaking, HUD, results)
```
