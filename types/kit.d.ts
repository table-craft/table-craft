// The rules kit `T`: a global inside every game module, and `import { T } from '@table-craft/table-craft'` outside.
// Helpers mutate the plain arrays/objects you pass (your state owns them) and take the `random` you give them.
// See docs/rules-kit.md and docs/mechanics.md.
import type { Action, Deadline, MoveArgs, PlayerId, Random, RankRow, RollResult } from './contract.js';

/** A resource dictionary: `{ wood: 2, ore: 1 }`. */
export type Counts = Record<string, number>;

/** A getter: a property name or a function of the item. */
export type Getter<X> = string | ((item: X) => unknown);

/** A ranking key: a getter; a `'-key'` string means lower is better. */
export type RankKey<X> = Getter<X>;

/** A square or hex cell: an `'x,y'` key or `[x, y]`. */
export type Cell = string | readonly [number, number];

/** A graph edge for `next(node)`: a node, or `[node, cost]`. */
export type GraphEdge<N> = N | readonly [N, (number | null)?];

/** A found path. */
export interface PathResult<N = string> {
  /** Nodes from start to goal. */
  path: N[];
  /** Total cost. */
  cost: number;
}

/** Step cost for grid/hex paths: a number, or `false`/`null`/`Infinity` for impassable (`true` = 1). */
export type StepCost = (cell: string, from: string) => number | boolean | null | undefined;

// ------------------------------------------------------------------ T.hex

/** Hex grids in axial coordinates (`'q,r'` cells, canonical `'q,r,c'` corner and `'q,r,s'` side keys). */
export interface HexKit {
  /** `'q,r'` from coordinates. */
  key(q: number, r: number): string;
  /** Canonical `'q,r'` from a cell. */
  key(cell: Cell): string;
  /** `'q,r'` → `[q, r]`. */
  parse(cell: Cell): [number, number];
  /** The six neighbour offsets; side `s` faces `DIRS[s]`. */
  DIRS: Array<[number, number]>;
  /** The neighbour across side `side`. */
  neighbor(cell: Cell, side: number): string;
  /** The six neighbours. */
  neighbors(cell: Cell): string[];
  /** Steps between two cells. */
  distance(a: Cell, b: Cell): number;
  /** Cells at exactly `radius` steps. */
  ring(center: Cell, radius: number): string[];
  /** Cells within `radius` steps (a hexagon-shaped map), centre first. */
  area(center: Cell, radius: number): string[];
  /** A `cols × rows` rectangular map. */
  rect(cols: number, rows: number, orient?: 'pointy' | 'flat'): string[];
  /** Cells on a straight line, both ends included. */
  line(a: Cell, b: Cell): string[];
  /** Canonical key of corner `c` (0..5) of a cell. */
  corner(cell: Cell, c: number): string;
  /** Canonical key of side `s` (0..5) of a cell. */
  edge(cell: Cell, s: number): string;
  /** The six canonical corner keys of a cell. */
  corners(cell: Cell): string[];
  /** The six canonical side keys of a cell. */
  edges(cell: Cell): string[];
  /** The cells sharing a corner. */
  cornerCells(vertex: string | readonly number[]): string[];
  /** The two cells sharing a side. */
  edgeCells(edge: string | readonly number[]): string[];
  /** The two corners at the ends of a side. */
  edgeCorners(edge: string | readonly number[]): string[];
  /** The three sides meeting at a corner. */
  cornerEdges(vertex: string | readonly number[]): string[];
  /** The corners one side away from a corner. */
  cornerNeighbors(vertex: string | readonly number[]): string[];
  /** Cheapest cell path → `{ path, cost }` or `null`. */
  path(from: Cell, to: Cell | ((cell: string) => boolean), cost?: StepCost, opts?: { maxCost?: number }): PathResult | null;
}

// ------------------------------------------------------------------ T.grid

/** Neighbourhood: 4 (orthogonal), 8 (with diagonals) or a neighbours function (e.g. `T.hex.neighbors`). */
export type GridDirs = 4 | 8 | ((cell: Cell) => string[]);

/** A polyomino shape: a list of `[x, y]` offsets (or `'x,y'` keys). */
export type Shape = readonly Cell[];

/** A normalised shape (smallest corner at 0,0). */
export type NormalizedShape = Array<[number, number]>;

/** A group of cells sharing a value. */
export interface CellGroup<V> {
  /** The shared value. */
  value: V;
  /** The cells. */
  cells: string[];
}

