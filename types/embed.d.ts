// tablecraft/embed — mount a full game into any DOM element without writing React yourself.
import type { GameComponentBaseProps } from './ui.js';

export { createLocalMatch, connectRoom } from './client.js';
export type { LocalMatch, LocalMatchOptions, RoomClient, ConnectRoomOptions, MatchClient, Snapshot } from './client.js';
export type { HudStrings, HudStringOverrides, Locale } from './ui.js';

/** Props of `mountGame` (the props of `<TablecraftGame>`). */
export interface MountGameProps extends GameComponentBaseProps {
  /** Inline style of the root `.tc-wrap` (React style object). */
  style?: Record<string, string | number | undefined>;
  /** Extra toolbar content (a React node). */
  headerExtra?: unknown;
}

/** A mounted game. */
export interface MountedGame {
  /** Re-render with changed props (merged over the initial ones). */
  update(next: Partial<MountGameProps>): void;
  /** Unmount and clean up. */
  unmount(): void;
}

/** Render `<TablecraftGame>` (lobby → table → end screen) into an element. */
export declare function mountGame(el: Element | DocumentFragment, props: MountGameProps): MountedGame;
