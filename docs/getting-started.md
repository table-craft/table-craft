# Getting started

In this guide you will build **Coin Flip Duel**, a tiny dice game, play it in the browser against a bot, and then put
it online. It takes about ten minutes.

## 1. Install

Any bundler that understands `?raw` imports or plain `fetch` works. With Vite:

```bash
npm create vite@latest my-table -- --template react
cd my-table
npm install tablecraft three cannon-es
```

`react`, `react-dom`, `three` and `cannon-es` are peer dependencies — your app owns their versions.

## 2. Write the rules

Create `src/games/duel.js`. A game module is a plain script that assigns `module.exports`; the rules kit is available as
the global `T`.

```js
// src/games/duel.js
module.exports = {
  meta: { name: 'Coin Flip Duel', minPlayers: 2, maxPlayers: 2, description: 'First to 10 points wins.' },

  setup({ players, fx }) {
    fx({ type: 'banner', text: 'Coin Flip Duel', sub: 'First to 10' });
    return { players: players.map((p) => ({ id: p.id, name: p.name, score: 0 })), turn: 0, die: 0, log: [] };
  },

  moves: {
    roll(s, ctx) {
      const p = s.players[s.turn];
      if (p.id !== ctx.playerId) return { error: 'Not your turn' };   // rejected moves never change state
      const r = ctx.roll(6, { id: 'die', by: p.id });                // the 3D die lands on this result
      s.die = r.index;
      p.score += r.face;
      s.log.push(`${p.name} rolled ${r.face}.`);
      s.turn = T.nextIndex(s.players.length, s.turn);
      return s;
    },
  },

  view(s, { playerId }) {
    const myTurn = s.players[s.turn].id === playerId;
    return {
      type: 'tabletop',
      scene: {
        seats: s.players.map((p, i) => ({ id: p.id, name: p.name, color: ['#c8642b', '#3f78a8'][i], active: i === s.turn })),
        zones: [{ id: 'tray', layout: 'row', at: [0, 0], size: [16, 12], mat: true, label: 'Dice tray' }],
        objects: [{ id: 'die', kind: 'die', zone: 'tray', value: s.die, size: 2.6, click: myTurn ? { name: 'roll' } : undefined }],
      },
      hud: {
        title: 'Coin Flip Duel',
        status: `${s.players[s.turn].name} to roll`,
        players: s.players.map((p, i) => ({ id: p.id, name: p.name, active: i === s.turn, me: p.id === playerId, stats: [{ label: 'Points', value: p.score, key: true }] })),
        prompt: myTurn ? { type: 'button', label: '🎲 Roll', move: { name: 'roll' } } : { type: 'text', text: 'Waiting…', muted: true },
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    const w = s.players.find((p) => p.score >= 10);
    return w ? { winners: [w.id], reason: `${w.name} reached ${w.score} points` } : null;
  },

  // Every legal move for this player right now. Bots and the referee use it.
  actions(s, { playerId }) {
    return s.players[s.turn].id === playerId ? [{ name: 'roll' }] : [];
  },
};
```

Three rules make everything else work:

1. **State is plain JSON** and every random number comes from `ctx.random` / `ctx.roll` — games are replayable.
2. **Moves validate.** Return `{ error }` instead of throwing; whose turn, phase, costs, ownership.
3. **`view()` is per player.** Anything you put there, that player can see. Leave opponents' secrets out.

## 3. Play it locally

```jsx
// src/App.jsx
import { createLocalMatch } from 'tablecraft';
import { TablecraftGame } from 'tablecraft/react';
import 'tablecraft/style.css';
import source from './games/duel.js?raw';

const match = createLocalMatch({ source, players: ['You', 'bot'] });

export default function App() {
  return <TablecraftGame client={match} style={{ height: '100vh', borderRadius: 0 }} />;
}
```

```bash
npm run dev
```

Click the glowing die. The bot answers after a short, readable pause; its roll shows up on the table, in the log
(press **L**) and in the turn indicator.

> **Why `?raw`?** Game modules are executed by Tablecraft's runtime — in a `node:vm` sandbox on servers, in a scoped
> function in the browser — not by your bundler. Pass the source text. `fetch('/games/duel.js').then((r) => r.text())`
> works too.

## 4. Check the rules with the referee

```js
// scripts/referee.mjs
import fs from 'node:fs';
import { simulate, summarize } from 'tablecraft/server';

const report = simulate(fs.readFileSync('src/games/duel.js', 'utf8'), { games: 200 });
console.log(summarize(report));
process.exit(report.ok ? 0 : 1);
```

```
200 games · 200 finished · 0 stuck · 0 hit the move cap · avg 5 moves
```

Put that in CI. When something is wrong you get the game, the move, the arguments and the error.
See [Bots & referee](testing.md).

## 5. Put it online

```js
// server.mjs
import fs from 'node:fs';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createRoomServer } from 'tablecraft/server';

const http = createServer();
const io = new Server(http, { cors: { origin: '*' } });
const rooms = createRoomServer(io.of('/tablecraft'));
const code = rooms.createRoom({ source: fs.readFileSync('src/games/duel.js', 'utf8') });
http.listen(3000, () => console.log(`room ${code}`));
```

```jsx
import { io } from 'socket.io-client';
import { connectRoom } from 'tablecraft';

const match = connectRoom({ io, url: 'http://localhost:3000', room: 'ABC123', name: 'Ada' });
// <TablecraftGame client={match} />  — the lobby lets the host seat bots and start
```

The client code is the same component; only the match changed. See [Server](server.md) for authentication, persistence
and deployment.

## Next steps

- Add cards: [Scene → cards and decks](scene.md#card) and [faces](scene.md#faces).
- Make other players' moves easy to follow: [Following the game](following-the-game.md).
- Add effects: [fx](fx.md). Theme the HUD: [Client → theming](client.md#theming).
- Read a complete game: [`examples/treasure-road/game.js`](../examples/treasure-road/game.js).