/** Square grids: `'x,y'` keys, x grows right, y grows down. */
export interface GridKit {
  /** `'x,y'` from coordinates. */
  key(x: number, y: number): string;
  /** Canonical `'x,y'` from a cell. */
  key(cell: Cell): string;
  /** `'x,y'` → `[x, y]`. */
  parse(cell: Cell): [number, number];
  /** Orthogonal offsets. */
  DIRS4: Array<[number, number]>;
  /** Orthogonal, then diagonal offsets. */
  DIRS8: Array<[number, number]>;
  /** Adjacent cells. */
  neighbors(cell: Cell, dirs?: GridDirs): string[];
  /** Rook-step distance. */
  manhattan(a: Cell, b: Cell): number;
  /** King-step distance. */
  chebyshev(a: Cell, b: Cell): number;
  /** Every cell of a `cols × rows` board, row by row. */
  rect(cols: number, rows: number): string[];
  /** Is the cell on a `cols × rows` board? */
  inBounds(cell: Cell, cols: number, rows: number): boolean;
  /** Bresenham line, both ends included. */
  line(a: Cell, b: Cell): string[];
  /** True when no cell strictly between `a` and `b` is blocked. */
  lineOfSight(a: Cell, b: Cell, blocked: (cell: string) => boolean): boolean;
  /** Cells reachable from `start` through cells where `ok(cell)` (start included). */
  floodFill(start: Cell, ok: (cell: string) => boolean, dirs?: GridDirs): string[];
  /** Connected groups of equal `value(cell)` → `[{ value, cells }]`; every cell lands in exactly one group. */
  regions<V = true>(cells: readonly Cell[], value?: (cell: string) => V, dirs?: GridDirs): Array<CellGroup<V>>;
  /** Cheapest cell path → `{ path, cost }` or `null`. */
  path(from: Cell, to: Cell | ((cell: string) => boolean), cost?: StepCost, opts?: { dirs?: GridDirs; maxCost?: number }): PathResult | null;
  /** Maximal straight runs of ≥ `n` equal values (empty values never count) → `[{ value, cells }]`. */
  lineRuns<V>(cells: readonly Cell[], value: (cell: string) => V, n?: number, opts?: { diagonal?: boolean }): Array<CellGroup<NonNullable<V>>>;
  /** Shift a shape so its smallest corner is at 0,0. */
  normalize(shape: Shape): NormalizedShape;
  /** Quarter turns clockwise. */
  rotate(shape: Shape, times?: number): NormalizedShape;
  /** Mirror image. */
  flip(shape: Shape): NormalizedShape;
  /** The distinct orientations (1 to 8); `flips: false` for one-sided pieces. */
  orientations(shape: Shape, flips?: boolean): NormalizedShape[];
  /** The cells a shape covers at `at`. */
  place(shape: Shape, at: Cell): string[];
  /** Do all covered cells pass `isFree`? */
  fits(shape: Shape, at: Cell, isFree: (cell: string) => boolean): boolean;
  /** Every legal placement over the anchor cells → `[{ at, shape, cells }]`. */
  placements(shape: Shape, anchors: readonly Cell[], isFree: (cell: string) => boolean, flips?: boolean): Array<{ at: string; shape: NormalizedShape; cells: string[] }>;
}

// ------------------------------------------------------------------ turn structure

/** Turn order with passing (lives in your state). */
export interface TurnOrder {
  /** Player ids in seat order. */
  order: PlayerId[];
  /** Start seat index of this round. */
  start: number;
  /** Current seat index. */
  i: number;
  /** Ids that passed this round, in passing order. */
  passed: PlayerId[];
  /** Every player takes exactly one turn per round. */
  once: boolean;
}

/** `T.turns`: turn order with passing, snake and score-based orders. */
export interface TurnsKit {
  /** New turn order; `start` is a seat index or a player id. */
  create(ids: readonly PlayerId[], opts?: { start?: number | PlayerId; once?: boolean }): TurnOrder;
  /** Has everyone passed? */
  done(t: TurnOrder): boolean;
  /** Whose turn it is, or `null` when everyone has passed. */
  current(t: TurnOrder): PlayerId | null;
  /** Advance to the next player who has not passed → their id, or `null` when the round is over. */
  next(t: TurnOrder): PlayerId | null;
  /** `id` (default: current) passes for the rest of the round → `true` if everyone has now passed. */
  pass(t: TurnOrder, id?: PlayerId): boolean;
  /** Clear passes and start a new round from a seat index or id → the first player. */
  newRound(t: TurnOrder, start?: number | PlayerId): PlayerId;
  /** New round with the start player one seat on → the first player. */
  rotate(t: TurnOrder): PlayerId;
  /** 1-2-3-3-2-1… pick order, `n` picks long (default: there and back). */
  snake<I>(ids: readonly I[], n?: number): I[];
  /** Players sorted by ranking keys (higher first, `'-key'` lower first); full ties keep the given order. */
  by<P>(players: readonly P[], keys: RankKey<P> | ReadonlyArray<RankKey<P>>): P[];
}

