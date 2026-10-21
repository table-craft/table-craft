# Game module

A game is one script that assigns `module.exports`. It runs inside Tablecraft's runtime: a `node:vm` context with
per-call time limits on servers, a scoped function in the browser. There is no `require`, network, timer or DOM;
the [rules kit](rules-kit.md) is available as the global `T`, and `clone(obj)` deep-copies JSON.

```js
module.exports = {
  meta: { ... },
  setup(ctx) { ... },
  moves: { ... },
  view(state, viewer) { ... },
  endIf(state) { ... },
  actions(state, viewer) { ... },     // recommended
  bot(state, input) { ... },          // optional
  score(state, viewer) { ... },       // optional: balance lab
  invariants(state) { ... },          // optional
};
```

Every value that crosses the boundary (state, args, views, fx) is JSON-copied. Store plain data only — no class
instances, `Map`s, functions or `undefined` you rely on.

## `meta`

| Field | Type | |
|---|---|---|
| `name` | string | Shown in the lobby |
| `minPlayers`, `maxPlayers` | number | `start` is refused below the minimum; joins above the maximum |
| `description` | string | Lobby subtitle |
| `seats` | `[{ id, label, team?, role?, max? }]` | Named seats (e.g. ship colours, factions). Players pick one in the lobby; bots fill free ones |
| `variants` | `[{ id, label }]` | Passed to `setup` as `options.variant` |

## `setup(ctx) → state`

| `ctx` | |
|---|---|
| `players` | `[{ id, name, seat, team, role }]` in seating order |
| `options` | `{ content, variant, ... }` — whatever the host passed (`content` is your game data: cards, maps…; `{}` when the host passed none) |
| `random` | seeded RNG: `float()`, `int(n)`, `shuffle(arr)`, `pick(arr)` |
| `fx(e)`, `roll()`, `rollMany()` | effects, see below |
| `now` | host time in ms (for sand timers) |

Return the initial state object.

## `moves`

```js
moves: {
  buy(state, ctx) {
    const p = state.players.find((x) => x.id === ctx.playerId);
    if (state.turn !== p.id) return { error: 'Not your turn' };
    if (!T.pay(p.gold, COST)) return { error: 'You cannot afford it' };
    // ...mutate and return state
    return state;
  },
}
```

| `ctx` | |
|---|---|
| `playerId`, `player` | who sent the intent (`player.id === 'system'` for an expired sand timer without a player) |
| `args` | the intent's arguments — **validate them**, they come from a client |
| `random` | seeded RNG, continues the match's stream |
| `fx(event)` | queue an [effect](fx.md) for clients |
| `roll(faces, { id, by, zone, to })` | roll one die and emit a 3D throw → `{ index, face }` |
| `rollMany([{ id, faces }], { by, zone, to })` | several dice at once → `[{ id, index, face }]` |
| `now` | host time in ms |

Return the new state, or `{ error: 'readable message' }` to reject. Rejected moves change nothing and the message is
shown to that player. Don't throw: a thrown error is reported as a module error.

`to: [playerIds]` makes the roll private: only those players see the dice thrown (the result is still yours to hide in
`view()`). `faces` is either a number of sides (`6`) or a list (`['Snow', 'Snow', 'Sun', 'Storm', 'Sun', 'Snow']`). Store
`index` on the state and render the die with `value: index` — the 3D die settles on that face.

## `view(state, { playerId, player }) → node`

Called once per connected player (and once with `playerId: 'spectator'`). Return:

```js
{ type: 'tabletop', scene, hud }
```

- `scene` — the 3D table: environment, seats, zones and objects. See [Scene](scene.md).
- `hud` — the 2D overlay: title, status, players, decision prompt, panels, log. See [HUD](hud.md).

**Hidden information lives here.** Don't put an opponent's hand faces, a deck's order or a secret role into another
player's view — not in `scene`, not in `hud`, not in a `tip`.

