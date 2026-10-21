// tablecraft/server — the Node side: sandboxed runtime, referee, balance lab and the socket.io room server.
// See docs/server.md, docs/testing.md and docs/balance.md.
import type { PlayerId, EndResult } from './contract.js';
import type {
  LoadedGameModule, Match, Pace, RefereeReport, SimulateOptions, SimulateReport, SkippedReport, ValidateOptions, ValidateResult,
  BalanceOptions, BalanceReport, SweepOptions, SweepRun, AuditOptions, AuditReport, MessageKey,
} from './core.js';
import type { Assets } from './client.js';

export * from './contract.js';
export * from './kit.js';
export {
  T, KIT_SOURCE, makeRandom, randomSeed, checkScene, PACE, botDelay, visibleFx, chooseBotMove, isBotId, Match,
  testPlayers, summarize, compareReports, sweepPoint, BOT_PROFILES, addLocale,
} from './core.js';
export type {
  MoveInput, MoveOutcome, LoadedGameModule, SeededRandom, Pace, RecordedMove, MatchRecord, MatchStatus, MatchSnapshot,
  MatchOptions, BotMode, SimulateOptions, RefereeIssue, SimulateReport, SkippedReport, RefereeReport, ValidateOptions,
  ValidateResult, BotProfile, BalanceOptions, BalanceWarningCode, BalanceWarning, BalanceByPlayers, BalanceReport,
  SweepOptions, SweepRun, ReportDelta, AuditOptions, AuditCode, AuditFinding, AuditReport, ReplayFrame, ReplayRun,
  ReplayInput, MessageKey, EngineMessages,
} from './core.js';
export type { Assets } from './client.js';

/** Module source text or a loaded module. */
export type ModuleSource<S = any> = string | LoadedGameModule<S>;

/** Default per-call time limit of the sandbox (ms). */
export declare const CALL_TIMEOUT: number;

/** Server runtime: a game module in a `node:vm` context with per-call time limits (not a hard security boundary). */
export interface GameModule<S = any> extends LoadedGameModule<S> {}
/** Server runtime: `new GameModule(source, { timeout })`; throws when the module doesn't export setup/view/moves. */
export declare const GameModule: new <S = any>(code: string, opts?: { timeout?: number }) => GameModule<S>;

/** Set the engine message locale for this process and its worker threads. */
export declare function configure(opts?: { locale?: string }): void;
/** An engine message in the current locale. */
export declare function msg(key: MessageKey, ...args: unknown[]): string;

/** Run the referee: many bot games; errors, rejected actions, stuck games, invariant violations, broken views. */
export declare function simulate(source: ModuleSource, opts?: SimulateOptions): RefereeReport;
/** Smoke test before saving/publishing; throws a readable error on the first problem. */
export declare function validate(source: ModuleSource, options?: ValidateOptions): ValidateResult;
/** The balance lab: seat advantage, length, forced decisions, lead changes, comebacks, dominant strategies. */
export declare function analyzeBalance(source: ModuleSource, opts?: BalanceOptions): BalanceReport;
/** Run the balance lab once per candidate value of one number. */
export declare function sweepParameter(source: ModuleSource, opts: SweepOptions): SweepRun[];
/** View audit: hidden-information leaks, scene errors, readability. */
export declare function audit(source: ModuleSource, opts?: AuditOptions): AuditReport;
/** `simulate()` in a worker thread (pass the source text) → the report plus `summary`. */
export declare function simulateAsync(source: string, opts?: SimulateOptions): Promise<(SimulateReport & { summary: string }) | SkippedReport>;
/** `analyzeBalance()` in a worker thread (pass the source text). */
export declare function analyzeBalanceAsync(source: string, opts?: BalanceOptions): Promise<BalanceReport>;

// ------------------------------------------------------------------ room server

/** The parts of a connected socket.io socket the room server reads. */
export interface RoomServerSocket {
  /** Handshake; `auth` holds `{ room, name, playerId?, ...yours }`. */
  handshake: { auth: Record<string, any> };
  /** Per-socket data (`playerId`, `name`). */
  data: any;
}

/** The parts of a socket.io namespace the room server uses (`io.of('/tablecraft')`). */
export interface RoomNamespace {
  /** Connection listener. */
  on(event: 'connection', listener: (socket: any) => void): unknown;
  /** Sockets in a room. */
  in(room: string): { fetchSockets(): Promise<any[]> };
}

/** An open room. */
export interface Room {
  /** Room code. */
  code: string;
  /** The live match. */
  match: Match;
  /** Asset map sent to clients. */
  assets: Assets;
}

/** Room events for logging and persistence. */
export type RoomEvent =
  | { /** A bot moved. */ type: 'move'; playerId: PlayerId; name: string; bot: true }
  | { /** The game finished. */ type: 'finish'; result: EndResult | null }
  | { /** A client request succeeded. */ type: 'join' | 'leave' | 'addBot' | 'removeBot' | 'start' | 'restart' | 'setPace' | 'move'; playerId: PlayerId; payload: Record<string, any>; bot?: undefined };

/** Options of `createRoomServer`. */
export interface RoomServerOptions {
  /** Map your auth to a stable player id; `null` → guest. */
  identify?: ((socket: RoomServerSocket) => { id: PlayerId; name?: string } | null | undefined | Promise<{ id: PlayerId; name?: string } | null | undefined>) | null;
  /** Default asset map for rooms. */
  assets?: Assets;
  /** Hook for logging/persistence. */
  onEvent?: (room: Room, event: RoomEvent) => void;
}

/** Options of `createRoom`. */
export type CreateRoomOptions = ({ source: string; module?: LoadedGameModule } | { source?: string; module: LoadedGameModule }) & {
  /** Room code (default random, 6 hex chars). */
  code?: string;
  /** Game data (`options.content`). */
  content?: unknown;
  /** Other setup options (`variant`, …). */
  options?: Record<string, unknown>;
  /** Bot pace. */
  pace?: Pace;
  /** Asset map for this room. */
  assets?: Assets;
  /** Setup seed. */
  seed?: number;
};

/** An in-memory room server. */
export interface RoomServer {
  /** Load a module and open a lobby → the room code. */
  createRoom(opts: CreateRoomOptions): string;
  /** An open room, or `null`. */
  getRoom(code: string): Room | null;
  /** Close a room and stop its timers. */
  deleteRoom(code: string): void;
  /** Open rooms by code. */
  rooms: Map<string, Room>;
}

/** Self-hosted multiplayer on a socket.io namespace: every move runs on the server. */
export declare function createRoomServer(nsp: RoomNamespace, opts?: RoomServerOptions): RoomServer;