/** Rounds and phases (lives in your state). */
export interface Flow<P extends string = string> {
  /** Phase names in order. */
  phases: P[];
  /** Index of the current phase. */
  at: number;
  /** Current phase. */
  phase: P;
  /** Current round, 1-based. */
  round: number;
  /** Last round, or `null` while no end is set. */
  lastRound: number | null;
  /** The last round is complete. */
  over: boolean;
}

/** `T.flow`: rounds, phases and end triggers. */
export interface FlowKit {
  /** New flow; `rounds`: the game ends after that many rounds. */
  create<P extends string = 'main'>(phases?: readonly P[], opts?: { rounds?: number | null }): Flow<P>;
  /** Next phase (a new round after the last one) → its name, or `null` once the last round is complete. */
  next<P extends string>(f: Flow<P>): P | null;
  /** Jump to a phase of the current round → `false` if unknown or over. */
  goto<P extends string>(f: Flow<P>, phase: P): boolean;
  /** End triggered: finish this round (plus `extra`), never extending an earlier trigger → the last round. */
  endAfterRound(f: Flow<string>, extra?: number): number;
  /** Is this the last round? */
  isLastRound(f: Flow<string>): boolean;
}

/** A decision waiting for a player (with any data of your own). */
export interface Decision {
  /** Who decides. */
  playerId: PlayerId;
  /** What kind of decision. */
  kind?: string;
  /** Allowed choices (compared as JSON). */
  options?: unknown[];
  /** The choice, set by `resolve`. */
  choice?: unknown;
  /** Your own data. */
  [key: string]: any;
}

/** `T.pending`: a stack of decisions; the top one is resolved first. */
export interface PendingKit {
  /** Put on top: resolved next (interrupts, reactions) → the decision. */
  push<D extends Decision>(stack: D[], d: D): D;
  /** Put at the bottom: after everything already pending → the decision. */
  queue<D extends Decision>(stack: D[], d: D): D;
  /** The next decision, or `null`. */
  top<D extends Decision>(stack: readonly D[] | null | undefined): D | null;
  /** The next decision's player, or `null`. */
  who(stack: readonly Decision[] | null | undefined): PlayerId | null;
  /** Pop the top decision if `playerId` owns it and `choice` is one of its options → it (with `.choice`), else `null`. */
  resolve<D extends Decision>(stack: D[], playerId: PlayerId, choice: unknown): (D & { choice: unknown }) | null;
  /** `actions()` for the top decision: one `{ name: move, args: { choice } }` per option; non-object options also get `label: String(option)`. */
  actions(stack: readonly Decision[] | null | undefined, playerId: PlayerId, move?: string): Array<Action<{ choice: any }>>;
}

// ------------------------------------------------------------------ economy

/** One worker-placement space. */
export interface WorkerSpace {
  /** Capacity (`null` = unlimited). */
  cap: number | null;
  /** Player ids, one per worker. */
  workers: PlayerId[];
  /** Closed for now. */
  blocked?: boolean;
}

/** A worker-placement board: `{ spaceId: { cap, workers, blocked? } }`. */
export type WorkerBoard = Record<string, WorkerSpace>;

/** `T.workers`: worker placement. */
export interface WorkersKit {
  /** `{ forest: 1, market: null }` → a board. */
  board(caps: Record<string, number | null>): WorkerBoard;
  /** Room, not blocked, and (with `onePerPlayer`) not already there? */
  canPlace(board: WorkerBoard, space: string, playerId: PlayerId, opts?: { onePerPlayer?: boolean }): boolean;
  /** Place a worker → `true`, or `false` and nothing changes. */
  place(board: WorkerBoard, space: string, playerId: PlayerId, opts?: { onePerPlayer?: boolean }): boolean;
  /** The spaces this player may use now. */
  available(board: WorkerBoard, playerId: PlayerId, opts?: { onePerPlayer?: boolean }): string[];
  /** The spaces this player occupies. */
  spaces(board: WorkerBoard, playerId: PlayerId): string[];
  /** Every worker goes home → `{ playerId: count }`. */
  returnAll(board: WorkerBoard): Record<PlayerId, number>;
}

/** `T.track`: fame, morale, temperature tracks with milestones. */
export interface TrackKit {
  /** Marks passed going from `before` to `after`, in travel order. */
  crossed(before: number, after: number, marks?: readonly number[]): number[];
  /** `holder[key] += delta` within `[min, max]` → `{ value, moved, crossed }`. */
  move(holder: object, key: string, delta: number, opts?: { min?: number; max?: number; marks?: readonly number[] }): { value: number; moved: number; crossed: number[] };
}

/** `T.rondel`: a circular action track, positions `0..size-1`. */
export interface RondelKit {
  /** Steps forward from `from` to `to`. */
  steps(from: number, to: number, size: number): number;
  /** Price of a move: steps beyond `free` cost `cost` each. */
  cost(from: number, to: number, size: number, opts?: { free?: number; cost?: number }): number;
  /** Every destination within `max` steps that fits `budget` → `[{ to, steps, cost }]`. */
  moves(from: number, size: number, opts?: { free?: number; cost?: number; max?: number; budget?: number }): Array<{ to: number; steps: number; cost: number }>;
}

