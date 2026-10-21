// Match clients (docs/client.md): the in-browser local match, the room client and replays — one interface the UI
// talks to — plus the browser runtime for game modules.
import type { Fx, Meta, MoveArgs, PlayerId } from './contract.js';
import type { LoadedGameModule, MatchRecord, MatchSnapshot, Match, Pace, ReplayFrame, ReplayInput } from './core.js';

/** Asset map `{ key: url }` for card art, table tops and sounds. */
export type Assets = Record<string, string>;

/** A batch of effects; a new `seq` plays `list` once. */
export interface FxBatch {
  /** Changes for every new batch. */
  seq: number | string;
  /** The effects. */
  list: Fx[];
}

/** Result of a client action. */
export type ActResult = { ok: true; error?: undefined } | { ok: false; error: string };

/** A live snapshot of a match for one player. */
export interface LiveSnapshot extends MatchSnapshot {
  /** Room code (`'LOCAL'` for local matches). */
  code: string;
  /** Asset map. */
  assets: Assets;
  /** Effects of the last change, or `null`. */
  fx: FxBatch | null;
  /** Ms to add to `Date.now()` for host time (sand timers). */
  serverOffset: number;
  /** Set on local matches. */
  local?: boolean;
  /** Room clients: the server time (ms) the snapshot was sent. */
  fxSeq?: number;
  /** Not an error snapshot. */
  error?: undefined;
}

/** A client that failed (room not found, connection error, empty replay). */
export interface ErrorSnapshot extends Partial<Omit<LiveSnapshot, 'status' | 'error'>> {
  /** Discriminator. */
  status: 'error';
  /** What went wrong. */
  error: string;
}

/** What a MatchClient publishes: discriminate on `status`. */
export type Snapshot = LiveSnapshot | ErrorSnapshot;

/** The minimal client `useMatch` and `<Tabletop>` need: snapshots plus move intents. */
export interface SnapshotSource<Snap = Snapshot> {
  /** Called with every new snapshot → unsubscribe. */
  subscribe(fn: (snapshot: Snap) => void): () => void;
  /** The latest snapshot (`null` before the first one). */
  getSnapshot(): Snap | null;
  /** Send a move intent. */
  move(name: string, args?: MoveArgs): Promise<ActResult>;
  /** Change the bot pace (host only). */
  setPace?(pace: Pace): Promise<ActResult>;
}

/** The source of truth the UI talks to: `createLocalMatch()` or `connectRoom()`. */
export interface MatchClient extends SnapshotSource<Snapshot> {
  /** Sit down in the lobby (on `seat`, with an optional name). */
  join(seat?: string | null, name?: string): Promise<ActResult>;
  /** Leave the lobby. */
  leave(): Promise<ActResult>;
  /** Add a bot (host). */
  addBot(seat?: string | null): Promise<ActResult>;
  /** Remove a bot (host). */
  removeBot(id: PlayerId): Promise<ActResult>;
  /** Start the game (host). */
  start(): Promise<ActResult>;
  /** Back to the lobby (host). */
  restart(): Promise<ActResult>;
  /** Change the bot pace (host). */
  setPace(pace: Pace): Promise<ActResult>;
  /** Stop timers and listeners. */
  dispose(): void;
}

/** A game module given as source text or already loaded. */
export type ModuleInput =
  | { /** Module source text. */ source: string; /** A loaded module (wins over `source`). */ module?: LoadedGameModule }
  | { /** Module source text. */ source?: string; /** A loaded module (wins over `source`). */ module: LoadedGameModule };

/** A local player: a name, `'bot'`, or a spec. The first non-bot entry is you. */
export type LocalPlayer = string | { name?: string; id?: PlayerId; seat?: string | null; bot?: boolean };

/** Options of `createLocalMatch`. */
export type LocalMatchOptions = ModuleInput & {
  /** Game data (`options.content` in `setup`). */
  content?: unknown;
  /** Other setup options (`variant`, …). */
  options?: Record<string, unknown>;
  /** Players: names, `'bot'` or specs (default `['You', 'bot']`). */
  players?: LocalPlayer[];
  /** Setup seed (default random). */
  seed?: number;
  /** Bot pace (default `'normal'`). */
  pace?: Pace;
  /** Asset map. */
  assets?: Assets;
  /** Start right away (default `true`). */
  autoStart?: boolean;
  /** Your player id (default `'you'`). */
  playerId?: PlayerId;
};

/** A match played entirely in the browser — you plus bots, no server. */
export interface LocalMatch extends MatchClient {
  /** Your player id. */
  playerId: PlayerId;
  /** The underlying state machine. */
  match: Match;
  /** The replay record of the current game (`null` before start). */
  record(): MatchRecord | null;
}

/** The parts of a socket.io-client socket `connectRoom` uses. */
export interface RoomSocket {
  /** Listen to an event. */
  on(event: string, listener: (...args: any[]) => void): unknown;
  /** Emit an event with an ack callback. */
  emit(event: string, ...args: any[]): unknown;
  /** Close the connection. */
  close(): unknown;
}

