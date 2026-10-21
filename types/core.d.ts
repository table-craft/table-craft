// Isomorphic core shared by `tablecraft` and `tablecraft/server`: loaded modules, the Match state machine, pacing,
// randomness, scene checks, the referee, the balance lab, the view audit, replays and engine messages.
import type {
  Action, Deadline, EndResult, Fx, Meta, MoveArgs, Player, PlayerId, Random, SeatDef, View,
} from './contract.js';
import type { Kit } from './kit.js';

// ------------------------------------------------------------------ loaded modules

/** Input of `LoadedGameModule.move`. */
export interface MoveInput {
  /** Sender id. */
  playerId: PlayerId;
  /** Sender. */
  player: Player;
  /** Move arguments. */
  args?: MoveArgs;
  /** Host time in ms (default `Date.now()`). */
  now?: number;
}

/** Result of `LoadedGameModule.move`: the next state, or the rejection message. */
export type MoveOutcome<S = any> =
  | { state: S; rng: number; fx: Fx[]; error?: undefined }
  | { error: string; state?: undefined; rng?: undefined; fx?: undefined };

/**
 * A game module loaded into a runtime (`GameModule` on servers, `LocalGameModule` in browsers).
 * Everything that crosses the boundary is JSON-copied.
 */
export interface LoadedGameModule<S = any> {
  /** The module's `meta` (`{}` when it has none). */
  meta: Meta;
  /** Does the module export this function? */
  has(fn: 'setup' | 'view' | 'endIf' | 'actions' | 'bot' | 'score' | 'invariants' | (string & {})): boolean;
  /** Does `moves[name]` exist? */
  hasMove(name: string): boolean;
  /** Run `setup` → `{ state, rng, fx }`. */
  setup(players: Player[], seed: number, options?: Record<string, unknown>, now?: number): { state: S; rng: number; fx: Fx[] };
  /** Apply a move → `{ state, rng, fx }` or `{ error }`. */
  move(state: S, name: string, input: MoveInput, rngState: number): MoveOutcome<S>;
  /** One player's view. */
  view(state: S, player: Player): View | undefined;
  /** The end result, or a falsy value while the game runs (`null` without `endIf`). */
  endIf(state: S): EndResult | null;
  /** Legal actions (`null` without `actions`). */
  actions(state: S, player: Player): Action[] | null;
  /** The module's bot choice (`null` without `bot`). */
  bot(state: S, player: Player, actions: Action[], seed: number): Action | null | undefined;
  /** The module's position score (`null` without `score` or for non-numbers). */
  score(state: S, player: Player): number | null;
  /** Violated rules (`[]` without `invariants`). */
  invariants(state: S): string[];
}

// ------------------------------------------------------------------ randomness & kit

/** Seeded RNG plus its continuation seed. */
export interface SeededRandom {
  /** What game code sees as `ctx.random`. */
  api: Random;
  /** The seed to continue from (the `rng` stored next to the state). */
  state(): number;
}

/** A seeded, serialisable RNG (mulberry32). */
export declare function makeRandom(seed: number): SeededRandom;
/** A random 31-bit seed. */
export declare function randomSeed(): number;
/** The host-side rules kit (game modules get their own sandboxed copy). */
export declare const T: Kit;
/** Source expression of the kit, evaluated inside sandboxes. */
export declare const KIT_SOURCE: string;
/** Build a fresh kit. */
export declare function createKit(): Kit;

// ------------------------------------------------------------------ pacing

/** Bot pace. */
export type Pace = 'slow' | 'normal' | 'fast';