// ------------------------------------------------------------------ interaction

/** Simultaneous secret choices (lives in your state). */
export interface SecretSlot<C = any> {
  /** Participants. */
  ids: PlayerId[];
  /** Choices so far. */
  choices: Record<PlayerId, C>;
  /** Revealed yet? */
  revealed: boolean;
}

/** `T.secret`: commit, then reveal. */
export interface SecretKit {
  /** A new slot for these players. */
  create<C = any>(ids: readonly PlayerId[]): SecretSlot<C>;
  /** Commit (or change) a choice until the reveal → `false` for outsiders, after the reveal or for `undefined`. */
  commit<C>(slot: SecretSlot<C>, id: PlayerId, choice: C): boolean;
  /** Who still has to choose. */
  pending(slot: SecretSlot<unknown>): PlayerId[];
  /** Is everyone in? */
  allIn(slot: SecretSlot<unknown>): boolean;
  /** Reveal → `{ playerId: choice }`. */
  reveal<C>(slot: SecretSlot<C>): Record<PlayerId, C>;
  /** For `view()`: own choice, `mask` for others who chose, `null` for those who didn't — until revealed. */
  view<C, M = true>(slot: SecretSlot<C>, viewerId: PlayerId, mask?: M): Record<PlayerId, C | M | null>;
}

/** An open or once-around auction (lives in your state). */
export interface TurnAuction {
  /** `'open'`: bid or pass until all but the leader passed; `'once'`: everyone bids or passes once. */
  kind: 'open' | 'once';
  /** Bidders in order. */
  order: PlayerId[];
  /** Index of the bidder to act. */
  i: number;
  /** Lowest opening bid. */
  min: number;
  /** Minimum raise. */
  step: number;
  /** Highest bid so far. */
  high: number;
  /** Highest bidder, or `null`. */
  leader: PlayerId | null;
  /** Ids that passed. */
  passed: PlayerId[];
  /** Ids that acted (`'once'`). */
  acted: PlayerId[];
}

/** A Dutch auction: the price drops until someone takes it (lives in your state). */
export interface DutchAuction {
  /** Discriminator. */
  kind: 'dutch';
  /** Eligible bidders after any ids in the create options are excluded. */
  order: PlayerId[];
  /** Bidders who declined at the current price. Cleared whenever the price changes. */
  declined: PlayerId[];
  /** Current price. */
  price: number;
  /** Price drop per `lower`. */
  step: number;
  /** Lowest price; below it the item is not sold. */
  floor: number;
  /** Who took it, or `null`. */
  leader: PlayerId | null;
  /** Price paid. */
  high: number;
  /** Closed without a sale, including when no eligible bidders remain. */
  closed: boolean;
}

/** An auction, discriminated by `kind`. */
export type Auction = TurnAuction | DutchAuction;

/** `T.auction`: open, once-around, Dutch and sealed-bid auctions. */
export interface AuctionKit {
  /** New auction; `start`: seat index or id of the first bidder. `exclude` removes Dutch auction participants. */
  create(ids: readonly PlayerId[], opts?: { kind?: 'open' | 'once' | 'dutch'; min?: number; step?: number; start?: number | PlayerId; price?: number; floor?: number; exclude?: readonly PlayerId[] }): Auction;
  /** Is it over? */
  done(a: Auction): boolean;
  /** Who bids next (`null` when over; anyone may take a Dutch offer). */
  turn(a: Auction): PlayerId | null;
  /** The lowest legal bid. */
  minBid(a: Auction): number;
  /** Bid → `false` when it is not their turn or the bid is too low. */
  bid(a: Auction, id: PlayerId, amount: number): boolean;
  /** Pass (final) → `false` when it is not their turn. */
  pass(a: Auction, id: PlayerId): boolean;
  /** The amounts `id` may bid now, up to `budget`. */
  legalBids(a: Auction, id: PlayerId, budget: number): number[];
  /** Dutch: lower the price one step → the new price, or `null` when it would drop below the floor (no sale). Clears current declines. */
  lower(a: Auction): number | null;
  /** Dutch: record a decline; lowers once all eligible bidders decline. `false` for nonparticipants, duplicates or a closed auction. */
  decline(a: Auction, id: PlayerId): boolean;
  /** Dutch: take the offer at the current price; `false` for nonparticipants, current-price decliners or a closed auction. */
  take(a: Auction, id: PlayerId): boolean;
  /** `{ id, price }` once the auction is over and someone won, else `null`. */
  winner(a: Auction): { id: PlayerId; price: number } | null;
  /** Sealed bids `{ playerId: amount }` → `{ id, bid, price, tied }` or `null`; `price: 'second'` = Vickrey. */
  sealed(bids: Record<PlayerId, number>, opts?: { order?: readonly PlayerId[]; random?: Random; price?: 'first' | 'second' }): { id: PlayerId; bid: number; price: number; tied: PlayerId[] } | null;
}