/** Key/value storage for the guest id (`localStorage`-like). */
export interface IdStorage {
  /** Read a value. */
  getItem(key: string): string | null;
  /** Write a value. */
  setItem(key: string, value: string): void;
}

/** Options of `connectRoom`. */
export interface ConnectRoomOptions<S extends RoomSocket = RoomSocket> {
  /** The socket.io-client `io` function (passed in so the core does not depend on it). */
  io: (uri: string, opts: any) => S;
  /** Server URL (default: same origin). */
  url?: string;
  /** Namespace (default `'/tablecraft'`). */
  namespace?: string;
  /** socket.io path. */
  path?: string;
  /** Room code. */
  room: string;
  /** Your display name. */
  name?: string;
  /** Extra handshake auth (e.g. a token for `identify`). */
  auth?: Record<string, unknown>;
  /** Where the guest id is remembered (default `localStorage`; `null` disables). */
  storage?: IdStorage | null;
}

/** A client for a room on a Tablecraft room server. */
export interface RoomClient<S extends RoomSocket = RoomSocket> extends MatchClient {
  /** The id this socket plays as (`null` until `hello`). */
  readonly playerId: PlayerId | null;
  /** The fatal error message, if any. */
  readonly error: string | null;
  /** The socket.io socket. */
  socket: S;
}

/** A timeline entry of a replay. */
export interface TimelineEntry {
  /** Frame index. */
  index: number;
  /** `'setup'` or the move description. */
  label: string;
  /** The move was rejected. */
  rejected: boolean;
  /** Text of a banner fx at this frame, or `null`. */
  banner: string | null;
  /** Host time (ms). */
  at: number;
}

/** A replay snapshot: the live fields plus transport state. */
export interface ReplaySnapshot extends Omit<LiveSnapshot, 'status' | 'moves' | 'pace' | 'error' | 'host' | 'local' | 'fxSeq'> {
  /** Finished once the frame has a result. */
  status: 'playing' | 'finished';
  /** Discriminator. */
  replay: true;
  /** Always `null`. */
  host: null;
  /** Current frame index. */
  index: number;
  /** Number of frames. */
  length: number;
  /** Auto-playing? */
  playing: boolean;
  /** Playback speed. */
  speed: number;
  /** Whose eyes (`'spectator'` for none). */
  viewer: PlayerId;
  /** Current timeline entry. */
  frame: TimelineEntry;
  /** Every timeline entry. */
  timeline: TimelineEntry[];
  /** `false` when the replay diverged. */
  ok: boolean;
  /** Why it diverged, or `null`. */
  error: string | null;
}

/** Options of `createReplay`. */
export type ReplayOptions = ModuleInput & ReplayInput & {
  /** Whose eyes to watch through (default the first player). */
  viewer?: PlayerId;
  /** Asset map. */
  assets?: Assets;
  /** Override the module's `meta`. */
  meta?: Meta;
};

/** A recorded game you can watch again — a read-only client with transport controls. */
export interface ReplayClient extends SnapshotSource<ReplaySnapshot | ErrorSnapshot> {
  /** Discriminator. */
  replay: true;
  /** Every frame. */
  frames: ReplayFrame[];
  /** Every timeline entry. */
  timeline: TimelineEntry[];
  /** `false` when the replay diverged. */
  ok: boolean;
  /** Why it diverged, or `null`. */
  error: string | null;
  /** Current frame index. */
  readonly index: number;
  /** Number of frames. */
  readonly length: number;
  /** Always rejects: replays are read-only. */
  move(name?: string, args?: MoveArgs): Promise<ActResult>;
  /** Play from here (restarts at the end). */
  play(): void;
  /** Pause. */
  pause(): void;
  /** Step `n` frames (default 1, negative goes back). */
  step(n?: number): void;
  /** Jump to frame `i`. */
  seek(i: number): void;
  /** Watch through another player's eyes (or `'spectator'`). */
  setViewer(id: PlayerId): void;
  /** Playback speed, 0.25–8. */
  setSpeed(x: number): void;
  /** Stop timers and listeners. */
  dispose(): void;
}

/** Play a game in the browser: you plus bots, same rules runtime and pacing as online rooms. */
export declare function createLocalMatch(opts: LocalMatchOptions): LocalMatch;
/** Connect to a room on a Tablecraft room server (`createRoomServer`). */
export declare function connectRoom<S extends RoomSocket>(opts: ConnectRoomOptions<S>): RoomClient<S>;
/** Watch a recorded game again — any player's point of view, step by step or at speed. */
export declare function createReplay(opts: ReplayOptions): ReplayClient;

/** Browser runtime for your own modules (a Function scope — not a sandbox for untrusted code). */
export interface LocalGameModule<S = any> extends LoadedGameModule<S> {}
/** Browser runtime for your own modules: `new LocalGameModule(source)`; throws when it doesn't export setup/view/moves. */
export declare const LocalGameModule: new <S = any>(code: string) => LocalGameModule<S>;