Returning any other `type` renders the [2D UI nodes](hud.md#ui-nodes) on their own, which is handy for quick prototypes.

## `endIf(state) → null | result`

Return `null` while the game runs. To finish:

```js
{ winners: ['p2'], reason: 'Ada reached the treasure',
  ranking: [{ id: 'p2', name: 'Ada', score: 18, place: 1 }, ...] }   // or scores: { p2: 18, p1: 12 }
```

The end screen shows the winner, reason and ranking. `winners` and the keys of `scores` are player ids — the end
screen turns them into names and seat colours. `T.score.result(players, { keys })` builds the whole result.

## `actions(state, { playerId }) → [{ name, args?, free?, label? }]`

Every move this player can legally make **right now**, with concrete `args`. This single function powers bots,
the "Add bot" button and the referee. Rules:

- Every listed action must succeed when applied.
- Mark negotiation-style moves that never advance the game (offers, chat, "cancel") with `free: true`. A player with only
  free actions counts as waiting.
- If nobody has a non-free action and `endIf` is `null` (and no sand timer is pending), the game is **stuck** — a bug.
- `label` is optional free text for your own tools (`T.pending.actions` adds one). The engine, bots and HUD ignore it;
  the MCP tool `get_state` passes it through with the action list.

## `bot(state, { playerId, actions, random }) → action`

Optional heuristic. Return one of `actions`. If it returns nothing valid, a random non-free action is used.

## `score(state, { playerId }) → number`

Optional. How good the position is for this player — higher is better (points, distance to the goal, material). The
[balance lab](balance.md) uses it for the greedy bot and to measure lead changes and comebacks. Keep it cheap; it is
called often.

## `invariants(state) → string[]`

Optional. Return descriptions of broken rules ("card count changed", "negative gold"). The referee checks it after
every move.

## Sand timers

```js
T.setDeadline(state, ctx.now, 30, 'endTurn', { timeout: true }, currentPlayerId);
```

When time runs out the host applies `endTurn({ timeout: true })` as that player. Show it with a
[`timer` object](scene.md#timer). Clear with `T.clearDeadline(state)`.

## TypeScript & editor autocomplete

Tablecraft ships type declarations. Put two lines at the top of a game file and VS Code (or any TypeScript-aware
editor) completes `T.*`, `ctx.*`, scene objects, HUD nodes and fx — and, with `// @ts-check`, flags mistakes such as
`layout: 'rows'` or an unknown fx `type`:

```js
// @ts-check
/// <reference types="tablecraft/game" />

/** @typedef {{ players: { id: string, name: string, score: number }[], turn: number }} State */

/** @type {import('tablecraft/game').GameModule<State>} */
module.exports = {
  setup({ players }) { return { players: players.map((p) => ({ id: p.id, name: p.name, score: 0 })), turn: 0 }; },
  moves: { /* ctx.args, ctx.roll, ctx.fx … are typed */ },
  view(state, { playerId }) { return { type: 'tabletop', scene: { zones: [], objects: [] } }; },
};
```

The reference declares the sandbox globals (`T`, `clone`, `module`); the import gives the contract types (`GameModule`,
`View`, `SceneObject`, `Fx`, `Move<State, Args>`, …). `@type` on `module.exports` types every parameter but only
loosely checks what functions return; for full checking of `view()` scenes and `endIf()` results use
`module.exports = /** @satisfies {import('tablecraft/game').GameModule<State>} */ ({ … });` instead. Annotate arrays
you build before returning them (`/** @type {import('tablecraft/game').SceneObject[]} */ const objects = [];`), or
plain JavaScript widens `'row'` to `string`. TypeScript hosts get the same types from `tablecraft`,
`tablecraft/server`, `tablecraft/react`, `tablecraft/engine` and `tablecraft/embed` (`tablecraft/react` needs
`@types/react`).

## Writing modules that read well

- Keep a `log` array and send the last ~40 lines in `hud.log`. Write one line per action **with the player's name and
  the card's title** — the [Spotlight](following-the-game.md) uses it to caption what happened.
- Keep object ids stable across views (the same physical card = the same id).
- Give centre zones a `label`; it becomes the caption "→ Market".
- Use `enterFrom` for cards that come out of a deck.