/** A vote choice (`null`/`undefined` abstains). */
export type VoteChoice = string | number | boolean | null | undefined;

/** `T.vote`: tallies and results with tie rules and weights. */
export interface VoteKit {
  /** `{ choice: votes }`; `weight`: `{ voterId: n }` or a function. */
  tally(votes: Record<PlayerId, VoteChoice>, weight?: Record<PlayerId, number> | ((voterId: PlayerId) => number)): Record<string, number>;
  /** → `{ winner, counts, tied }`. `tie`: `'none'`, `'random'` (needs `random`) or a priority list; `need`: a number or `'majority'`. */
  result(votes: Record<PlayerId, VoteChoice>, opts?: { weight?: Record<PlayerId, number> | ((voterId: PlayerId) => number); tie?: 'none' | 'random' | ReadonlyArray<string | number>; random?: Random; need?: number | 'majority' }): { winner: string | null; counts: Record<string, number>; tied: string[] };
}

/** A trade offer (lives in your state). */
export interface TradeOffer {
  /** Offer id (counts up). */
  id: number;
  /** Who offers. */
  from: PlayerId;
  /** Who may accept (`null` = anyone). */
  to: PlayerId | null;
  /** What `from` gives. */
  give: Counts;
  /** What `from` gets. */
  get: Counts;
}

/** `T.trade`: swaps, offers and bank rates. */
export interface TradeKit {
  /** `a` gives `give` to `b`, `b` gives `get` to `a` — all or nothing → `true` / `false`. */
  swap(a: object, b: object, give: Counts, get: Counts): boolean;
  /** Add an offer → the new offer. */
  offer(offers: TradeOffer[], o: { from: PlayerId; to?: PlayerId | null; give?: Counts; get?: Counts }): TradeOffer;
  /** Offers this player may accept. */
  open(offers: readonly TradeOffer[], playerId: PlayerId): TradeOffer[];
  /** Accept offer `id` as `by` → `true` when both could pay (the offer is removed). */
  accept(offers: TradeOffer[], id: number, by: PlayerId, wallet: Record<PlayerId, object> | ((playerId: PlayerId) => object)): boolean;
  /** Remove an offer → it, or `null`. */
  cancel(offers: TradeOffer[], id: number): TradeOffer | null;
  /** Trade `rate × n` of `give` for `n` of `get` with the bank → `false` if unaffordable. */
  bank(have: object, give: string, get: string, rate?: number, n?: number): boolean;
}

/** `T.roles`: hidden roles and teams. */
export interface RolesKit {
  /** Deal roles (a list, or `{ playerCount: list }`) → `{ roles, rest }`. Throws when there are too few. */
  deal<R extends string>(ids: readonly PlayerId[], roles: readonly R[] | Record<number, readonly R[]>, random: Random): { roles: Record<PlayerId, R>; rest: R[] };
  /** Ids holding a role (a role, a list or a predicate). */
  who<R extends string>(roles: Record<PlayerId, R>, role: R | readonly R[] | ((role: R) => boolean)): PlayerId[];
  /** What `viewerId` knows → `{ playerId: role or label }`, always including themselves. */
  known<R extends string>(roles: Record<PlayerId, R>, viewerId: PlayerId, sees?: Partial<Record<R, readonly R[] | Partial<Record<R, string>>>>): Record<PlayerId, R | string>;
}

// ------------------------------------------------------------------ cards

/** `T.market`: a face-up row (an empty slot is `null` when cards don't slide). */
export interface MarketKit {
  /** Fill holes, then up to `size` cards → the new cards. */
  refill<C>(row: Array<C | null>, size: number, deck: C[], discard: C[] | null | undefined, random: Random, opts?: { reshuffle?: boolean }): C[];
  /** Take the card in slot `i` → it; `slide: false` leaves a hole. */
  take<C>(row: Array<C | null>, i: number, slide?: boolean): C | undefined;
  /** Cost of slot `i`: `costs[i]` (the last repeats) or `i × costs`. */
  price(i: number, costs: readonly number[] | number): number;
  /** Empty the row (into `discard`) → the removed cards. */
  clear<C>(row: Array<C | null>, discard?: C[] | null): C[];
}

/** A card, or a predicate that finds it. */
export type CardRef<C> = C | ((card: C) => boolean);

