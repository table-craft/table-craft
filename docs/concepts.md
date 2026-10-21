# Concepts

Tablecraft has five moving parts. Once these click, the rest of the docs are lookup tables.

```
            intents { name, args }
   ┌──────────────────────────────────────────────┐
   ▼                                              │
┌────────┐   setup / moves / view   ┌─────────────┴──┐   view + fx (per player)   ┌───────────────┐
│ game.js│ ───────────────────────▶ │      Host      │ ─────────────────────────▶ │  <Tabletop>   │
└────────┘                          │ Match · runtime│                            │ 3D table + HUD│
                                    │ bots · timers  │                            └───────────────┘
                                    └────────────────┘
```

## Game module

One JavaScript file that owns the rules: how the table is set up, which moves exist and what each player can see.
It never touches the DOM, the network or timers. See [Game module](game-module.md).

## Host

Something has to run the module and be the single source of truth. Tablecraft ships two hosts with the same behaviour:

| Host | Where | Use it for |
|---|---|---|
| `createLocalMatch()` | the browser | demos, solo play against bots, fast iteration while writing rules |
| `createRoomServer()` | Node + socket.io | real multiplayer, spectators, anything where players must not cheat |

Both wrap a `Match` — the lobby → playing → finished state machine with seats, bots, sand timers and pacing — and both
return the same **MatchClient** interface to the UI, so switching from local to online is a one-line change.

## Views, not state

Clients never receive the game state. After every change the host calls `view(state, { playerId })` **for each
player** and sends the result. The view contains a 3D `scene` (zones and objects) and a `hud`. Hidden information is
simply absent: an opponent's card has `faceUp: false` and no `face`; a deck has a `count`, never an order.

Because objects keep stable `id`s, the client can diff two views and animate the difference: a card that moved from
the market to your hand flies there; a card whose `faceUp` changed flips; a token stack whose `count` grew gets coins
dropped on it. You never write animation code for state changes.

## Intents

Players click glowing objects (`click: { name, args }`) or submit forms in the HUD. Both send an **intent** — a move
name and arguments — to the host. The host runs `moves[name](state, ctx)`; the move validates and either returns the
new state or `{ error }`. Errors go back to the sender only; nothing changes.

## Effects (fx)

Some things are not state: the roll of a die, a "Round 3" banner, a storm that shakes the camera. Moves emit them with
`ctx.fx(...)` (and `ctx.roll()` emits the dice throw), the host forwards them alongside the next view, and the client
plays them once. `to: [playerIds]` makes an effect private. See [Effects](fx.md).

## Determinism

`ctx.random` is a seeded generator whose state is stored with the match. Given the same seed and the same intents, a
game replays identically — on the server, in the browser, in the referee. Never use `Math.random()` or `Date.now()` in
a module; use `ctx.random` and `ctx.now`.

## Bots, pacing and the referee

If a module exports `actions(state, { playerId })` — every legal move for that player right now — bots can play it
(optionally guided by `bot()`), and the referee can play hundreds of games looking for crashes, rejected moves, stuck
states and broken invariants. Hosts pace bot moves so humans can follow: longer after dice, banners and reveals. See
[Bots & referee](testing.md) and [Following the game](following-the-game.md).
