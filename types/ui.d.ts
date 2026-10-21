// HUD strings and the framework-neutral props of the game component (shared by tablecraft/react and tablecraft/embed).
import type { MatchClient } from './client.js';

/** Built-in HUD locales; unknown names fall back to English. */
export type Locale = 'en' | 'tr' | (string & {});

/** Verbs the Spotlight uses to describe moves (`n` = number of cards). */
export interface HudVerbs {
  /** Several kinds of moves at once. */
  mixed: string;
  /** Discarded a card. */
  discard: (n: number) => string;
  /** Revealed cards. */
  flip: (n: number) => string;
  /** Took cards. */
  take: (n: number) => string;
  /** Put cards on the table. */
  deal: (n: number) => string;
  /** Played cards. */
  play: (n: number) => string;
  /** Gave cards. */
  give: (n: number) => string;
  /** Moved a card. */
  moveCard: (n: number) => string;
  /** Is showing a card. */
  show: (n: number) => string;
}

/** Every HUD string (`buildStrings(locale, overrides)`). */
export interface HudStrings {
  /** Loading text. */ loading: string;
  /** "Your turn". */ yourTurn: string;
  /** "Turn:". */ turnOf: string;
  /** "you" tag. */ you: string;
  /** " (you)" suffix. */ youSuffix: string;
  /** "up" tag. */ active: string;
  /** Waiting. */ waiting: string;
  /** Decision dock title. */ decision: string;
  /** Hover hint for clickable objects. */ clickToMove: string;
  /** Hover hint for other objects. */ clickToZoom: string;
  /** Result. */ result: string;
  /** Close. */ close: string;
  /** Close (Esc). */ closeEsc: string;
  /** Enlarge. */ enlarge: string;
  /** Table. */ table: string;
  /** Camera: overview. */ camTable: string;
  /** Camera: my area. */ camMe: string;
  /** Camera: top-down. */ camTop: string;
  /** Game log button. */ log: string;
  /** Mute. */ mute: string;
  /** Unmute. */ unmute: string;
  /** Settings. */ settings: string;
  /** Controls help. */ help: string;
  /** Fullscreen. */ fullscreen: string;
  /** Exit fullscreen. */ exitFullscreen: string;
  /** Spotlight queue. */ queued: string;
  /** Hold. */ hold: string;
  /** Resume. */ resume: string;
  /** Skip. */ skip: string;
  /** Log title. */ logTitle: string;
  /** Copy log. */ copyLog: string;
  /** Close log. */ closeLog: string;
  /** Empty log. */ logEmpty: string;
  /** New entries. */ newEntries: string;
  /** "rolled". */ rolled: string;
  /** Dice. */ dice: string;
  /** Log filters. */ filters: { all: string; moves: string; cards: string; dice: string };
  /** Settings title. */ settingsTitle: string;
  /** Sound. */ sound: string;
  /** Animation speed. */ animSpeed: string;
  /** Cinematic. */ cinematic: string;
  /** Normal. */ normal: string;
  /** Fast. */ fast: string;
  /** Spotlight. */ spotlight: string;
  /** Spotlight hint. */ spotlightHint: string;
  /** Large. */ big: string;
  /** Side. */ side: string;
  /** Off. */ off: string;
  /** Show my own moves. */ spotSelf: string;
  /** Auto-focus my area. */ autoFocus: string;
  /** Graphics. */ quality: string;
  /** High. */ high: string;
  /** Performance. */ performance: string;
  /** Bot pace. */ botPace: string;
  /** Bot pace hint. */ botPaceHint: string;
  /** Slow. */ slow: string;
  /** Controls. */ controls: string;
  /** Help rows `[keys, action]`. */ helpRows: Array<[string, string]>;
  /** Game over. */ gameOver: string;
  /** You won. */ youWon: string;
  /** "X won". */ won: (names: string) => string;
  /** Inspect the table. */ inspectTable: string;
  /** Lobby. */ lobby: string;
  /** Pick a seat. */ pickSeat: string;
  /** Sit. */ sit: string;
  /** You are here. */ here: string;
  /** Add bot. */ addBot: string;
  /** Empty seat. */ empty: string;
  /** Start game. */ start: string;
  /** New game. */ newGame: string;
  /** Host hint. */ hostHint: string;
  /** Guest hint. */ guestHint: string;
  /** Player. */ player: string;
  /** Connecting. */ connecting: string;
  /** Replay. */ replay: string;
  /** Play. */ rpPlay: string;
  /** Pause. */ rpPause: string;
  /** Previous move. */ rpBack: string;
  /** Next move. */ rpForward: string;
  /** Speed. */ rpSpeed: string;
  /** Watch as. */ rpViewer: string;
  /** Spectator. */ rpSpectator: string;
  /** Setup. */ rpSetup: string;
  /** Rejected. */ rpRejected: string;
  /** "Move i / n". */ rpMove: (i: number, n: number) => string;
  /** Diverged warning. */ rpDiverged: (n: string | number) => string;
  /** Spotlight verbs. */ verbs: HudVerbs;
  /** Date locale for timestamps (set by `buildStrings`). */ dateLocale?: string;
}

/** Overrides for single HUD strings (or a whole language); `verbs` and `filters` merge key by key. */
export type HudStringOverrides = Partial<Omit<HudStrings, 'verbs' | 'filters'>> & {
  /** Verb overrides. */
  verbs?: Partial<HudVerbs>;
  /** Filter label overrides. */
  filters?: Partial<HudStrings['filters']>;
};

/** Framework-neutral props of `<TablecraftGame>` / `mountGame`. */
export interface GameComponentBaseProps {
  /** The match to show (`createLocalMatch()` or `connectRoom()`). */
  client: MatchClient;
  /** HUD locale (default `'en'`). */
  locale?: Locale;
  /** HUD string overrides. */
  strings?: HudStringOverrides;
  /** Name used when sitting down in the lobby. */
  name?: string;
  /** Class on the root `.tc-wrap`. */
  className?: string;
}