/** `T.draft`: pick and pass. */
export interface DraftKit {
  /** Move a card from one list to another → the card or `undefined`. */
  pick<C>(from: C[], card: CardRef<C>, to?: C[] | null): C | undefined;
  /** Every hand moves `dir` seats along `order` (1 = to the next player). */
  pass<H>(hands: Record<PlayerId, H>, order: readonly PlayerId[], dir?: number): Record<PlayerId, H>;
  /** Passing direction for round 1, 2, 3… → 1, -1, 1… */
  dir(round: number): 1 | -1;
}

/** Per-player deck-building zones (the front of `deck` is its top). */
export interface DeckZones<C = any> {
  /** Draw pile. */
  deck: C[];
  /** Hand. */
  hand: C[];
  /** Discard pile. */
  discard: C[];
  /** Play area. */
  play: C[];
}

/** `T.deckbuild`: deck, hand, discard and play zones. */
export interface DeckbuildKit {
  /** Shuffled starting deck, optionally with a first hand. */
  create<C>(cards: readonly C[], random: Random, handSize?: number): DeckZones<C>;
  /** Draw into the hand, reshuffling the discard when needed → the drawn cards. */
  draw<C>(z: DeckZones<C>, random: Random, n?: number): C[];
  /** Draw up to `size` cards in hand → the drawn cards. */
  drawTo<C>(z: DeckZones<C>, random: Random, size: number): C[];
  /** Hand → play area → the card. */
  play<C>(z: DeckZones<C>, card: CardRef<C>): C | undefined;
  /** Hand → discard → the card. */
  discard<C>(z: DeckZones<C>, card: CardRef<C>): C | undefined;
  /** Hand and play area → discard, then draw a new hand → the hand. */
  cleanup<C>(z: DeckZones<C>, random: Random, handSize: number): C[];
  /** Gain a card into a zone (`'deck'` = on top, `'bottom'` = under the deck) → the card. */
  gain<C>(z: DeckZones<C>, card: C, to?: 'discard' | 'hand' | 'play' | 'deck' | 'bottom'): C;
  /** Remove a card from a zone (default the hand) → the card. */
  trash<C>(z: DeckZones<C>, card: CardRef<C>, from?: 'deck' | 'hand' | 'discard' | 'play'): C | undefined;
  /** Every card the player owns. */
  all<C>(z: DeckZones<C>): C[];
}

/** A played card in a trick. */
export interface TrickPlay<C = any> {
  /** Who played it. */
  id: PlayerId;
  /** The card. */
  card: C;
}

/** Trick-taking options. */
export interface TrickOptions<C = any> {
  /** Suit getter (default `'suit'`). */
  suit?: Getter<C>;
  /** Rank getter (default `'rank'`). */
  rank?: Getter<C>;
  /** Ranks from low to high (otherwise ranks are numbers). */
  order?: readonly unknown[];
  /** Trump suit, or `null`. */
  trump?: unknown;
  /** Without the suit led, a trump must be played if possible. */
  mustTrump?: boolean;
}

/** `T.tricks`: trick taking. */
export interface TricksKit {
  /** The suit led, or `null`. */
  lead<C>(trick: ReadonlyArray<TrickPlay<C>> | null | undefined, opts?: TrickOptions<C>): any;
  /** The cards of `hand` that may be played now (follow suit if able). */
  legal<C>(hand: readonly C[], trick: ReadonlyArray<TrickPlay<C>> | null | undefined, opts?: TrickOptions<C>): C[];
  /** The winning play: highest trump, else highest of the suit led; `null` for an empty trick. */
  winner<C>(trick: ReadonlyArray<TrickPlay<C>> | null | undefined, opts?: TrickOptions<C>): TrickPlay<C> | null;
}

// ------------------------------------------------------------------ luck

/** A dice pattern for `T.dice.matches`. */
export interface DicePattern {
  /** Group sizes: `[3, 2]` full house, `[2, 2]` two pairs. */
  groups?: readonly number[];
  /** Minimum straight length. */
  straight?: number;
  /** Sum range `[min, max]` (`max` optional). */
  sum?: readonly [number, (number | null)?];
}

/** `T.dice`: pools of face values. */
export interface DiceKit {
  /** `n` dice → their faces (no animation; `ctx.rollMany` throws them). */
  roll(random: Random, n: number, faces?: number): number[];
  /** `n` dice with custom faces → their faces. */
  roll<F>(random: Random, n: number, faces: readonly F[]): F[];
  /** Re-roll the dice at `indices` in place → the values. */
  reroll<F = number>(values: F[], indices: readonly number[], random: Random, faces?: number | readonly F[]): F[];
  /** Total. */
  sum(values: readonly unknown[]): number;
  /** `{ face: n }`. */
  counts(values: readonly unknown[]): Record<string, number>;
  /** Group sizes, largest first. */
  groups(values: readonly unknown[]): number[];
  /** The largest group. */
  ofAKind(values: readonly unknown[]): number;
  /** Longest run of consecutive numbers. */
  straight(values: ReadonlyArray<number | string>): number;
  /** Does the pool match the pattern? */
  matches(values: ReadonlyArray<number | string>, pattern?: DicePattern): boolean;
  /** Exact probability that `n` dice satisfy `test(values)` (keep `faces^n` ≤ 10⁶). */
  odds(n: number, faces: number, test: (values: number[]) => boolean): number;
  /** Exact probability for dice with custom faces. */
  odds<F>(n: number, faces: readonly F[], test: (values: F[]) => boolean): number;
}

