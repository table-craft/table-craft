# Server

`tablecraft/server` is the Node side: the sandboxed runtime, the referee and a socket.io room server. It is plain ESM
and also loads with `require('tablecraft/server')` on Node ≥ 22.12.

## Exports

| Export | |
|---|---|
| `createRoomServer`, `Match`, `GameModule`, `CALL_TIMEOUT` | hosts and the sandboxed runtime (below) |
| `simulate`, `validate`, `summarize`, `testPlayers` | the [referee](testing.md) |
| `analyzeBalance`, `sweepParameter`, `compareReports`, `sweepPoint`, `BOT_PROFILES` | the [balance lab](balance.md) |
| `audit(source, opts)` | the view audit (same checks as the MCP tool [`audit_views`](mcp.md#audit_views)); the browser core exports it as `auditViews` |
| `simulateAsync`, `analyzeBalanceAsync` | `simulate` / `analyzeBalance` in a worker thread |
| `T`, `KIT_SOURCE`, `makeRandom`, `randomSeed`, `checkScene`, `PACE`, `botDelay`, `visibleFx`, `chooseBotMove`, `isBotId` | shared helpers |
| `configure({ locale })`, `addLocale`, `msg` | engine messages |

`simulate`, `validate`, `analyzeBalance`, `sweepParameter` and `audit` take module source text or a loaded
`GameModule`. `simulateAsync` and `analyzeBalanceAsync` take **source text only** (it is sent to the worker thread).

`tablecraft/server` has no `setLocale` (use `configure`), `createKit`, `createReplay` or `replayMatch` — import those from
`tablecraft`.

## Room server

```js
import fs from 'node:fs';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoomServer } from 'tablecraft/server';

const http = createServer(app);
const io = new Server(http, { cors: { origin: ['https://my-site.com'] } });

const rooms = createRoomServer(io.of('/tablecraft'), {
  identify: async (socket) => {           // optional: map your auth to a stable player id
    const user = await userFromToken(socket.handshake.auth.token);
    return user ? { id: `u_${user.id}`, name: user.name } : null;   // null → guest
  },
  onEvent: (room, e) => log(room.code, e),   // optional: 'join', 'start', 'move', 'finish', …
});

const code = rooms.createRoom({
  source: fs.readFileSync('games/treasure-road.js', 'utf8'),
  content: {},             // options.content for setup()
  options: {},             // e.g. { variant }
  pace: 'normal',
  assets: { card_wind: 'https://cdn…/wind.png' },
  // code: 'MYROOM', seed: 1234
});
```

| API | |
|---|---|
| `createRoom(opts) → code` | load a module and open a lobby; `source` (text) or `module` (a loaded `GameModule`) |
| `getRoom(code)` | `{ code, match, assets }` — `match` is the live `Match` |
| `deleteRoom(code)` | close it and stop its timers |
| `rooms` | `Map` of open rooms |

Rooms live in memory. For persistence, store `match.state`, `match.rng`, `match.players`, `match.seed` and `match.moves`
from `onEvent`, or build your own host on `Match` (it is a plain, synchronous state machine — see below).

### Wire protocol

Namespace of your choice (the client defaults to `/tablecraft`). Handshake `auth: { room, name, playerId? }`.

| Server → client | |
|---|---|
| `hello { playerId }` | the id this socket plays as (persist it to keep the seat on reload) |
| `session { code, status, players, host, you, meta, view, viewError, result, moves, pace, canBots, assets, fx, fxSeq }` | after every change; `view` and `fx` are per player |
| `fatal message` | room not found / not allowed |

| Client → server (with ack `{ ok, error? }`) | |
|---|---|
| `join { seat, name }` · `leave` | lobby |
| `addBot { seat }` · `removeBot { id }` · `start` · `restart` · `setPace { pace }` | host only |
| `move { name, args }` | play |

`connectRoom()` implements the client side; you only need the table above if you write a client in another stack.

## Match

The state machine behind both hosts — use it to build your own (a database-backed host, a Discord bot…):

```js
import { GameModule, Match, botDelay, visibleFx } from 'tablecraft/server';

const match = new Match(new GameModule(source), { content, pace: 'normal' });
match.join('u1', { name: 'Ada', seat: null });
match.addBot();
let fx = match.start();

fx = match.move('u1', 'roll', {});          // throws Error(message) when rejected
const next = match.nextBot();                // { player, name, fx } | null
const d = match.deadline();                  // pending sand timer or null
if (d && Date.now() >= d.at) fx = match.applyDeadline();

for (const p of match.players) send(p.id, { ...match.snapshot(p.id), fx: visibleFx(fx, p.id) });
setTimeout(runBots, botDelay(match.pace, fx));
```

## Runtime

```js
import { GameModule } from 'tablecraft/server';
const mod = new GameModule(source, { timeout: 500 });   // ms per call
mod.setup(players, seed, options, now)      // → { state, rng, fx }
mod.move(state, name, { playerId, player, args, now }, rng)   // → { state, rng, fx } | { error }
mod.view(state, player) · mod.endIf(state) · mod.actions(state, player) · mod.bot(...) · mod.invariants(state)
```

## Security

- Modules run in a `node:vm` context with string code generation disabled and a time limit per call. The rules kit
  lives in the sandbox's own realm, so modules can't reach host functions through it. **`node:vm` is not a security
  boundary against hostile code.** If you accept modules from untrusted authors, run the runtime in a separate process or
  container with resource limits.
- Clients only send intents. Validate `ctx.args` in every move — they come from the network.
- Hidden information is safe as long as `view()` leaves it out; the server never sends state.
- The browser runtime (`createLocalMatch`) is for your own modules: it runs in the page.

## Deploying

The room server is a plain socket.io namespace — mount it on your existing Express/Fastify/HTTP server. For several
instances, pin a room to one process (sticky sessions by room code) since rooms are in memory.