/** Base delay (ms) before a bot move, per pace. */
export declare const PACE: { slow: number; normal: number; fast: number };
/** Delay (ms) before the next bot move, given the fx of the previous move. */
export declare function botDelay(pace?: Pace | (string & {}), fx?: readonly Fx[] | null): number;
/** The fx a player may see (`to: [ids]` effects are private). */
export declare function visibleFx(fx: readonly Fx[] | null | undefined, playerId: PlayerId): Fx[];
/** A bot move: the module's `bot()` first, else a random non-free action; `null` when it cannot move. */
export declare function chooseBotMove<S>(mod: LoadedGameModule<S>, state: S, player: Player, rand: Random, useBot?: boolean): { name: string; args: MoveArgs } | null;
/** Is this a bot's player id (`bot_…`)? */
export declare function isBotId(id: unknown): id is `bot_${string}`;

/** Structural checks of a tabletop view (duplicate ids, unknown zones, bad hex places…) → up to 10 problems. */
export declare function checkScene(view: View | null | undefined): string[];

// ------------------------------------------------------------------ Match

/** A recorded move (`Match.moves`, room servers, replays). */
export interface RecordedMove {
  /** Sender id (`'system'` for sand timers without a player). */
  playerId: PlayerId;
  /** Move name. */
  name: string;
  /** Move arguments. */
  args?: MoveArgs;
  /** Host time (ms or an ISO string). */
  at?: number | string;
  /** The rejection message, if the move was rejected. */
  error?: string;
  /** Display name for players missing from the record. */
  playerName?: string;
}

/** The inputs that reproduce a game: feed it to `createReplay` / `replayMatch`. */
export interface MatchRecord {
  /** Setup seed. */
  seed: number;
  /** Players in seating order. */
  players: Player[];
  /** Setup options (`content`, `variant`, …). */
  options: Record<string, unknown>;
  /** Every move, including rejected ones. */
  moves: RecordedMove[];
  /** Host time at `start()`. */
  startedAt: number;
}

/** Match status. */
export type MatchStatus = 'lobby' | 'playing' | 'finished';

/** What `Match.snapshot(playerId)` returns: everything a client needs (without fx). */
export interface MatchSnapshot {
  /** Lobby, playing or finished. */
  status: MatchStatus;
  /** Players in seating order. */
  players: Player[];
  /** Host player id. */
  host: PlayerId | null;
  /** The module's `meta`. */
  meta: Meta;
  /** The viewing player, or `null` for spectators. */
  you: Player | null;
  /** This player's view (`null` before start or when `view()` threw). */
  view: View | null;
  /** The error `view()` threw, if any. */
  viewError: string | null;
  /** The end result once finished. */
  result: EndResult | null;
  /** Number of recorded moves. */
  moves: number;
  /** Bot pace. */
  pace: Pace;
  /** Does the module support bots (`actions()`)? */
  canBots: boolean;
}

/** Options of `new Match(mod, opts)`. */
export interface MatchOptions {
  /** Setup seed (default random). */
  seed?: number;
  /** Game data: `options.content` in `setup`. */
  content?: unknown;
  /** Other setup options (`variant`, …). */
  options?: Record<string, unknown>;
  /** Bot pace (default `'normal'`). */
  pace?: Pace;
  /** Host clock in ms (default `Date.now`). */
  clock?: () => number;
}

