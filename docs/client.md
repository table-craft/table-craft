# Client

Three levels, pick the one that fits:

| | Import | You get |
|---|---|---|
| **Game** | `tablecraft/react` → `<TablecraftGame>` | lobby (seats, bots, start), table, end screen |
| **Table** | `tablecraft/react` → `<Tabletop>` | the 3D table + HUD for a view you provide |
| **Engine** | `tablecraft/engine` → `TabletopWorld` | three.js scene, layout, animation, dice — bring your own UI |

No React in your app? `tablecraft/embed` → `mountGame(element, props)` renders `<TablecraftGame>` for you.

Always import the styles once: `import 'tablecraft/style.css'`.

## Matches

A **MatchClient** is the source of truth the UI talks to. Two implementations, one interface:

```js
import { createLocalMatch, connectRoom } from 'tablecraft';

// in the browser, with bots — no server
const local = createLocalMatch({
  source,                         // module source text — or module: a loaded LocalGameModule
  players: ['Ada', 'bot', 'bot'], // or [{ name, seat }, { bot: true, seat }]
  content: {},                    // passed to setup as options.content
  options: {},                    // e.g. { variant: 'short' }
  seed, pace: 'normal', assets: {}, autoStart: true,
  playerId: 'you',                // your id (the first non-bot player)
});

// on a room server
import { io } from 'socket.io-client';
const online = connectRoom({ io, url: 'https://play.example.com', room: 'AB12CD', name: 'Ada', namespace: '/tablecraft',
  path: '/socket.io',             // optional: socket.io path on the server
  auth: {},                       // optional: extra handshake fields (e.g. a token for identify)
  storage: localStorage });       // optional: where the guest id is kept (getItem/setItem; null = don't keep it)
```

```ts
interface MatchClient {
  subscribe(fn: (snapshot) => void): () => void;
  getSnapshot(): Snapshot | null;
  move(name, args?): Promise<{ ok, error? }>;
  join(seat, name?), leave(), addBot(seat?), removeBot(id), start(), restart(), setPace(pace);
  dispose(): void;
}

```