/** `T.bag`: chits and cubes by kind (`{ white: 4, red: 2 }`). */
export interface BagKit {
  /** Chits left. */
  total(bag: Counts): number;
  /** `n` random pulls → the kinds; without `replace` they leave the bag. */
  draw(bag: Counts, random: Random, n?: number, replace?: boolean): string[];
  /** Put `n` of a kind back (or one of each kind in a list) → the bag. */
  put<B extends Counts>(bag: B, kind: string | readonly string[], n?: number): B;
  /** Chance the next pull is `kind` (a kind, a list or a predicate). */
  chance(bag: Counts, kind: string | readonly string[] | ((kind: string) => boolean)): number;
  /** Exact probability that `k` pulls satisfy `test(drawn)`; `drawn` has a count for every kind. */
  odds<B extends Counts>(bag: B, k: number, test: (drawn: { [K in keyof B]: number }) => boolean, replace?: boolean): number;
}

// ------------------------------------------------------------------ scoring

/** `T.score.result` value: a ready `endIf()` result. */
export interface ScoreResult {
  /** Ids on place 1. */
  winners: PlayerId[];
  /** Full ranking, best first. */
  ranking: Array<Required<Pick<RankRow, 'id' | 'score' | 'place'>> & { name?: string }>;
  /** Why the game ended. */
  reason: string;
}

/** `T.score`: rankings, `endIf` results and scoring tables. */
export interface ScoreKit {
  /** → `[{ id, name?, score, place }]` best first; keys are getters, `'-key'` lower wins; full ties share a place. */
  rank<P>(players: readonly P[] | null | undefined, keys?: RankKey<P> | ReadonlyArray<RankKey<P>>, opts?: { id?: string }): ScoreResult['ranking'];
  /** A ready `endIf()` result `{ winners, ranking, reason }`. */
  result<P>(players: readonly P[] | null | undefined, opts?: { keys?: RankKey<P> | ReadonlyArray<RankKey<P>>; id?: string; reason?: string | ((ranking: ScoreResult['ranking']) => string) }): ScoreResult;
  /** `table[n]`, capped at the last entry (0 for an empty table). */
  table(n: number, table: readonly number[]): number;
}

/** Counts (`{ kind: n }`) or a plain list of items (counted by value). */
export type CountsOrItems = Counts | readonly unknown[];

/** `T.sets`: set collection. */
export interface SetsKit {
  /** `{ kind: n }`; `kind` is a getter (default: the item itself). */
  count<X>(items: readonly X[] | null | undefined, kind?: Getter<X>): Record<string, number>;
  /** How many groups of `n` identical items. */
  ofAKind(counts: CountsOrItems, n: number, kind?: string | readonly string[]): number;
  /** How many complete sets of one of each of `kinds`. */
  complete(counts: CountsOrItems, kinds: readonly string[]): number;
  /** Sizes of sets of different kinds, largest first. */
  distinct(counts: CountsOrItems): number[];
  /** Runs of consecutive numbers. */
  runs(values: ReadonlyArray<number | string> | null | undefined): number[][];
  /** Length of the longest run. */
  longest(values: ReadonlyArray<number | string> | null | undefined): number;
}

/** How tied players share majority awards. */
export type MajorityTie = 'split' | 'full' | 'down' | 'none';

/** Counts per region per player: `{ region: { playerId: n } }`. */
export type AreaTally = Record<string, Record<PlayerId, number>>;

/** `T.area`: area control and majorities. */
export interface AreaKit {
  /** `{ region: { playerId: n } }`; items without region or owner are skipped. */
  tally<X>(items: readonly X[] | null | undefined, region?: Getter<X>, owner?: Getter<X>, weight?: Getter<X>): AreaTally;
  /** One region → `[{ id, n, place }]`, most first; ties share a place. */
  rank(counts: Record<PlayerId, number>, min?: number): Array<{ id: PlayerId; n: number; place: number }>;
  /** The only player with the most (≥ `min`), or `null` on a tie. */
  control(counts: Record<PlayerId, number>, min?: number): PlayerId | null;
  /** Awards by place for one region → `{ playerId: points }`. */
  majority(counts: Record<PlayerId, number>, awards?: readonly number[], opts?: { tie?: MajorityTie; fewest?: boolean; min?: number }): Record<PlayerId, number>;
  /** Majority scoring over every region; `awards` may depend on the region. */
  score(tally: AreaTally, awards: readonly number[] | ((region: string) => readonly number[]), opts?: { tie?: MajorityTie; fewest?: boolean; min?: number }): Record<PlayerId, number>;
}