/** One table: lobby → playing → finished. A pure, synchronous state machine; hosts schedule bots and timers. */
export declare class Match<S = any> {
  /** Create a match for a loaded module. */
  constructor(mod: LoadedGameModule<S>, opts?: MatchOptions);
  /** The loaded module. */
  mod: LoadedGameModule<S>;
  /** Setup seed. */
  seed: number;
  /** Game data. */
  content: unknown;
  /** Setup options. */
  options: Record<string, unknown>;
  /** Bot pace. */
  pace: Pace;
  /** Host clock. */
  clock: () => number;
  /** Players in seating order. */
  players: Player[];
  /** Host player id (the first to join). */
  host: PlayerId | null;
  /** Lobby, playing or finished. */
  status: MatchStatus;
  /** Current state (`null` in the lobby). */
  state: S | null;
  /** RNG continuation seed. */
  rng: number | null;
  /** End result once finished. */
  result: EndResult | null;
  /** Every move so far (rejected ones included). */
  moves: RecordedMove[];
  /** Host time at `start()`. */
  startedAt: number | null;
  /** The module's `meta`. */
  readonly meta: Meta;
  /** Does the module support bots? */
  readonly canBots: boolean;
  /** `meta.seats` (or `[]`). */
  readonly seats: SeatDef[];
  /** A player by id, or `null`. */
  player(id: PlayerId): Player | null;
  /** Is any bot seated? */
  hasBots(): boolean;
  /** Join (or re-join) the lobby; throws when started, full or the seat is invalid. */
  join(id: PlayerId, opts?: { name?: string; seat?: string | null; userId?: string | null }): Player;
  /** Leave the lobby. */
  leave(id: PlayerId): void;
  /** Add a bot (to `seat` or the first free one) → the bot player. */
  addBot(seat?: string | null): Player;
  /** Remove a bot in the lobby. */
  removeBot(id: PlayerId): void;
  /** Change the bot pace; throws for unknown paces. */
  setPace(pace: Pace): void;
  /** Run `setup` → the start fx. Throws below `minPlayers`. */
  start(): Fx[];
  /** Back to the lobby with a new seed. */
  restart(): void;
  /** Apply a move as `player` → its fx; throws `Error(message)` when rejected. */
  apply(player: Player, name: string, args?: MoveArgs): Fx[];
  /** Apply a move as the seated player `playerId` → its fx; throws when rejected. */
  move(playerId: PlayerId, name: string, args?: MoveArgs): Fx[];
  /** One bot move → `{ player, name, fx }`, or `null` when no bot can move. */
  nextBot(seed?: number): { player: Player; name: string; fx: Fx[] } | null;
  /** The pending sand timer, or `null`. */
  deadline(): Deadline | null;
  /** Time is up: apply the timed move → its fx, or `null` without a timer. */
  applyDeadline(): Fx[] | null;
  /** One player's view (spectator for unknown ids). */
  view(playerId: PlayerId): { view: View | null; error: string | null };
  /** The replay record of the current game; `null` before start. */
  record(): MatchRecord | null;
  /** Everything a client needs to render this table for `playerId` (without fx). */
  snapshot(playerId: PlayerId): MatchSnapshot;
}

// ------------------------------------------------------------------ referee

/** Bot mode of the referee: the module's bot, random moves, or alternating. */
export type BotMode = 'mixed' | 'module' | 'random';

/** Referee options. */
export interface SimulateOptions {
  /** Games to play (default 20). */
  games?: number;
  /** Player count (default: cycles minPlayers…maxPlayers). */
  players?: number;
  /** Move cap per game (default 4000). */
  maxMoves?: number;
  /** Wall-clock limit in ms (default 60000). */
  timeLimitMs?: number;
  /** Base seed (default 1). */
  seed?: number;
  /** Game data (`options.content`). */
  content?: unknown;
  /** Variant id. */
  variant?: string;
  /** Bot mode (default `'mixed'`). */
  botMode?: BotMode;
}

/** One problem found by the referee (enough to reproduce it with the same seed). */
export interface RefereeIssue {
  /** Game number. */
  game: number;
  /** Move number. */
  move?: number;
  /** Player count. */
  players?: number;
  /** Player id. */
  player?: PlayerId;
  /** Where it happened (`'setup'`, `'endIf'`, `'actions'`, `'move 12'`…). */
  at?: string;
  /** `state.phase` at the time. */
  phase?: unknown;
  /** Move name. */
  name?: string;
  /** Move arguments. */
  args?: MoveArgs;
  /** Error message. */
  error?: string;
  /** Invariant violations. */
  errors?: string[];
  /** Hint for stuck states (top pending decision). */
  hint?: string;
}