Local matches also have `playerId`, `match` (the underlying `Match`) and `record()` (see [Replays](#replays)). Room
clients also have `playerId` (`null` until the server says hello), `error` (the `fatal` message, or `null`) and
`socket` (the socket.io socket).

`connectRoom` remembers the guest id in `storage` (default `localStorage`, key `tablecraft:pid`) so a reload keeps your
seat.

### Snapshots

| Field | |
|---|---|
| `status` | `'lobby'` · `'playing'` · `'finished'` · `'error'` |
| `players`, `host`, `you` | everyone at the table, the host's id, your player (`null` for spectators) |
| `meta` | the module's `meta` |
| `view`, `viewError` | your `view()` result, or the error it threw |
| `result` | the `endIf()` result once finished |
| `moves` | number of moves played so far |
| `pace`, `canBots` | bot pace; whether the module can play bots (`actions()` exists) |
| `assets`, `code` | asset map; room code (`'LOCAL'` for local matches) |
| `fx` | `{ seq, list }` — the effects of this change, or `null` |
| `serverOffset` | ms to add to `Date.now()` for host time (sand timers) |
| `local` | `true` on local matches |
| `fxSeq` | room clients: the server time (ms) the snapshot was sent |

An **error snapshot** is `{ status: 'error', error }` — the room was not found, the connection failed, or a replay
could not start. When a room closes after you joined, the last fields are kept alongside `status` and `error`.

## `<TablecraftGame>`

```jsx
<TablecraftGame client={match} locale="en" strings={{ yourTurn: 'Go!' }} name="Ada" style={{ height: '100vh' }} />
```

## `useMatch(client)`

```jsx
const { snapshot, tableProps, isHost } = useMatch(match);
if (snapshot?.status !== 'playing') return <MyLobby snapshot={snapshot} />;
return <Tabletop {...tableProps} headerExtra={<MyButtons />} />;
```

## `<Tabletop>`

| Prop | |
|---|---|
| `view` | `{ type: 'tabletop', scene, hud }` for this player |
| `fx` | `{ seq, list }` — a new `seq` plays `list` once |
| `onMove({ name, args })` | send an intent |
| `you` | `{ id, name }` of the viewing player |
| `assets` | `{ key: url }` for card art |
| `result` | `endIf()` result → end screen |
| `serverOffset` | ms to add to `Date.now()` for host time (sand timers) |
| `pace`, `onPace(p)` | show the bot-pace control (host only) |
| `locale`, `strings` | `'en'` (default) or `'tr'`, plus overrides |
| `headerExtra` | extra toolbar content |
| `className`, `style` | on the root `.tc-wrap` (it is `78vh` tall by default) |

### What players get

- **Toolbar:** camera presets (overview, my area, top-down), game log, sound, settings, controls help, fullscreen.
- **Settings** (saved per browser): volume, animation speed (*cinematic · normal · fast*), Spotlight (*large · side · off*),
  show my own moves, auto-focus on my turn, graphics (*high · performance*), bot pace (host).
- **Keyboard:** `1` `2` `3` cameras · `L` log · `Space` skip Spotlight · `M` mute · `F` fullscreen · `Esc` close · `?` help.
- **Mouse:** drag to rotate, right-drag to pan, wheel to zoom, hover a card for a large preview, click to act or enlarge.

## Replays

Games are deterministic, so a recording is just the inputs: seed, players, setup options and the move list
(`{ playerId, name, args, at, error? }` — `Match.moves` and the room server record exactly this). Replaying re-runs
setup and every move with the recorded time as `ctx.now`; rejected moves are kept as frames but not applied.

A local match hands you its recording with `client.record()` (`Match#record()` on the host) →
`{ seed, players, options, moves, startedAt }`, or `null` before the game starts. Store it, or put it in a link —
the [playground](https://table-craft.github.io/table-craft/playground.html)'s **Share replay** does exactly that.

```jsx
import { createReplay } from 'tablecraft';
import { ReplayViewer } from 'tablecraft/react';

const replay = createReplay({ source, seed, players, options, moves, startedAt, viewer: 'p1', assets });
<ReplayViewer replay={replay} locale="en" height="80vh" />
```

`<ReplayViewer>` is the 3D table plus a transport bar: play/pause (Space), step (← →), speed 0.5×–4×, a scrubber with
markers for rejected moves (red) and banners (gold), the current move, and **whose eyes** you watch through — each
player sees only what they saw during the game, or pick the spectator. One step forward animates the move like the live
game (Spotlight, sounds); jumps and steps back rebuild the table at that frame.

The replay is also a MatchClient (`subscribe` / `getSnapshot`, so `useMatch(replay)` works) with controls `play()`,
`pause()`, `step(±n)`, `seek(i)`, `setViewer(id | 'spectator')`, `setSpeed(x)` and `frames` / `timeline` for your own UI.
For analysis without a UI use `replayMatch(module, { seed, players, options, moves, startedAt })` →
`{ frames: [{ index, move, state, rng, fx, result, rejected }], ok, divergedAt }`. `ok` is false when a recorded move
behaves differently now — the rules or the game data changed since the game was played.

## Theming

The HUD is styled with custom properties on `.tc-wrap`:

```css
.my-table .tc-wrap {
  --tc-gold: #7fd3ff;         /* accent */
  --tc-gold-2: #3f9fd0;
  --tc-paper: #f4f6fb;        /* decision dock and panels */
  --tc-glass: rgba(10, 14, 28, .78);
  --tc-ui: "IBM Plex Sans", system-ui, sans-serif;
  --tc-serif: "Fraunces", Georgia, serif;
}
```

Card faces use `scene.theme.font` / `scene.theme.serif`. Lighting and table come from `scene.env` and `scene.table`.

## Locales

`locale="en"` and `locale="tr"` are built in. Override any string — or provide a whole language — with `strings`:

```jsx
<TablecraftGame client={m} strings={{ yourTurn: 'À vous !', verbs: { play: (n) => (n > 1 ? `a joué ${n} cartes` : 'a joué une carte') } }} />
```

Engine messages (move errors, referee report) are separate: `setLocale('tr')` / `addLocale(name, dict)` from `tablecraft`
(browser) or `configure({ locale })` from `tablecraft/server`.

## Engine

```js
import { TabletopWorld, TableAudio } from 'tablecraft/engine';

const world = new TabletopWorld(canvas, {
  audio: new TableAudio(),
  onMove: (intent) => send(intent),
  onHover: (h) => showTooltip(h),
  onEvent: (e) => { /* banner, toast, spot, rolled, ready */ },
});
world.setAssets(assets);
world.sync(view.scene, { youId });
world.playFx(fxList);
world.setCamera('top');
```

## Requirements

WebGL 2, ES2022. three.js ≥ 0.160 and cannon-es ≥ 0.20 as peer dependencies. Fonts (Inter, Playfair Display) are
bundled through `@fontsource` — no CDN.
