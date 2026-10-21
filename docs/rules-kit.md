# Rules kit `T`

Inside a game module, `T` is a global with small, well-tested helpers. They are pure (except where noted, they mutate
the arrays/objects you pass) and use the `random` you give them, so games stay deterministic.

Outside modules (tests, tools) import the same kit: `import { T } from 'tablecraft'`.

This page covers the basics. For common board-game mechanics — passing, phases, auctions, drafting, markets, deck
building, worker placement, majorities, set collection, tricks, bags and bust odds, hidden roles and more — see
**[Mechanics](mechanics.md)**.

## Dice

| | |
|---|---|
| `T.roll(random, faces)` | `faces` = number of sides or a list of faces → `{ index, face }`. No animation — use `ctx.roll` for a 3D throw |

## Decks

| | |
|---|---|
| `T.draw(deck, discard, random, n = 1)` | draws from the **front** of `deck`; when it runs out, `discard` is shuffled back in. Mutates both; returns the drawn cards (fewer if both are empty) |
| `T.drawOne(deck, discard, random)` | one card or `undefined` |

```js
const hand = T.draw(s.deck, s.discard, ctx.random, 5);
```

## Turn order

| | |
|---|---|
| `T.orderFrom(players, start, skip?)` | players clockwise from index `start`, leaving out those where `skip(p)` is true |
| `T.nextIndex(n, i, step = 1)` | next index with wrap-around (negative steps work) |

## Resources

For dictionaries like `{ wood: 2, ore: 1 }`:

| | |
|---|---|
| `T.sum(o)` | total |
| `T.add(target, delta, mul = 1)` | `target += delta * mul`, key by key |
| `T.canPay(have, cost)` | enough of everything? |
| `T.pay(have, cost)` | subtract if affordable → `true`, otherwise `false` and nothing changes |
| `T.lose(have, key, n)` | lose up to `n` without going negative → amount actually lost |

## Sand timer

| | |
|---|---|
| `T.setDeadline(state, ctx.now, seconds, moveName, args?, playerId?)` | when time is up the host applies `moveName(args)` as `playerId` (or the system). Stored in `state.$deadline` |
| `T.clearDeadline(state)` | cancel it |

Render it with a [`timer`](scene.md#timer) object: `{ kind: 'timer', endsAt: state.$deadline.at, duration: seconds }`.
The referee treats a pending deadline as "time passes", so timed games are never reported as stuck.

## Graphs

For route networks, supply lines and connections. Nodes are strings; `next(node)` returns the neighbours as
`[node, ...]` or with costs as `[[node, cost], ...]`.

| | |
|---|---|
| `T.findPath(start, goal, next, { maxCost }?)` | cheapest path → `{ path: [start, …, goal], cost }` or `null`. `goal` can be a predicate |
| `T.reachable(start, next)` | every node reachable from `start` (including it) |

```js
// are A and B connected by routes this player owns?
const mine = (c) => s.routes.filter((r) => r.owner === p.id && (r.a === c || r.b === c)).map((r) => (r.a === c ? r.b : r.a));
if (T.findPath(mission.a, mission.b, mine)) score(p, mission.points);
```

## Hex grids

Axial coordinates: cells are `'q,r'` keys (arrays `[q, r]` are accepted too). Corners and sides are shared by up to
three / two cells, so the kit gives each one **canonical key** — store those in your state and pass them to the scene
as `vertex` / `edge` (see [Hex maps](scene.md#hex-maps)).

| | |
|---|---|
| `T.hex.key(q, r)` · `T.hex.parse(key)` | `'q,r'` ↔ `[q, r]` |
| `T.hex.DIRS` | the six neighbour offsets; side `s` faces `DIRS[s]` |
| `T.hex.neighbor(cell, side)` · `T.hex.neighbors(cell)` | adjacent cells |
| `T.hex.distance(a, b)` | steps between two cells |
| `T.hex.ring(center, r)` · `T.hex.area(center, r)` | cells at exactly / within `r` steps (a hexagon-shaped map) |
| `T.hex.rect(cols, rows, orient?)` | a rectangular map |
| `T.hex.line(a, b)` | cells on a straight line |
| `T.hex.corner(cell, c)` · `T.hex.corners(cell)` | canonical corner keys `'q,r,c'` |
| `T.hex.edge(cell, s)` · `T.hex.edges(cell)` | canonical side keys `'q,r,s'` |
| `T.hex.cornerCells(v)` · `T.hex.edgeCells(e)` | the cells that share a corner / side |
| `T.hex.edgeCorners(e)` · `T.hex.cornerEdges(v)` · `T.hex.cornerNeighbors(v)` | the corner/side graph (roads between settlements) |
| `T.hex.path(from, to, cost?, { maxCost }?)` | cheapest cell path; `cost(cell, fromCell)` → a number (`true` = 1), or `false` / `null` / `Infinity` for impassable (default 1) |

```js
const map = new Set(T.hex.area('0,0', 3));
const route = T.hex.path(unit.cell, target, (c) => map.has(c) && s.terrain[c] !== 'mountain' && (s.terrain[c] === 'forest' ? 2 : 1));
```

## Helpers

`T.clamp(v, lo, hi)`, `T.range(n)`, `T.groupBy(arr, fn)`, and the global `clone(obj)` for a deep JSON copy.

## Mechanics

Namespaces for generic mechanics, documented with a catalog and examples in [Mechanics](mechanics.md):

| | |
|---|---|
| `T.turns` · `T.flow` · `T.pending` | turn order with passing, snake / score order · rounds, phases, end triggers · decision stack |
| `T.workers` · `T.rondel` · `T.track` | worker placement · rondels · tracks with milestones |
| `T.secret` · `T.auction` · `T.vote` · `T.trade` · `T.roles` | commit & reveal · open / once-around / Dutch / sealed auctions · votes · trades and bank rates · hidden roles |
| `T.market` · `T.draft` · `T.deckbuild` · `T.tricks` | face-up rows · pick and pass · deck/hand/discard zones · trick taking |
| `T.dice` · `T.bag` | dice pools and patterns · bag pulls, exact odds |
| `T.grid` | square grids: lines, line of sight, regions, n-in-a-row, polyomino shapes |
| `T.score` · `T.sets` · `T.area` | rankings and `endIf` results · set collection · area majorities |