// ------------------------------------------------------------------ the kit

/** The rules kit `T`. */
export interface Kit {
  /** Roll one die without animation (`ctx.roll` throws it on the table) → `{ index, face }`. */
  roll(random: Random, faces?: number): RollResult<number>;
  /** Roll one die with custom faces → `{ index, face }`. */
  roll<F>(random: Random, faces: readonly F[]): RollResult<F>;
  /** Draw `n` cards from the front of `deck`, reshuffling `discard` in when it runs out. Mutates both. */
  draw<C>(deck: C[], discard: C[] | null | undefined, random: Random, n?: number): C[];
  /** One card, or `undefined`. */
  drawOne<C>(deck: C[], discard: C[] | null | undefined, random: Random): C | undefined;
  /** Players clockwise from index `start`, leaving out those where `skip(p)`. */
  orderFrom<P>(players: readonly P[], start: number, skip?: (player: P) => boolean): P[];
  /** Next index with wrap-around (negative steps work). */
  nextIndex(n: number, i: number, step?: number): number;
  /** Total of a resource dictionary. */
  sum(o: object | null | undefined): number;
  /** `target += delta * mul`, key by key → `target`. */
  add<O extends object>(target: O, delta: Counts | null | undefined, mul?: number): O;
  /** Enough of everything? */
  canPay(have: object, cost: Counts | null | undefined): boolean;
  /** Subtract if affordable → `true`; otherwise `false` and nothing changes. */
  pay(have: object, cost: Counts | null | undefined): boolean;
  /** Lose up to `n` without going negative → the amount actually lost. */
  lose(have: object, key: string, n: number): number;
  /** Sand timer: when time is up the host applies `move(args)` as `playerId` (or the system). Stored in `state.$deadline`. */
  setDeadline(state: object, now: number, seconds: number, move: string, args?: MoveArgs | null, playerId?: PlayerId | null): Deadline;
  /** Cancel the sand timer. */
  clearDeadline(state: object): void;
  /** Cheapest path → `{ path, cost }` or `null`; `next(node)` returns neighbours or `[node, cost]` pairs. */
  findPath<N>(start: N, goal: N | ((node: N) => boolean), next: (node: N) => Iterable<GraphEdge<N>> | null | undefined, opts?: { maxCost?: number }): PathResult<N> | null;
  /** Every node reachable from `start` (including it). */
  reachable<N>(start: N, next: (node: N) => Iterable<GraphEdge<N>> | null | undefined): N[];
  /** Hex grids. */
  hex: HexKit;
  /** Clamp `v` to `[lo, hi]`. */
  clamp(v: number, lo: number, hi: number): number;
  /** `[0, 1, …, n-1]`. */
  range(n: number): number[];
  /** Group items by `fn(item)`. */
  groupBy<X>(items: readonly X[], fn: (item: X) => string | number): Record<string, X[]>;

  /** Turn order with passing, snake and score orders. */
  turns: TurnsKit;
  /** Rounds, phases and end triggers. */
  flow: FlowKit;
  /** Decision stack: targets, reactions, multi-step effects. */
  pending: PendingKit;
  /** Worker placement. */
  workers: WorkersKit;
  /** Rondels. */
  rondel: RondelKit;
  /** Tracks with milestones. */
  track: TrackKit;
  /** Commit and reveal. */
  secret: SecretKit;
  /** Open, once-around, Dutch and sealed auctions. */
  auction: AuctionKit;
  /** Votes. */
  vote: VoteKit;
  /** Trades and bank rates. */
  trade: TradeKit;
  /** Hidden roles. */
  roles: RolesKit;
  /** Face-up card rows. */
  market: MarketKit;
  /** Pick and pass. */
  draft: DraftKit;
  /** Deck/hand/discard zones. */
  deckbuild: DeckbuildKit;
  /** Trick taking. */
  tricks: TricksKit;
  /** Dice pools and patterns. */
  dice: DiceKit;
  /** Bag pulls and exact odds. */
  bag: BagKit;
  /** Square grids. */
  grid: GridKit;
  /** Rankings and `endIf` results. */
  score: ScoreKit;
  /** Set collection. */
  sets: SetsKit;
  /** Area majorities. */
  area: AreaKit;

  /** @internal Builds the effect helpers of `ctx` (used by the runtime). */
  _ctx(random: Random, sink: unknown[], now: number): { fx(e: unknown): void; roll(faces?: unknown, opts?: object): unknown; rollMany(dice: unknown[], opts?: object): unknown[]; now: number };
}
