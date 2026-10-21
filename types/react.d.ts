// tablecraft/react — the 3D table component and the high-level game component (docs/client.md).
// Needs @types/react in TypeScript projects.
import type { CSSProperties, Context, ReactElement, ReactNode } from 'react';
import type { EndResult, MoveIntent, Player, UiNode as UiNodeSpec, View } from './contract.js';
import type { Pace } from './core.js';
import type { Assets, FxBatch, MatchClient, ReplayClient, LiveSnapshot, SnapshotSource } from './client.js';
import type { GameComponentBaseProps, HudStringOverrides, HudStrings, Locale } from './ui.js';

export type { HudStrings, HudStringOverrides, HudVerbs, Locale, GameComponentBaseProps } from './ui.js';

/** Props of `<Tabletop>`: the 3D table + HUD for a view you provide. */
export interface TabletopProps {
  /** `{ type: 'tabletop', scene, hud }` for this player (`null` while loading). */
  view?: View | null;
  /** Effects; a new `seq` plays `list` once. */
  fx?: FxBatch | null;
  /** Asset map for card art. */
  assets?: Assets;
  /** Send an intent. */
  onMove?: (intent: MoveIntent) => unknown;
  /** The viewing player. */
  you?: Pick<Player, 'id' | 'name'> | null;
  /** Ms to add to `Date.now()` for host time (sand timers). */
  serverOffset?: number;
  /** `endIf()` result → end screen. */
  result?: EndResult | null;
  /** Extra toolbar content. */
  headerExtra?: ReactNode;
  /** Current bot pace (shows the control with `onPace`). */
  pace?: Pace;
  /** Change the bot pace (host only). */
  onPace?: (pace: Pace) => unknown;
  /** HUD locale (default `'en'`). */
  locale?: Locale;
  /** HUD string overrides. */
  strings?: HudStringOverrides;
  /** Class on the root `.tc-wrap`. */
  className?: string;
  /** Style on the root `.tc-wrap` (78vh tall by default). */
  style?: CSSProperties;
}

/** The 3D table + HUD for a view you provide. */
export declare function Tabletop(props: TabletopProps): ReactElement;

/** Props of `<TablecraftGame>`. */
export interface TablecraftGameProps extends GameComponentBaseProps {
  /** Style on the root `.tc-wrap`. */
  style?: CSSProperties;
  /** Extra toolbar content. */
  headerExtra?: ReactNode;
}

/** Everything in one component: lobby → 3D table → end screen. */
export declare function TablecraftGame(props: TablecraftGameProps): ReactElement;

/** Props of `<Lobby>`. */
export interface LobbyProps {
  /** The match. */
  client: MatchClient;
  /** Its current (lobby) snapshot. */
  snapshot: LiveSnapshot;
  /** HUD locale. */
  locale?: Locale;
  /** HUD string overrides. */
  strings?: HudStringOverrides;
  /** Name used when sitting down. */
  name?: string;
}

/** The lobby: seats, bots, start button. */
export declare function Lobby(props: LobbyProps): ReactElement;

/** The `<Tabletop>` props `useMatch` derives from a snapshot. */
export interface MatchTableProps {
  /** Current view. */
  view: View | null | undefined;
  /** Current effects. */
  fx: FxBatch | null | undefined;
  /** Asset map. */
  assets: Assets | undefined;
  /** The viewing player. */
  you: Player | null | undefined;
  /** End result. */
  result: EndResult | null | undefined;
  /** Host time offset. */
  serverOffset: number;
  /** Sends `client.move`. */
  onMove: (intent: MoveIntent) => unknown;
  /** Bot pace. */
  pace: Pace | undefined;
  /** Pace control (host with bots only). */
  onPace: ((pace: Pace) => unknown) | undefined;
}

/** Turn any MatchClient (local, room or replay) into props for `<Tabletop>`. */
export declare function useMatch<Snap>(client: SnapshotSource<Snap> | null | undefined): {
  /** The latest snapshot. */
  snapshot: Snap | null;
  /** Props to spread on `<Tabletop>` (`null` before the first snapshot). */
  tableProps: MatchTableProps | null;
  /** Is the viewing player the host? */
  isHost: boolean;
};

/** Props of `<UiNode>`. */
export interface UiNodeProps {
  /** The declarative node. */
  node: UiNodeSpec | null | undefined;
  /** Called with the move of buttons, forms, cells and cards. */
  onMove: (intent: MoveIntent) => unknown;
}

/** Renders declarative 2D UI nodes (docs/hud.md#ui-nodes). */
export declare function UiNode(props: UiNodeProps): ReactElement | null;

/** Props of `<ReplayViewer>`. */
export interface ReplayViewerProps {
  /** The replay (`createReplay()`); disposed on unmount. */
  replay: ReplayClient;
  /** HUD locale. */
  locale?: Locale;
  /** HUD string overrides. */
  strings?: HudStringOverrides;
  /** Height (default `'78vh'`). */
  height?: string | number;
  /** Extra class. */
  className?: string;
  /** Extra style. */
  style?: CSSProperties;
}

/** A recorded game on the 3D table with a transport bar. */
export declare function ReplayViewer(props: ReplayViewerProps): ReactElement | null;

/** HUD strings for a locale plus overrides. */
export declare function buildStrings(locale?: Locale, overrides?: HudStringOverrides): HudStrings;
/** Built-in HUD dictionaries. */
export declare const LOCALES: { en: HudStrings; tr: HudStrings } & Record<string, HudStrings>;
/** React context holding the current HUD strings. */
export declare const StringsContext: Context<HudStrings>;