/** The referee report. */
export interface SimulateReport {
  /** No errors, rejections, invariant violations, view errors or stuck games. */
  ok: boolean;
  /** Not skipped. */
  skipped?: undefined;
  /** Games played. */
  games: number;
  /** Games that ended. */
  finished: number;
  /** Games where nobody could move. */
  stuck: number;
  /** Games that hit `maxMoves`. */
  capped: number;
  /** Total moves. */
  moves: number;
  /** Average moves per game. */
  avgMoves: number;
  /** The module threw. */
  errors: RefereeIssue[];
  /** `actions()` offered a move that `move()` rejected. */
  rejected: RefereeIssue[];
  /** `invariants()` violations. */
  invariants: RefereeIssue[];
  /** `view()` / scene errors. */
  views: RefereeIssue[];
  /** Where games got stuck. */
  stuckAt: RefereeIssue[];
  /** Wins by seat index. */
  winsBySeat: Record<string, number>;
  /** Per player count. */
  byPlayers: Record<string, { games: number; finished: number; moves: number }>;
  /** Stopped at the time limit. */
  timedOut: boolean;
  /** `summarize(report)` — only on `simulateAsync` results. */
  summary?: string;
}

/** The referee could not run (no `actions()`). */
export interface SkippedReport {
  /** Always `false`. */
  ok: false;
  /** Discriminator. */
  skipped: true;
  /** Why. */
  error: string;
}

/** What `simulate` returns. */
export type RefereeReport = SimulateReport | SkippedReport;

/** Options of `validate` (the rest is passed to `setup` as options). */
export interface ValidateOptions {
  /** Fail when `actions()` is missing. */
  requireActions?: boolean;
  /** `false` skips the short referee run. */
  simulate?: boolean;
  /** Referee games (default 6). */
  games?: number;
  /** Referee time limit (default 20000 ms). */
  timeLimitMs?: number;
  /** Game data. */
  content?: unknown;
  /** Other setup options. */
  [key: string]: unknown;
}

/** What `validate` returns (it throws on the first problem). */
export interface ValidateResult {
  /** The module's `meta`. */
  meta: Meta;
  /** Players used. */
  players: number;
  /** Did the first view render a 3D table? */
  tabletop: boolean;
  /** Short referee summary, or `null` without `actions()`. */
  referee: { games: number; finished: number; avgMoves: number } | null;
}

/** Test players `p1…pn` with seats from `meta.seats`. */
export declare function testPlayers(meta: Meta, n: number): Player[];
/** Human-readable referee report. */
export declare function summarize(report: RefereeReport): string;

// ------------------------------------------------------------------ balance lab

/** Bot profiles of the balance lab. */
export type BotProfile = 'module' | 'random' | 'greedy';

/** Every bot profile. */
export declare const BOT_PROFILES: BotProfile[];

/** Balance lab options. */
export interface BalanceOptions {
  /** Games (default 200). */
  games?: number;
  /** Player count (default: cycles minPlayers…maxPlayers). */
  players?: number;
  /** Profiles assigned round-robin to seats (default `['module']`). */
  botMix?: BotProfile[];
  /** Seed (default 1). */
  seed?: number;
  /** Game data. */
  content?: unknown;
  /** Variant id. */
  variant?: string;
  /** Other setup options. */
  options?: Record<string, unknown>;
  /** Move cap (default 4000). */
  maxMoves?: number;
  /** Wall-clock limit (default 60000 ms). */
  timeLimitMs?: number;
}

/** Balance warning codes. */
export type BalanceWarningCode =
  | 'unfinished' | 'timed_out' | 'first_player_advantage' | 'seat_imbalance' | 'forced_decisions' | 'long_tail'
  | 'many_ties' | 'dominant_strategy' | 'luck_dominates' | 'skill_matters' | 'no_comebacks' | 'errors';

/** A balance warning — a question for a playtest, not a verdict. */
export interface BalanceWarning {
  /** Code. */
  code: BalanceWarningCode;
  /** Severity. */
  severity: 'warn' | 'info';
  /** Readable message. */
  message: string;
}

