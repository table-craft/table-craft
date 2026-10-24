# Mechanics

Most board games are built from the same few dozen mechanics: pass to end the round, draft and pass hands, majority
scoring, worker placement, a face-up market, bust odds in a bag. The rules kit `T` ships small helpers for them, so a
game module only contains what makes **your** game different.

All of them follow the [rules kit](rules-kit.md) conventions:

- **Plain data.** Helpers create or mutate plain objects and arrays that **your state owns** (like `T.draw` and
  `T.pay` do). Nothing is hidden in closures, so state stays JSON, replayable and inspectable.
- **Deterministic.** Anything random takes the `random` you pass (`ctx.random`).
- **Getters** are a property name or a function: `'score'`, `(p) => p.vp + p.gold`. Ranking keys add a `-` prefix
  for "lower is better": `['vp', 'coins', '-seat']`.
- **Cards** are whatever you store (ids, objects). Where a helper takes a `card`, pass the card itself (`===`) or a
  predicate.
- Illegal operations return `false` / `null` / `undefined` and change nothing, so a move can turn them into an error.

## Catalog

### Turn structure

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Clockwise turns | each player in seat order | most games | `T.turns`, `T.nextIndex`, `T.orderFrom` |
| Pass to end the round | players act until they pass; the round ends when all have passed | Terraforming Mars (generations), Terra Mystica, Twilight Imperium | `T.turns.pass` / `next` / `done` |
| First passer starts | the first player to pass is next round's start player | Terra Mystica, Gaia Project | `T.turns.newRound(t, t.passed[0])` |
| Rotating start player | the start player moves one seat each round | Puerto Rico, Stone Age | `T.turns.rotate` |
| Turn order by score / initiative | the leader (or the last player) goes first | Power Grid, Kemet | `T.turns.by` |
| Snake order | 1-2-3-3-2-1 for drafts and setup placement | Catan setup, sports drafts | `T.turns.snake` |
| Rounds and phases | income → actions → cleanup, repeated | Agricola, Power Grid, Twilight Struggle | `T.flow` |
| Fixed game length | the game lasts N rounds | Agricola (14 rounds), 7 Wonders (3 ages) | `T.flow.create(phases, { rounds })` |
| Finish the round | the end trigger lets the round complete so everyone gets equal turns | Splendor, Azul, Ticket to Ride (final turns) | `T.flow.endAfterRound` |
| Pending decisions | "choose a target", reactions and interrupts, multi-step effects | Magic: The Gathering (the stack), Dominion (attacks) | `T.pending` |
| Sand timer | real-time limit on a turn | Galaxy Trucker, Escape | `T.setDeadline` (see [rules kit](rules-kit.md#sand-timer)) |

### Action selection

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Worker placement | put workers on action spaces with limited room; they return at round end | Agricola, Lords of Waterdeep, Stone Age | `T.workers` |
| Action points | spend a budget of points on any actions | Pandemic, Tikal, Forbidden Island | a resource: `T.pay(p, { ap: 1 })`, reset each turn |
| Rondel | move around a wheel of actions; a few steps are free, more cost | Imperial, Navegador, Antike | `T.rondel` |
| Simultaneous action selection | everyone picks secretly, then all reveal | 7 Wonders, Race for the Galaxy, Rock-paper-scissors | `T.secret` |
| Programmed actions | plan a sequence of moves secretly, then execute in order | RoboRally, Mechs vs. Minions | `T.secret` with a list as the choice |
| Role selection | pick a role whose action everyone performs | Puerto Rico, Citadels | `T.market` (role row) + `T.turns` |

### Cards

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Draw and discard | draw from a deck; reshuffle the discard when it runs out | most card games | `T.draw`, `T.drawOne` |
| Face-up market | a row of cards to buy, refilled from the deck | Splendor, Ticket to Ride, Century | `T.market` |
| Price by position | older cards get cheaper as they slide down the row | Through the Ages, Small World (race row), Century: Spice Road | `T.market.take` (slide) + `T.market.price` |
| Card drafting (pick and pass) | pick one card, pass the rest; direction alternates | 7 Wonders, Sushi Go, It's a Wonderful World | `T.draft.pick` / `pass` / `dir` + `T.secret` |
| Pool drafting | take from a shared row in turn | Ticket to Ride (face-up cards), Azul (factories), Sagrada (dice) | `T.draft.pick` + `T.turns.snake` |
| Deck building | personal deck, hand, play area and discard; buy cards into the discard | Dominion, Star Realms, Clank! | `T.deckbuild` |
| Trick taking | follow suit, trumps win, the winner leads | Hearts, Spades, The Crew, Wizard | `T.tricks` |
| Hand management | which cards to keep or play | most card games | arrays + `T.draft.pick` |

### Dice & luck

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Dice rolling | roll, then animate on the table | most games | `T.roll`, `ctx.roll`, `ctx.rollMany` |
| Dice pools and patterns | sets, straights, sums | Yahtzee, King of Tokyo, Roll for the Galaxy | `T.dice` |
| Re-roll | keep some dice, roll the rest | Yahtzee, King of Tokyo, Elder Sign | `T.dice.reroll` |
| Bag building / chit pulls | draw from a bag of tokens | Quacks of Quedlinburg, Orléans, Clank! (dragon bag) | `T.bag` |
| Push your luck | keep drawing or rolling until you stop or bust | Quacks, Can't Stop, Incan Gold, Zombie Dice | `T.bag.odds`, `T.dice.odds` (exact probabilities — great for bots) |

### Economy

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Resources and costs | pay costs from a dictionary of resources | Catan, Splendor, Agricola | `T.pay`, `T.canPay`, `T.add`, `T.lose` |
| Bank trades | trade 4:1 with the bank, 2:1 at a port | Catan | `T.trade.bank` |
| Player trading | offer, accept, cancel | Catan, Bohnanza, Chinatown | `T.trade.offer` / `accept` / `cancel` |
| Auctions — open | bid up in turn until everyone else passes | Power Grid, For Sale (buying round) | `T.auction` (`kind: 'open'`) |
| Auctions — once around | everyone bids once, highest wins | Modern Art (once around), Ra | `T.auction` (`kind: 'once'`) |
| Auctions — sealed bid | secret bids, highest wins (or second price) | Modern Art (sealed), Fist of Dragonstones | `T.secret` + `T.auction.sealed` |
| Auctions — Dutch | the price drops until someone takes it | The Queen's Necklace (unsold cards get cheaper) | `T.auction` (`kind: 'dutch'`) |
| Tracks | fame, morale, temperature; milestones fire when passed | Terraforming Mars (temperature), Scythe (triumph track), Pandemic (infection rate) | `T.track` |

### Map & space

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Square grid | cells, adjacency, distances | Chess, Go, Blood Bowl | `T.grid` |
| Hex grid | cells, corners and sides (settlements and roads) | Catan, Twilight Imperium, Hive | `T.hex` |
| Network / routes | connect cities through owned routes | Ticket to Ride, Power Grid | `T.findPath`, `T.reachable` |
| Line of sight | blocked cells hide what is behind | Space Hulk, Descent, Gloomhaven | `T.grid.lineOfSight`, `T.hex.line` |
| Movement and pathfinding | cheapest route with terrain costs | Gloomhaven, Memoir '44 | `T.grid.path`, `T.hex.path` |
| Connected groups | groups and territories of same-coloured cells | Go, Kingdomino (territories) | `T.grid.regions`, `T.grid.floodFill` |
| N in a row | connect four, tic-tac-toe, match-3 | Connect Four, Gomoku, match-3 puzzles | `T.grid.lineRuns` |
| Tile / polyomino placement | rotate, flip and fit shapes | Patchwork, Blokus, Cartographers | `T.grid.rotate` / `flip` / `orientations` / `fits` / `placements` |

### Scoring & ending

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Final ranking with tie-breakers | VP, then coins, then turn order | almost every game | `T.score.rank`, `T.score.result` (a ready `endIf` result) |
| Scoring tables | 1, 3, 6, 10, 15 for 1–5 items | Sushi Go (dumplings), Ticket to Ride (route lengths) | `T.score.table` |
| Set collection | pairs, n of a kind, sets of different kinds | Sushi Go, 7 Wonders (science), Jaipur | `T.sets` |
| Runs / sequences | longest straight | Rummy, Lost Cities, No Thanks! | `T.sets.runs` / `longest` |
| Area majority | most pieces in a region scores 5/3/1 | El Grande, Smash Up, Dominant Species | `T.area` |
| Milestones | thresholds on a track trigger once | Terraforming Mars (parameter bonuses), Scythe | `T.track.crossed` |
| End triggers | first to N points / deck runs out → finish the round | Splendor, 7 Wonders, Dominion | `T.flow.endAfterRound` |

### Interaction

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Voting | majority or plurality with tie rules and weighted votes | Secret Hitler, The Resistance (team votes), Republic of Rome | `T.vote` |
| Take that / targeting | choose an opponent or a card to hit | Munchkin, Dominion attacks | `T.pending` |
| Reactions and interrupts | another player may respond before an effect resolves | Magic: The Gathering, Dominion (Moat), Cosmic Encounter | `T.pending.push` (interrupt on top) |
| Negotiation | free offers that never advance the game | Catan, Chinatown | `T.trade` + `free: true` actions |

### Hidden information

| Mechanic | What it is | Games | Kit |
|---|---|---|---|
| Hidden roles and teams | dealt secretly; some roles know each other | The Resistance, Avalon, Werewolf, Secret Hitler | `T.roles.deal` / `known` / `who` |
| Commit and reveal | choices stay hidden until everyone is in | Rock-paper-scissors, 7 Wonders, Diplomacy | `T.secret.commit` / `view` / `reveal` |
| Hidden hands | each player sees only their own cards | most card games | `view()` (see [game module](game-module.md)) |

---

## T.turns

Turn order with passing. The object lives in your state: `t = { order, start, i, passed, once }`.

| | |
|---|---|
| `T.turns.create(ids, { start = 0, once = false }?)` | `start` is a seat index or a player id. `once`: every player takes exactly one turn per round |
| `T.turns.current(t)` | whose turn it is, or `null` when everyone has passed |
| `T.turns.next(t)` | advance to the next player who has not passed → their id, or `null` when the round is over. In `once` mode it marks the current player as done |
| `T.turns.pass(t, id?)` | `id` (default: the current player) passes for the rest of the round → `true` if everyone has now passed. `t.passed` keeps the passing order |
| `T.turns.done(t)` | has everyone passed? |
| `T.turns.newRound(t, start?)` | clear passes; `start` = seat index or id (default: the same start player) → the first player |
| `T.turns.rotate(t)` | new round, start player one seat on |
| `T.turns.snake(ids, n?)` | 1-2-3-3-2-1… pick order, `n` picks long (default: there and back) |
| `T.turns.by(players, keys)` | players sorted by ranking keys (higher first, `'-key'` lower first); full ties keep the given order |

```js
setup({ players }) {
  return { turn: T.turns.create(players.map((p) => p.id)), ... };
},
moves: {
  pass(s, { playerId }) {
    if (T.turns.current(s.turn) !== playerId) return { error: 'Not your turn' };
    if (T.turns.pass(s.turn)) {             // everyone has passed: next round
      endOfRound(s);
      T.turns.newRound(s.turn, s.turn.passed[0]); // the first to pass starts
    } else T.turns.next(s.turn);
    return s;
  },
},
// Power Grid: the leader goes first; equal cities → the biggest plant
s.turn.order = T.turns.by(s.players, ['cities', 'bestPlant']).map((p) => p.id);
```

## T.flow

Rounds and phases: `f = { phases, at, phase, round, lastRound, over }`.

| | |
|---|---|
| `T.flow.create(phases = ['main'], { rounds }?)` | `rounds`: the game ends after that many rounds |
| `T.flow.next(f)` | next phase (a new round after the last one) → its name, or `null` once the last round is complete (`f.over` becomes `true`) |
| `T.flow.goto(f, phase)` | jump to a phase of the current round |
| `T.flow.endAfterRound(f, extra = 0)` | end triggered: finish this round (plus `extra` more), never extending an earlier trigger |
| `T.flow.isLastRound(f)` | show "Last round!" |

```js
// Splendor-style: reaching 15 lets the round finish, so everyone gets the same number of turns
if (p.vp >= 15) T.flow.endAfterRound(s.flow);
...
if (!T.turns.next(s.turn)) { T.flow.next(s.flow); T.turns.newRound(s.turn); }
endIf: (s) => (s.flow.over ? T.score.result(s.players, { keys: ['vp', '-cards'] }) : null),
```

## T.pending

A stack of decisions waiting for a player: `{ playerId, kind, options?, ...your data }`. The top (last) one is
resolved first, and while it exists only its owner may act — so `actions()` stays simple.

| | |
|---|---|
| `T.pending.push(stack, d)` | on top: resolved next (interrupts, reactions) |
| `T.pending.queue(stack, d)` | at the bottom: after everything already pending (the next step of an effect) |
| `T.pending.top(stack)` · `T.pending.who(stack)` | the next decision / its player, or `null` |
| `T.pending.resolve(stack, playerId, choice)` | pops it if `playerId` owns it and `choice` is one of its `options` (compared as JSON) → the decision with `.choice`, else `null` |
| `T.pending.actions(stack, playerId, move = 'choose')` | one `{ name: move, args: { choice } }` per option; options that are not objects also get `label: String(option)` |

```js
moves: {
  playSpy(s, { playerId }) {
    const foes = s.players.filter((p) => p.id !== playerId).map((p) => p.id);
    T.pending.push(s.pending, { playerId, kind: 'spy', options: foes });
    return s;
  },
  choose(s, { playerId, args }) {
    const d = T.pending.resolve(s.pending, playerId, args.choice);
    if (!d) return { error: 'Not a valid choice' };
    if (d.kind === 'spy') peek(s, playerId, d.choice);
    return s;
  },
},
actions(s, { playerId }) {
  if (s.pending.length) return T.pending.actions(s.pending, playerId);
  ...
},
```

## T.workers

Worker placement: `board = { spaceId: { cap, workers: [playerId, ...], blocked? } }` (`cap: null` = unlimited).

| | |
|---|---|
| `T.workers.board(caps)` | `{ forest: 1, mine: 2, market: null }` → a board |
| `T.workers.canPlace(board, space, playerId, { onePerPlayer }?)` | room, not `blocked`, and (with `onePerPlayer`) not already there |
| `T.workers.place(board, space, playerId, opts?)` | → `true`, or `false` and nothing changes |
| `T.workers.available(board, playerId, opts?)` | the spaces this player may use now |
| `T.workers.spaces(board, playerId)` | the spaces this player occupies |
| `T.workers.returnAll(board)` | everyone's workers go home → `{ playerId: count }` |

```js
actions: (s, { playerId }) => T.workers.available(s.board, playerId).map((space) => ({ name: 'place', args: { space } })),
```

Action points need no helper: keep `p.ap`, spend with `T.pay(p, { ap: 2 })`, reset at the start of the turn.

## T.rondel

Positions `0..size-1` on a wheel; moving up to `free` steps is free, each extra step costs `cost`.

| | |
|---|---|
| `T.rondel.steps(from, to, size)` | steps forward |
| `T.rondel.cost(from, to, size, { free = 3, cost = 1 }?)` | the price of that move |
| `T.rondel.moves(from, size, { free, cost, max, budget }?)` | every reachable destination → `[{ to, steps, cost }]` |

```js
actions: (s, { playerId }) => T.rondel.moves(me.pos, 8, { budget: me.coins }).map((m) => ({ name: 'rondel', args: { to: m.to } })),
```

## T.track

| | |
|---|---|
| `T.track.move(holder, key, delta, { min, max, marks }?)` | `holder[key] += delta` within `[min, max]` → `{ value, moved, crossed }` |
| `T.track.crossed(before, after, marks)` | the marks passed on the way, in travel order |

```js
const r = T.track.move(s, 'temperature', 2, { max: 8, marks: [0, 4] });
for (const m of r.crossed) bonus(s, p, m); // first to raise the temperature past 0 and 4 gets a bonus
```

## T.trade

Uses resource dictionaries like `T.pay`. Offers are a list in your state: `{ id, from, to (null = anyone), give, get }`.

| | |
|---|---|
| `T.trade.swap(a, b, give, get)` | `a` gives `give` to `b`, `b` gives `get` to `a` — all or nothing → `true` / `false` |
| `T.trade.offer(offers, { from, to?, give, get })` | → the new offer (ids count up) |
| `T.trade.open(offers, playerId)` | offers this player may accept |
| `T.trade.accept(offers, id, by, wallet)` | `wallet`: `{ playerId: resources }` or a function → `true` when both could pay; the offer is removed |
| `T.trade.cancel(offers, id)` | → the removed offer or `null` |
| `T.trade.bank(have, give, get, rate = 4, n = 1)` | trade `rate × n` of one resource for `n` of another |

```js
accept(s, { playerId, args }) {
  if (!T.trade.accept(s.offers, args.id, playerId, (id) => P(s, id).res)) return { error: 'That trade is not possible' };
  return s;
},
// offers are negotiation: mark them free so bots and the referee don't count them as progress
actions: (s, { playerId }) => T.trade.open(s.offers, playerId).map((o) => ({ name: 'accept', args: { id: o.id }, free: true })),
```

## T.auction

One plain object for every turn-based auction: `T.auction.create(ids, opts)`.

| kind | |
|---|---|
| `'open'` (default) | bid or pass in turn until everyone but the leader has passed; passing is final |
| `'once'` | once around: everyone bids or passes exactly once, the highest bid wins |
| `'dutch'` | `price` drops by `step` (`T.auction.lower`) until someone takes it (`T.auction.take`) or it would drop below `floor` |

| | |
|---|---|
| `T.auction.create(ids, { kind, min = 1, step = 1, start = 0, price, floor, exclude }?)` | `start`: seat index or id of the first bidder; Dutch `exclude` removes ineligible ids (no eligible bidders closes without a sale) |
| `T.auction.turn(a)` · `T.auction.minBid(a)` | who bids next (`null` when over) / the lowest legal bid |
| `T.auction.bid(a, id, amount)` · `T.auction.pass(a, id)` | → `true`, or `false` when it is not their turn or the bid is too low |
| `T.auction.legalBids(a, id, budget)` | the amounts `id` may bid now, up to `budget` — for `actions()` |
| `T.auction.decline(a, id)` | record a Dutch decline; the last eligible decline lowers the price once; `false` for an ineligible or repeated response |
| `T.auction.lower(a)` · `T.auction.take(a, id)` | lower a Dutch price (clears declines) / take it if eligible and not declined at this price |
| `T.auction.done(a)` · `T.auction.winner(a)` | over? / `{ id, price }` or `null` (nobody bid) |
| `T.auction.sealed(bids, { order, random, price }?)` | `{ playerId: amount }` → `{ id, bid, price, tied }` or `null`. Top ties go to the first in `order`, else a `random` pick, else the first bid. `price: 'second'` = second-highest bid (Vickrey) |

```js
moves: {
  bid(s, { playerId, args }) {
    if (!T.auction.bid(s.auction, playerId, args.amount)) return { error: 'You cannot bid that now' };
    return settle(s);
  },
  pass(s, { playerId }) { if (!T.auction.pass(s.auction, playerId)) return { error: 'Not your turn' }; return settle(s); },
},
actions(s, { playerId }) {
  if (T.auction.turn(s.auction) !== playerId) return [];
  const bids = T.auction.legalBids(s.auction, playerId, me.money).slice(0, 5); // a few raises are enough for bots
  return [{ name: 'pass' }, ...bids.map((amount) => ({ name: 'bid', args: { amount } }))];
},
// settle(s): if (T.auction.done(s.auction)) { const w = T.auction.winner(s.auction); if (w) buy(s, w.id, w.price); ... }
```

## T.secret

Simultaneous secret choices — commit, then reveal: `slot = { ids, choices, revealed }`.

| | |
|---|---|
| `T.secret.create(ids)` | a new slot for these players |
| `T.secret.commit(slot, id, choice)` | until the reveal a player may change their mind → `false` for outsiders, after the reveal or when `choice` is `undefined` |
| `T.secret.pending(slot)` · `T.secret.allIn(slot)` | who still has to choose / is everyone in? |
| `T.secret.reveal(slot)` | → `{ playerId: choice }` |
| `T.secret.view(slot, viewerId, mask = true)` | for `view()`: your own choice, `mask` for others who chose, `null` for those who didn't — until revealed |

```js
moves: {
  choose(s, { playerId, args }) {
    if (!T.secret.commit(s.signs, playerId, args.sign)) return { error: 'Too late' };
    if (T.secret.allIn(s.signs)) score(s, T.secret.reveal(s.signs)); // all signs at once
    return s;
  },
},
view(s, { playerId }) {
  const signs = T.secret.view(s.signs, playerId, '?'); // never leak other players' choices
  ...
},
actions: (s, { playerId }) => (T.secret.pending(s.signs).includes(playerId) ? ['rock', 'paper', 'scissors'].map((sign) => ({ name: 'choose', args: { sign } })) : []),
```

Sealed bids are a commit with a number: `T.auction.sealed(T.secret.reveal(s.bids))`.

## T.vote

`votes = { voterId: choice }` (`null` abstains).

| | |
|---|---|
| `T.vote.tally(votes, weight?)` | `{ choice: votes }`; `weight`: `{ voterId: n }` or a function |
| `T.vote.result(votes, { weight, tie, random, need }?)` | → `{ winner, counts, tied }`. `tie`: `'none'` (default, no winner), `'random'` (needs `random`) or a priority list of choices. `need`: a number, or `'majority'` (more than half the votes cast) |

```js
const r = T.vote.result(T.secret.reveal(s.ballot), { need: 'majority' }); // Secret Hitler-style: ja needs a majority
if (r.winner === 'ja') enact(s); else s.failed += 1;
```

## T.roles

| | |
|---|---|
| `T.roles.deal(ids, roles, random)` | `roles`: a list, or `{ playerCount: list }` → `{ roles: { playerId: role }, rest: [set-aside roles] }`. Throws when there are too few roles |
| `T.roles.who(roles, role)` | ids with a role (a role, a list or a predicate) |
| `T.roles.known(roles, viewerId, sees)` | what `viewerId` knows → `{ playerId: role or label }`, always including themselves. `sees: { viewerRole: [roles] }` reveals exact roles, `{ viewerRole: { role: label } }` only a label |

```js
const SEES = { spy: ['spy', 'assassin'], assassin: ['spy', 'assassin'], merlin: { spy: 'evil', assassin: 'evil' } };
setup({ players, random }) {
  const { roles } = T.roles.deal(players.map((p) => p.id), { 5: ['merlin', 'loyal', 'loyal', 'spy', 'assassin'], 6: [...] }, random);
  return { roles, ... };
},
view(s, { playerId }) {
  const known = T.roles.known(s.roles, playerId, SEES); // only what this player may see
  ...
},
```

## T.market

A face-up row: an array of cards, where an empty slot is `null` (when cards don't slide).

| | |
|---|---|
| `T.market.refill(row, size, deck, discard, random, opts?)` | fill holes, then up to `size` cards, via `T.draw` → the new cards. `opts.reshuffle` defaults to `true`; set it to `false` to leave the discard pile untouched |
| `T.market.take(row, i, slide = true)` | take the card in slot `i` → the card. `slide`: later cards move down a slot (getting cheaper); `false` leaves a hole |
| `T.market.price(i, costs)` | `costs[i]` from a list (the last repeats), or `i × costs` for a number |
| `T.market.clear(row, discard?)` | wipe the row (into `discard`) → the removed cards |

```js
buy(s, { playerId, args }) {
  const p = P(s, playerId); const cost = T.market.price(args.slot, [0, 1, 2, 3, 4]);
  if (s.row[args.slot] == null || !T.pay(p.res, { gold: cost })) return { error: 'Cannot buy that' };
  p.cards.push(T.market.take(s.row, args.slot));
  T.market.refill(s.row, 5, s.deck, s.discard, ctx.random);
  return s;
},
```

## T.draft

| | |
|---|---|
| `T.draft.pick(from, card, to?)` | move a card from one list to another (pool → picks, hand → tableau) → the card or `undefined` |
| `T.draft.pass(hands, order, dir = 1)` | `hands: { playerId: [cards] }`; every hand moves `dir` seats along `order` |
| `T.draft.dir(round)` | 1, −1, 1… for rounds 1, 2, 3 (left, right, left) |

```js
// 7 Wonders: everyone picks secretly, then hands are passed
pick(s, { playerId, args }) {
  if (!s.hands[playerId].includes(args.card) || !T.secret.commit(s.picks, playerId, args.card)) return { error: 'Cannot pick that' };
  if (T.secret.allIn(s.picks)) {
    for (const [id, card] of Object.entries(T.secret.reveal(s.picks))) T.draft.pick(s.hands[id], card, P(s, id).tableau);
    T.draft.pass(s.hands, s.order, T.draft.dir(s.age));
    s.picks = T.secret.create(s.order);
  }
  return s;
},
```

## T.deckbuild

Per-player zones `z = { deck, hand, discard, play }` (the front of `deck` is its top).

| | |
|---|---|
| `T.deckbuild.create(cards, random, handSize = 0)` | shuffled starting deck, optionally with a first hand |
| `T.deckbuild.draw(z, random, n = 1)` · `T.deckbuild.drawTo(z, random, size)` | draw into the hand, reshuffling the discard when needed → the drawn cards |
| `T.deckbuild.play(z, card)` · `T.deckbuild.discard(z, card)` | hand → play area / discard |
| `T.deckbuild.cleanup(z, random, handSize)` | hand and play area → discard, draw a new hand → the hand |
| `T.deckbuild.gain(z, card, to = 'discard')` | `to`: `'discard'`, `'hand'`, `'play'`, `'deck'` (top) or `'bottom'` |
| `T.deckbuild.trash(z, card, from = 'hand')` | remove a card from a zone → the card |
| `T.deckbuild.all(z)` | every card the player owns (end scoring) |

```js
setup: ({ players, random }) => ({ decks: Object.fromEntries(players.map((p) => [p.id, T.deckbuild.create([...STARTER], random, 5)])), ... }),
endTurn(s, ctx) { T.deckbuild.cleanup(s.decks[ctx.playerId], ctx.random, 5); ... },
```

## T.tricks

A trick is `[{ id, card }]` in play order. Options: `{ suit = 'suit', rank = 'rank', order, trump, mustTrump }` —
`suit` / `rank` are getters, `order` lists ranks from low to high (otherwise ranks are numbers), `trump` is a suit or
`null`, and `mustTrump` forces a trump when you cannot follow suit.

| | |
|---|---|
| `T.tricks.lead(trick, opts)` | the suit led, or `null` |
| `T.tricks.legal(hand, trick, opts)` | the cards that may be played now (follow suit if able) |
| `T.tricks.winner(trick, opts)` | the winning `{ id, card }`: highest trump, else highest of the suit led. The winner leads next |

```js
const OPTS = { order: ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'], trump: 'hearts' };
actions: (s, { playerId }) => T.tricks.legal(hand(s, playerId), s.trick, OPTS).map((card) => ({ name: 'play', args: { card } })),
// when everyone has played: s.leader = T.tricks.winner(s.trick, OPTS).id
```

## T.dice

Pools are arrays of face values (`[3, 3, 5, 1, 6]`).

| | |
|---|---|
| `T.dice.roll(random, n, faces = 6)` | `n` dice → their faces. To throw them on the table use `ctx.rollMany` |
| `T.dice.reroll(values, indices, random, faces = 6)` | re-roll some dice in place |
| `T.dice.sum(values)` · `T.dice.counts(values)` | total / `{ face: n }` |
| `T.dice.groups(values)` · `T.dice.ofAKind(values)` | group sizes largest first (`[3, 2]`) / the largest group |
| `T.dice.straight(values)` | longest run of consecutive numbers |
| `T.dice.matches(values, pattern)` | `{ groups: [3, 2] }` full house, `{ groups: [2, 2] }` two pairs, `{ straight: 4 }`, `{ sum: [min, max] }` |
| `T.dice.odds(n, faces, test)` | exact probability that `n` dice satisfy `test(values)` (every outcome is enumerated: keep `faces^n` ≤ 10⁶) |

```js
const values = ctx.rollMany(T.range(5).map((i) => ({ id: `die${i}` }))).map((r) => r.face); // thrown on the table
const yahtzee = T.dice.matches(values, { groups: [5] }) ? 50 : 0;
const chance = T.dice.odds(3, 6, (d) => d.filter((x) => x === 6).length >= 2); // for a bot: worth re-rolling three?
```

## T.bag

A bag is a count per kind: `{ white: 4, orange: 6 }`. A deck's composition is a bag too: `T.sets.count(deck)`.

| | |
|---|---|
| `T.bag.draw(bag, random, n = 1, replace = false)` | `n` random pulls → the kinds; without `replace` they leave the bag |
| `T.bag.put(bag, kind, n = 1)` | return chits (or one of each kind in a list) |
| `T.bag.total(bag)` · `T.bag.chance(bag, kind)` | chits left / chance the next pull is `kind` (a kind, a list or a predicate) |
| `T.bag.odds(bag, k, test, replace = false)` | exact probability that `k` pulls satisfy `test(drawn)`; `drawn` has a count for every kind in the bag |

```js
// Quacks of Quedlinburg: chance that the next chip explodes the pot
const risk = T.bag.odds(s.bag[playerId], 1, (d) => whiteTotal(p) + d.white1 + 2 * d.white2 + 3 * d.white3 > 7);
bot: (s, { actions }) => actions.find((a) => a.name === (risk > 0.3 ? 'stop' : 'draw')),
```

## T.grid

Square grids: cells are `'x,y'` keys (arrays `[x, y]` are accepted too); `x` grows right, `y` grows down.

| | |
|---|---|
| `T.grid.key(x, y)` · `T.grid.parse(key)` | `'x,y'` ↔ `[x, y]` |
| `T.grid.DIRS4` · `T.grid.DIRS8` | neighbour offsets (orthogonal, then diagonal) |
| `T.grid.neighbors(cell, dirs = 4)` | `dirs`: `4`, `8`, or a neighbours function (e.g. `T.hex.neighbors`) |
| `T.grid.manhattan(a, b)` · `T.grid.chebyshev(a, b)` | rook-step / king-step distance |
| `T.grid.rect(cols, rows)` · `T.grid.inBounds(cell, cols, rows)` | every cell row by row / on the board? |
| `T.grid.line(a, b)` | Bresenham line, both ends included |
| `T.grid.lineOfSight(a, b, blocked)` | no cell strictly between `a` and `b` is `blocked(cell)` |
| `T.grid.path(from, to, cost?, { dirs, maxCost }?)` | cheapest path, as `T.hex.path`: `cost(cell, fromCell)` → a number (`true` = 1), or `false` / `null` / `Infinity` for impassable (default 1) |
| `T.grid.floodFill(start, ok, dirs = 4)` | cells reachable from `start` through cells where `ok(cell)` |
| `T.grid.regions(cells, value?, dirs = 4)` | connected groups of equal `value(cell)` → `[{ value, cells }]`; every cell is in exactly one group |
| `T.grid.lineRuns(cells, value, n = 3, { diagonal = true }?)` | maximal straight runs of ≥ `n` equal values → `[{ value, cells }]`; empty (`null`/`undefined`/`''`) never counts |

Polyomino shapes are lists of `[x, y]` offsets; results are normalised (smallest corner at `0,0`):

| | |
|---|---|
| `T.grid.normalize(shape)` · `T.grid.rotate(shape, times = 1)` · `T.grid.flip(shape)` | quarter turns clockwise / mirror |
| `T.grid.orientations(shape, flips = true)` | the distinct orientations (1 to 8) |
| `T.grid.place(shape, at)` · `T.grid.fits(shape, at, isFree)` | the covered cells / do they all pass `isFree(cell)`? |
| `T.grid.placements(shape, anchors, isFree, flips = true)` | every legal placement → `[{ at, shape, cells }]` |

```js
// Connect Four
const cells = T.grid.rect(7, 6);
const win = T.grid.lineRuns(cells, (k) => s.board[k], 4)[0]; // { value: 'red', cells: [...] } or undefined
// Go: a group without liberties is captured
for (const g of T.grid.regions(cells, (k) => s.board[k] || null)) {
  if (g.value && !g.cells.some((c) => T.grid.neighbors(c).some((n) => s.board[n] === null))) capture(s, g.cells);
}
// Patchwork / Blokus: every legal placement of a piece
const free = (k) => T.grid.inBounds(k, 9, 9) && !s.quilt[k];
actions = T.grid.placements(PIECES[id], cells, free).map((p) => ({ name: 'place', args: { id, at: p.at, shape: p.shape } }));
```

## T.score

| | |
|---|---|
| `T.score.rank(players, keys = ['score'], { id = 'id' }?)` | → `[{ id, name?, score, place }]` best first. `keys` are getters, most important first; higher wins, `'-key'` lower wins. Players tied on every key share a place (1, 1, 3) |
| `T.score.result(players, { keys, id, reason }?)` | a ready `endIf()` result `{ winners, ranking, reason }`; `keys` and `id` as in `T.score.rank`; `reason` can be a function of the ranking (default: "Ada wins with 18" / "Shared victory: …") |
| `T.score.table(n, table)` | `table[n]`, capped at the last entry |

```js
endIf: (s) => (s.flow.over ? T.score.result(s.players, { keys: ['vp', 'coins', '-seat'] }) : null),
```

## T.sets

Functions take counts (`{ kind: n }`) or a plain list of items.

| | |
|---|---|
| `T.sets.count(items, kind?)` | `{ kind: n }`; `kind` is a getter (default: the item itself) |
| `T.sets.ofAKind(counts, n, kind?)` | how many groups of `n` identical items; `kind` can restrict the count to one kind or a list of kinds |
| `T.sets.complete(counts, kinds)` | how many full sets of one of each `kinds` |
| `T.sets.distinct(counts)` | sizes of sets of different kinds, largest first (`{ a: 3, b: 1, c: 2 }` → `[3, 2, 1]`) |
| `T.sets.runs(values)` · `T.sets.longest(values)` | runs of consecutive numbers / the longest one's length |

```js
// 7 Wonders science: squares plus 7 per complete set
const c = T.sets.count(p.science);
const science = Object.values(c).reduce((a, n) => a + n * n, 0) + 7 * T.sets.complete(c, ['gear', 'tablet', 'compass']);
// Sushi Go dumplings and sets of different colours
const dumplings = T.score.table(T.sets.count(p.cards).dumpling || 0, [0, 1, 3, 6, 10, 15]);
const colours = T.sets.distinct(T.sets.count(p.cards, 'color')).reduce((a, n) => a + T.score.table(n, [0, 1, 3, 6, 10]), 0);
```

## T.area

| | |
|---|---|
| `T.area.tally(items, region = 'region', owner = 'owner', weight?)` | `{ region: { playerId: n } }` (getters; items without region or owner are skipped) |
| `T.area.rank(counts, min = 1)` | one region → `[{ id, n, place }]`, ties share a place |
| `T.area.control(counts, min = 1)` | the only player with the most, or `null` on a tie |
| `T.area.majority(counts, awards = [5, 3, 1], opts?)` | one region → `{ playerId: points }`; `opts.fewest` awards from fewest to most |
| `T.area.score(tally, awards, opts?)` | majority scoring over every region; `awards` can be `(region) → [...]`; accepts the same `fewest` option |

Tied players take up all the places they share. Tie rules for players tied over places *k…k+m−1*:
`'split'` share the sum of those awards (rounded down), `'full'` each get the award of place *k*, `'down'` each get the
lowest of them (El Grande), `'none'` get nothing. `fewest: true` reverses the ranking while keeping these tie rules;
it includes zero-count players by default. An explicit `min` still filters players below that count.

```js
const tally = T.area.tally(s.pieces, 'region', 'owner');
const pts = T.area.score(tally, (r) => REGION_AWARDS[r], { tie: 'down' });
for (const id of Object.keys(pts)) P(s, id).vp += pts[id];
```
