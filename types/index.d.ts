// tablecraft — isomorphic core + match clients (no three.js, no React). See docs/client.md and docs/testing.md.
import type { LoadedGameModule, RefereeReport, SimulateOptions, ValidateOptions, ValidateResult, BalanceOptions, BalanceReport, SweepOptions, SweepRun, AuditOptions, AuditReport } from './core.js';

export * from './contract.js';
export * from './kit.js';
export {
  T, KIT_SOURCE, createKit, makeRandom, randomSeed, checkScene, PACE, botDelay, visibleFx, chooseBotMove, isBotId,
  Match, testPlayers, summarize, compareReports, sweepPoint, BOT_PROFILES, replayMatch, describeMove, setLocale, addLocale,
} from './core.js';
export type {
  MoveInput, MoveOutcome, LoadedGameModule, SeededRandom, Pace, RecordedMove, MatchRecord, MatchStatus, MatchSnapshot,
  MatchOptions, BotMode, SimulateOptions, RefereeIssue, SimulateReport, SkippedReport, RefereeReport, ValidateOptions,
  ValidateResult, BotProfile, BalanceOptions, BalanceWarningCode, BalanceWarning, BalanceByPlayers, BalanceReport,
  SweepOptions, SweepRun, ReportDelta, AuditOptions, AuditCode, AuditFinding, AuditReport, ReplayFrame, ReplayRun,
  ReplayInput, MessageKey, EngineMessages,
} from './core.js';
export { createLocalMatch, connectRoom, createReplay, LocalGameModule } from './client.js';
export type {
  Assets, FxBatch, ActResult, LiveSnapshot, ErrorSnapshot, Snapshot, SnapshotSource, MatchClient, ModuleInput,
  LocalPlayer, LocalMatchOptions, LocalMatch, RoomSocket, IdStorage, ConnectRoomOptions, RoomClient, TimelineEntry,
  ReplaySnapshot, ReplayOptions, ReplayClient,
} from './client.js';

/** Run the referee on a loaded module: many bot games; errors, rejected actions, stuck games, broken views. */
export declare function simulate<S>(mod: LoadedGameModule<S>, opts?: SimulateOptions): RefereeReport;
/** Smoke test (setup, every view, scene checks, short referee run); throws a readable error on the first problem. */
export declare function validate<S>(mod: LoadedGameModule<S>, options?: ValidateOptions): ValidateResult;
/** The balance lab on a loaded module: seat advantage, length, forced decisions, comebacks, dominant strategies. */
export declare function analyzeBalance<S>(mod: LoadedGameModule<S>, opts?: BalanceOptions): BalanceReport;
/** Run the balance lab once per candidate value of one number. */
export declare function sweepParameter<S>(mod: LoadedGameModule<S>, opts: SweepOptions): SweepRun[];
/** Play bot games and inspect every view: hidden-information leaks, scene errors, readability. */
export declare function auditViews<S>(mod: LoadedGameModule<S>, opts?: AuditOptions): AuditReport;

/** Package version. */
export declare const VERSION: string;