/** Per player count balance numbers. */
export interface BalanceByPlayers {
  /** Games. */
  games: number;
  /** Finished games. */
  finished: number;
  /** Win rate by seat index. */
  seatWinRate: Record<string, number | null>;
  /** Average moves. */
  avgMoves: number | null;
  /** Seat 0 win rate minus its fair share. */
  firstPlayerAdvantage: number | null;
}

/** The balance lab report (deterministic for a given seed). */
export interface BalanceReport {
  /** Games played. */
  games: number;
  /** Games that ended. */
  finished: number;
  /** Stopped at the time limit. */
  timedOut: boolean;
  /** Moves per finished game. */
  length: { avgMoves: number | null; medianMoves: number | null; p10Moves: number | null; p90Moves: number | null };
  /** Win rate by seat index (ties split). */
  seatWinRate: Record<string, number | null>;
  /** Seat 0 win rate minus its fair share, averaged over player counts. */
  firstPlayerAdvantage: number | null;
  /** Standard error a fair game would show. */
  firstPlayerAdvantageSE: number | null;
  /** Share of finished games with several winners. */
  tieRate: number | null;
  /** Average non-free choices and share of forced decisions. */
  decisions: { avgChoices: number | null; forcedRate: number | null };
  /** Lead changes per game (needs `score()`). */
  leadChanges: number | null;
  /** Share of games won by a player not leading at two thirds (needs `score()`). */
  comebackRate: number | null;
  /** Win rate per bot profile (mixed profiles only). */
  strategies: Partial<Record<BotProfile, number | null>> | null;
  /** The same per player count. */
  byPlayers: Record<string, BalanceByPlayers>;
  /** Module errors or rejected bot moves. */
  errors: number;
  /** Warnings. */
  warnings: BalanceWarning[];
}

/** Sweep options: balance options plus the dotted path and its candidate values. */
export interface SweepOptions extends BalanceOptions {
  /** `'content.…'` or `'options.…'`; array indices are numbers. */
  path: `content.${string}` | `options.${string}`;
  /** Candidate values. */
  values: unknown[];
}

/** One sweep point. */
export interface SweepRun {
  /** The value used. */
  value: unknown;
  /** Its report. */
  report: BalanceReport;
}

/** One compared metric. */
export interface ReportDelta {
  /** Metric (`'firstPlayerAdvantage'`, `'seatWinRate.0'`, …). */
  metric: string;
  /** Value in the first report. */
  before: number | null;
  /** Value in the second report. */
  after: number | null;
  /** `after - before`, or `null`. */
  delta: number | null;
}

/** Compare two balance reports (versions, sweep points). */
export declare function compareReports(a: BalanceReport | null | undefined, b: BalanceReport | null | undefined): ReportDelta[];
/** Balance options for one sweep point (copies content/options and sets the dotted path). */
export declare function sweepPoint<O extends BalanceOptions>(opts: O, path: string, value: unknown): O & { content: unknown; options: Record<string, unknown> };

// ------------------------------------------------------------------ view audit

/** View audit options. */
export interface AuditOptions {
  /** Games (default 3). */
  games?: number;
  /** Player count. */
  players?: number;
  /** Seed (default 1). */
  seed?: number;
  /** Game data. */
  content?: unknown;
  /** Move cap per game (default 400). */
  maxMoves?: number;
}

/** View audit finding codes. */
export type AuditCode =
  | 'not_tabletop' | 'scene' | 'leak_opponent_hand' | 'unlabelled_zone' | 'no_active_player' | 'leak_face_down'
  | 'no_log' | 'stuck' | 'deadline_rejected' | 'rejected' | 'log_without_names';

/** One view audit finding (repeated findings are counted). */
export interface AuditFinding {
  /** Severity. */
  severity: 'error' | 'warn' | 'info';
  /** Code. */
  code: AuditCode;
  /** Readable message. */
  message: string;
  /** Where it was first seen. */
  first: { game?: number; move?: number; viewer?: PlayerId; player?: PlayerId; object?: string };
  /** How often it was seen. */
  count: number;
}

/** The view audit report. */
export interface AuditReport {
  /** Games played. */
  games: number;
  /** Views inspected. */
  views: number;
  /** Log lines seen. */
  logLines: number;
  /** Findings, errors first. */
  findings: AuditFinding[];
}

// ------------------------------------------------------------------ replays

/** One frame of a replay. Frame 0 is the state right after setup. */
export interface ReplayFrame<S = any> {
  /** Frame index. */
  index: number;
  /** The move that led here (`null` for frame 0). */
  move: RecordedMove | null;
  /** State after the move. */
  state: S;
  /** RNG continuation seed. */
  rng: number;
  /** The move's fx. */
  fx: Fx[];
  /** End result, if the game ended. */
  result: EndResult | null;
  /** Rejection message of a rejected move. */
  error: string | null;
  /** The move was rejected (and not applied). */
  rejected: boolean;
  /** Host time of the move (ms). */
  at: number;
}

/** A replay run. */
export interface ReplayRun<S = any> {
  /** Every frame. */
  frames: Array<ReplayFrame<S>>;
  /** `false` when a recorded move behaves differently now. */
  ok: boolean;
  /** Why it diverged, or `null`. */
  error: string | null;
  /** First diverging move, or `null`. */
  divergedAt: number | null;
}

/** The inputs of a replay (a `MatchRecord`, with optional fields). */
export interface ReplayInput {
  /** Setup seed. */
  seed: number;
  /** Players in seating order. */
  players?: Player[];
  /** Setup options. */
  options?: Record<string, unknown>;
  /** Recorded moves. */
  moves?: RecordedMove[];
  /** Host time at start. */
  startedAt?: number | string;
}

/** Re-run a recorded game → every state the table went through. */
export declare function replayMatch<S>(mod: LoadedGameModule<S>, record: ReplayInput): ReplayRun<S>;
/** One-line description of a recorded move: `"Bo · deliver {"port":"x"}"`. */
export declare function describeMove(move: RecordedMove | null | undefined, players?: readonly Player[]): string;

// ------------------------------------------------------------------ engine messages

/** Keys of the engine message dictionary (move errors, referee report, scene checks). */
export type MessageKey =
  | 'mustExport' | 'unknownMove' | 'noState' | 'moduleError' | 'setupNoState' | 'viewNoType' | 'needActions' | 'sceneError'
  | 'refereeFailed' | 'refereeSkipped' | 'simTimeout' | 'sceneMissing' | 'zoneNoId' | 'zoneDup' | 'objNoId' | 'objDup'
  | 'objZone' | 'objEnter' | 'objAnchor' | 'hexNoCell' | 'hexBadCell' | 'linkEnd' | 'summary' | 'repErrors' | 'repRejected'
  | 'repStuck' | 'repInvariants' | 'repViews' | 'allRejected' | 'viewNoTypeShort' | 'invariantsError' | 'notPlaying'
  | 'notPlayer' | 'invalidMove' | 'hostOnly' | 'lobbyOnly' | 'started' | 'badSeat' | 'seatFull' | 'gameFull' | 'noSeat'
  | 'noBots' | 'minPlayers' | 'badPace' | 'timer' | 'system' | 'spectator' | 'bot';

/** An engine message dictionary: strings, or functions of the message's arguments. Missing keys fall back to English. */
export type EngineMessages = Partial<Record<MessageKey, string | ((...args: any[]) => string)>>;

/** Switch engine messages to a built-in (`'en'`, `'tr'`) or registered locale. */
export declare function setLocale(name: string): void;
/** Register a message dictionary (merged over English). */
export declare function addLocale(name: string, dict: EngineMessages): void;
