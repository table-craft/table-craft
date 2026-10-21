// The game-module contract: everything a game file exports and everything the runtime hands it.
// Pure types, no globals. Game files get these through `tablecraft/game` (which also declares `T`, `clone`
// and `module`); hosts get them re-exported from `tablecraft` and `tablecraft/server`.
// See docs/game-module.md, docs/scene.md, docs/hud.md and docs/fx.md.

// ------------------------------------------------------------------ basics

/** A player id: whatever the host gave the player (`'p1'`, `'u_42'`, `'bot_ab12cd'`, `'system'`, `'spectator'`). */
export type PlayerId = string;

/** Arguments of a move intent. They come from a client — validate them in every move. */
export type MoveArgs = Record<string, any>;

/** A move intent: the name of a move plus its arguments. */
export interface MoveIntent<Args = MoveArgs> {
  /** Name of the move in `moves`. */
  name: string;
  /** Arguments passed to the move as `ctx.args`. */
  args?: Args;
}

/** A player as the runtime sees it (seating order is the order of `ctx.players`). */
export interface Player {
  /** Stable player id. */
  id: PlayerId;
  /** Display name. */
  name: string;
  /** Seat id from `meta.seats`, or `null`. */
  seat?: string | null;
  /** Team of the seat, or `null`. */
  team?: string | null;
  /** Role of the seat (`'spectator'` for the spectator view), or `null`. */
  role?: string | null;
  /** Host-side user id (room server `identify`), or `null`. */
  userId?: string | null;
}

/** Seeded, serialisable randomness (`ctx.random`). Every move continues the match's stream. */
export interface Random {
  /** A float in [0, 1). */
  float(): number;
  /** An integer in [0, n). */
  int(n: number): number;
  /** A shuffled copy (the input is not changed). */
  shuffle<V>(items: Iterable<V> | ArrayLike<V>): V[];
  /** One random element (`undefined` for an empty list). */
  pick<V>(items: readonly V[]): V;
}

// ------------------------------------------------------------------ meta

/** A named seat players pick in the lobby (ship colours, factions). */
export interface SeatDef {
  /** Seat id (stored as `player.seat`). */
  id: string;
  /** Lobby label. */
  label: string;
  /** Team copied to `player.team`. */
  team?: string;
  /** Role copied to `player.role`. */
  role?: string;
  /** Maximum players on this seat (unlimited when omitted). */
  max?: number;
}

/** A rules variant, passed to `setup` as `options.variant`. */
export interface VariantDef {
  /** Variant id (`options.variant`). */
  id: string;
  /** Lobby label. */
  label: string;
}

/** `meta`: how the game presents itself in the lobby. */
export interface Meta {
  /** Shown in the lobby. */
  name?: string;
  /** `start` is refused below this many players. */
  minPlayers?: number;
  /** Joins are refused above this many players. */
  maxPlayers?: number;
  /** Lobby subtitle. */
  description?: string;
  /** Named seats; bots fill free ones. */
  seats?: SeatDef[];
  /** Variants, passed to `setup` as `options.variant`. */
  variants?: VariantDef[];
}

// ------------------------------------------------------------------ ctx

/** Options of `ctx.roll` / `ctx.rollMany`. */
export interface RollOptions {
  /** Id of the scene `die` object to throw (`ctx.roll` only; default `'die'`). */
  id?: string;
  /** Player id the die is thrown from (their seat). */
  by?: PlayerId | null;
  /** Zone the dice land in. */
  zone?: string | null;
  /** Only these players see the throw (private roll). */
  to?: PlayerId[];
}

/** Result of one die. `index` is the face index (render it with `value: index`); `face` is the face value. */
export interface RollResult<F = number> {
  /** Face index, 0-based. */
  index: number;
  /** The face: the list entry, or 1..n for numeric dice. */
  face: F;
}

/** One die for `ctx.rollMany`. */
export interface DieSpec<F = number> {
  /** Id of the scene `die` object. */
  id: string;
  /** Number of sides (default 6) or the list of faces. */
  faces?: number | readonly F[];
}

/** The effect helpers every runtime call that may animate gets (`setup` and moves). */
export interface EffectsCtx {
  /** Queue an [effect](../docs/fx.md) for clients. */
  fx(event: Fx): void;
  /** Roll one die and throw it on the table → `{ index, face }`. */
  roll(faces?: number, opts?: RollOptions): RollResult<number>;
  /** Roll one die with custom faces and throw it on the table → `{ index, face }`. */
  roll<F>(faces: readonly F[], opts?: RollOptions): RollResult<F>;
  /** Roll several dice at once (one throw) → `[{ id, index, face }]`. */
  rollMany<F = number>(dice: readonly DieSpec<F>[], opts?: RollOptions): Array<RollResult<F> & { id: string }>;
  /** Host time in ms (use it for sand timers, never `Date.now()`). */
  now: number;
}

/** Setup options: whatever the host passed, plus `content` (your game data) and `variant`. */
export interface SetupOptions<Content = any> {
  /** Your game data: cards, maps… (`{}` when the host passed none). */
  content?: Content;
  /** Selected variant id from `meta.variants`. */
  variant?: string;
  /** Any other option the host passed. */
  [key: string]: unknown;
}

/** `setup(ctx)` input. */
export interface SetupCtx<Content = any> extends EffectsCtx {
  /** Players in seating order. */
  players: Player[];
  /** Host options (`options.content` is your game data). */
  options: SetupOptions<Content>;
  /** Seeded RNG. */
  random: Random;
}

/** `moves.name(state, ctx)` input. */
export interface MoveCtx<Args = MoveArgs> extends EffectsCtx {
  /** Who sent the intent (`'system'` for an expired sand timer without a player). */
  playerId: PlayerId;
  /** The sending player. */
  player: Player;
  /** The intent's arguments — validate them, they come from a client. */
  args: Args;
  /** Seeded RNG, continues the match's stream. */
  random: Random;
}

/** Who is looking: the second argument of `view`, `actions` and `score`. */
export interface Viewer {
  /** The viewing player's id (`'spectator'` for spectators). */
  playerId: PlayerId;
  /** The viewing player. */
  player: Player;
}

/** `bot(state, input)` input. */
export interface BotInput extends Viewer {
  /** The player's legal actions right now (from `actions()`). */
  actions: Action[];
  /** Seeded RNG. */
  random: Random;
}

/** A rejected move: nothing changes and the message is shown to that player. */
export interface MoveError {
  /** Readable reason. */
  error: string;
}

/** A legal move for `actions()` / `bot()`. */
export interface Action<Args = MoveArgs> {
  /** Move name. */
  name: string;
  /** Concrete arguments. */
  args?: Args;
  /** Optional label. The engine, bots and HUD don't read it; MCP `get_state` passes it through with the action. */
  label?: string;
  /** Negotiation-style move that never advances the game (offers, chat, cancel). */
  free?: boolean;
}

/** A pending sand timer, stored in `state.$deadline` by `T.setDeadline`. */
export interface Deadline {
  /** Host time (ms) when the timer runs out. */
  at: number;
  /** Duration in seconds. */
  seconds: number;
  /** Move applied when time is up. */
  move: string;
  /** Arguments of that move. */
  args: MoveArgs;
  /** Player the move is applied as (`null` = the system). */
  playerId: PlayerId | null;
}

// ------------------------------------------------------------------ end

/** One row of a final ranking. */
export interface RankRow {
  /** Player id. */
  id: PlayerId;
  /** Display name. */
  name?: string;
  /** Primary score. */
  score?: number;
  /** Place, 1-based; ties share a place (1, 1, 3). */
  place?: number;
}

/** What `endIf` returns to finish the game; the end screen shows winner, reason and ranking. */
export interface EndResult {
  /** Winning player ids (several = shared victory). */
  winners?: PlayerId[];
  /** A single winner id (or comma-separated ids) — alternative to `winners`. */
  winner?: PlayerId | null;
  /** Why the game ended. */
  reason?: string;
  /** Final ranking, best first. */
  ranking?: RankRow[];
  /** Scores by player id (the end screen shows each player's name and colour; other keys are shown as they are) — alternative to `ranking`. */
  scores?: Record<string, number | string>;
}

// ------------------------------------------------------------------ fx

/** Fields every effect may carry. */
export interface FxBase {
  /** Show this effect only to these players. */
  to?: PlayerId[];
}

/** Dice throw (emitted by `ctx.roll` / `ctx.rollMany`). */
export interface RollFx extends FxBase {
  /** Discriminator. */
  type: 'roll';
  /** The scene dice and the face index each settles on. */
  dice: Array<{ id: string; value: number }>;
  /** Thrower's player id. */
  by?: PlayerId | null;
  /** Zone the dice land in. */
  zone?: string | null;
}

/** Cinematic band across the table. Banners queue, never overlap. */
export interface BannerFx extends FxBase {
  /** Discriminator. */
  type: 'banner';
  /** Main line. */
  text: string;
  /** Second line. */
  sub?: string;
  /** Accent colour. */
  color?: string;
  /** Sound to play (default `'gong'`). */
  sound?: SoundName;
  /** Duration in ms (default 2600, max 6000). */
  ms?: number;
}

/** Short notification with an icon and a progress bar. */
export interface ToastFx extends FxBase {
  /** Discriminator. */
  type: 'toast';
  /** Message. */
  text: string;
  /** Icon and sound. */
  tone?: 'info' | 'good' | 'bad';
  /** Duration in ms (default 4200). */
  ms?: number;
  /** `false` keeps it silent. */
  sound?: false;
}

/** Play a sound. */
export interface SoundFx extends FxBase {
  /** Discriminator. */
  type: 'sound';
  /** Built-in sound or a `scene.sounds` key. */
  name: SoundName;
  /** Volume 0..1. */
  vol?: number;
}

/** Camera shake — storms, explosions, betrayals. */
export interface ShakeFx extends FxBase {
  /** Discriminator. */
  type: 'shake';
  /** Strength (default 0.7). */
  strength?: number;
  /** Sound (default `'storm'`). */
  sound?: SoundName;
}

/** Tokens physically tossed onto the table (gold paid, damage dealt). */
export interface TossFx extends FxBase {
  /** Discriminator. */
  type: 'toss';
  /** Target zone id. */
  zone?: string;
  /** Target object id. */
  target?: string;
  /** Player id or object id they fly from. */
  from?: string;
  /** How many tokens. */
  n?: number;
  /** What the tokens look like. */
  token?: { shape?: TokenShape; color?: string; face?: Face };
}

/** Pulse a glow under objects. */
export interface HighlightFx extends FxBase {
  /** Discriminator. */
  type: 'highlight';
  /** Object ids. */
  ids: string[];
  /** Glow colour. */
  color?: string;
  /** Duration in ms (default 1600). */
  ms?: number;
}

/** Put objects on the Spotlight for everyone. */
export interface RevealFx extends FxBase {
  /** Discriminator. */
  type: 'reveal';
  /** Object ids. */
  ids: string[];
  /** Player who revealed them. */
  by?: PlayerId | null;
  /** Caption title. */
  title?: string;
  /** Caption text. */
  text?: string;
}

/** Move the camera. */
export interface FocusFx extends FxBase {
  /** Discriminator. */
  type: 'focus';
  /** Zone to look at. */
  zone?: string;
  /** Object to look at. */
  id?: string;
  /** Camera preset. */
  preset?: CameraPreset;
}

/** An effect: a moment that is not state (animations follow state by themselves). Discriminated by `type`. */
export type Fx = RollFx | BannerFx | ToastFx | SoundFx | ShakeFx | TossFx | HighlightFx | RevealFx | FocusFx;

/** Every `Fx['type']`. */
export type FxType = Fx['type'];

/** Built-in procedural sounds; any other string is a `scene.sounds` key. */
export type SoundName =
  | 'slide' | 'flip' | 'deal' | 'shuffle' | 'tap' | 'clink' | 'clack' | 'dice' | 'chime' | 'turn' | 'notify'
  | 'reveal' | 'good' | 'bad' | 'error' | 'whoosh' | 'gong' | 'win' | 'storm' | 'tick' | 'alarm' | 'hover'
  | (string & {});

// ------------------------------------------------------------------ faces

/** Text or detailed corner content of a card face. */
export type FaceCorner = string | number | { text?: string | number; sub?: string; color?: string; icon?: string };

/** A face drawn from data: a title string, or a full description. */
export type Face = string | FaceSpec;

/** A face drawn from data (cards, decks, tokens, dice, boards, hex tiles). */
export interface FaceSpec {
  /** Art: an asset key or a URL. */
  image?: string;
  /** `'art'`: framed card (default); `'full'`: full-bleed image. */
  fit?: 'art' | 'full';
  /** Title. */
  title?: string | number;
  /** Subtitle. */
  subtitle?: string;
  /** Rules text. */
  text?: string | number;
  /** Flavour text. */
  flavor?: string;
  /** Footer line. */
  footer?: string;
  /** Glyph used by the default illustration. */
  icon?: string;
  /** Accent colour. */
  color?: string;
  /** Paper colour. */
  bg?: string;
  /** Text colour. */
  ink?: string;
  /** Frame colour. */
  border?: string;
  /** Tint over the image (hex tiles). */
  tint?: string;
  /** Turns the image, degrees clockwise seen from above (hex tiles). */
  rotate?: number;
  /** Corner content: cost, points… */
  corners?: { tl?: FaceCorner; tr?: FaceCorner; bl?: FaceCorner; br?: FaceCorner };
  /** Requirements row. */
  chips?: Array<{ label: string; color?: string; icon?: string }>;
  /** Text alignment. */
  align?: 'left' | 'center';
  /** Vertical focus of the image, 0..1. */
  focus?: number;
  /** Show the title over a full-bleed image. */
  titleOnFull?: boolean;
  /** `false`: draw the number instead of pips on numeric die faces. */
  pips?: boolean;
}

// ------------------------------------------------------------------ scene

/** Camera presets. */
export type CameraPreset = 'table' | 'me' | 'top' | 'center';

/** Lighting/mood presets. */
export type EnvPreset = 'tavern' | 'winter' | 'day' | 'night' | 'sea' | 'forest';

/** Ambient sound loops. */
export type Ambience = 'wind' | 'fire' | 'winter' | 'rain' | 'sea' | 'tavern';

/** Table surfaces. */
export type TableSurface = 'wood' | 'darkwood' | 'felt' | 'felt-blue' | 'felt-red' | 'stone' | 'snow' | 'leather' | 'dark';

/** Zone layouts. */
export type ZoneLayout = 'row' | 'column' | 'grid' | 'stack' | 'pile' | 'fan' | 'track' | 'hex' | 'free';

/** Named card sizes (cm): poker 6.3×8.8 … */
export type CardSizeName = 'poker' | 'bridge' | 'mini' | 'tarot' | 'square' | 'large' | 'domino';

/** Token shapes. */
export type TokenShape = 'disc' | 'coin' | 'square' | 'hex' | 'cube' | 'cylinder' | 'pawn' | 'meeple' | 'house' | 'star' | 'gem' | 'boat';

/** Hex tile terrains. */
export type Terrain = 'plains' | 'grass' | 'desert' | 'snow' | 'swamp' | 'forest' | 'hills' | 'mountain' | 'city' | 'wasteland' | 'water' | 'sea';

/** A position `[x, z]` in centimetres (a 2-tuple; `as const` tuples work too). */
export type Vec2 = readonly [number, number];

/** A hex cell `'q,r'` or `[q, r]`. */
export type HexCellRef = string | readonly [number, number];

/** Environment: a preset plus overrides. */
export interface SceneEnv {
  /** Mood preset (default `'tavern'`). */
  preset?: EnvPreset;
  /** Particles (`null` = none). */
  particles?: 'snow' | 'embers' | null;
  /** Ambient loop (`null` = silence). */
  ambience?: Ambience | null;
  /** Tone-mapping exposure. */
  exposure?: number;
  /** Advanced: any other preset key (`bg`, `fog`, `lamp`, …) is merged over the preset. */
  [key: string]: unknown;
}

/** The table itself. */
export interface SceneTable {
  /** `'round'` for a round table. */
  shape?: 'rect' | 'round';
  /** Surface material. */
  surface?: TableSurface;
  /** Surface colour override. */
  color?: string;
  /** Asset used as the table top. */
  image?: string;
  /** Table size `[w, d]` in cm. */
  size?: Vec2;
  /** Corner rounding of a rectangular table: a fraction of the shorter half-side (default 0.35; 0 = square). */
  corner?: number;
  /** Colour of the wooden rim. */
  rim?: string;
}

/** A player's place at the table (name plate and coloured rail). */
export interface SceneSeat {
  /** Player id. */
  id: PlayerId;
  /** Name on the plate. */
  name?: string;
  /** Rail and plate colour. */
  color?: string;
  /** The active seat glows. */
  active?: boolean;
  /** This is the viewing player (otherwise matched by id). */
  me?: boolean;
  /** Second line on the plate. */
  sub?: string;
}

/** A track cell description. */
export interface TrackCell {
  /** Text in the cell. */
  label?: string | number;
  /** Fill colour. */
  fill?: string;
  /** Text colour. */
  ink?: string;
  /** Slot outline colour. */
  color?: string;
}

/** A place where objects are arranged. */
export interface Zone {
  /** Unique zone id. */
  id: string;
  /** Seat zone: positions are in this player's local frame. */
  seat?: PlayerId;
  /** Centre `[x, z]` (cm). */
  at?: Vec2;
  /** Rotation in degrees. */
  rot?: number;
  /** How objects are arranged (default `'row'`). */
  layout?: ZoneLayout;
  /** Gap between objects (cm). */
  gap?: number;
  /** Columns (`grid`). */
  cols?: number;
  /** Alignment within the zone. */
  align?: 'center' | 'start' | 'end';
  /** Dashed empty places, filled in order. */
  slots?: number;
  /** Slot size: a card size name or `[w, d]`. */
  slot?: CardSizeName | Vec2;
  /** Slot outline colour. */
  slotColor?: string;
  /** Track cells: a count or a description per cell. */
  cells?: number | TrackCell[];
  /** Track direction `[dx, dz]`. */
  to?: Vec2;
  /** Track cell spacing (cm). */
  spacing?: number;
  /** Track path `[[x, z], …]`. */
  path?: Vec2[];
  /** `false` hides the dashed track cells. */
  marks?: boolean;
  /** Hex radius centre → corner (cm) of a `hex` zone. */
  hex?: number;
  /** Alias of `hex`. */
  hexSize?: number;
  /** Hex orientation. */
  orient?: 'pointy' | 'flat';
  /** Fan arc radius (cm, `fan`; default 28). */
  radius?: number;
  /** Degrees between fanned cards (`fan`; default 7, the whole fan stays within 60°). */
  spread?: number;
  /** A mat under the zone. */
  mat?: boolean | { color?: string; border?: string; image?: string };
  /** Mat size `[w, d]`. */
  size?: Vec2;
  /** Printed on the table and used as the Spotlight caption ("→ Market"). */
  label?: string;
  /** Label text size. */
  labelSize?: number;
  /** Label colour. */
  labelColor?: string;
  /** Mat padding (cm). */
  pad?: number;
  /** Height above the table (cm); overrides the automatic lift onto a `board`. */
  y?: number;
}

/** Props shared by every scene object. */
export interface SceneObjectBase {
  /** Stable identity — the same physical piece keeps its id so it animates. */
  id: string;
  /** Zone it lives in. */
  zone?: string;
  /** Free position `[x, z]` (cm), in the seat's frame with `seat`. */
  at?: Vec2;
  /** Seat whose frame `at` uses. */
  seat?: PlayerId;
  /** Position in the zone (default: array order). */
  order?: number;
  /** Extra rotation in degrees. */
  rot?: number;
  /** Makes it clickable (glows, pulses) and sends that move. */
  click?: MoveIntent;
  /** Highlight (`true` or a colour). */
  glow?: boolean | string;
  /** Disables the click. */
  disabled?: boolean;
  /** Hover text. */
  tip?: string;
  /** Floating label. */
  label?: string | number;
  /** Floating label background. */
  labelColor?: string;
  /** A new object flies in from this zone or object (cards drawn from a deck). */
  enterFrom?: string;
  /** Follow another object (markers). */
  anchor?: string;
  /** Offset `[dx, dz]` from the anchor. */
  offset?: Vec2;
  /** Sit on top of the anchor. */
  onTop?: boolean;
  /** Asset key for the object's art. */
  asset?: string;
  /** See-through placement preview. */
  ghost?: boolean;
  /** Hex cell (in a `hex` zone). */
  cell?: HexCellRef;
  /** Corner 0..5 of `cell`. */
  corner?: number;
  /** Side 0..5 of `cell`. */
  side?: number;
  /** Canonical corner key from `T.hex.corner`. */
  vertex?: string;
  /** Canonical side key from `T.hex.edge`. */
  edge?: string;
}

/** A card. Opponents' cards: `faceUp: false` and no `face`. */
export interface CardObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'card';
  /** Card size. */
  size?: CardSizeName | Vec2;
  /** Front. */
  face?: Face;
  /** Back. */
  back?: Face;
  /** Default `true`. */
  faceUp?: boolean;
  /** Rotated 90°. */
  tapped?: boolean;
}

/** A pile of cards rendered as one object. */
export interface DeckObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'deck';
  /** Number of cards. */
  count?: number;
  /** Back. */
  back?: Face;
  /** Show the top card (`face`) — discard piles. */
  faceUp?: boolean;
  /** Top card. */
  face?: Face;
  /** Card size. */
  size?: CardSizeName | Vec2;
  /** Show the count label. */
  showCount?: boolean;
  /** Draw an empty deck's outline. */
  showEmpty?: boolean;
}

/** A die. Throw it with `ctx.roll(…, { id })`. */
export interface DieObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'die';
  /** 6 → a physical d6; other counts → a polyhedron; or a list of faces. */
  faces?: number | Array<Face | number>;
  /** Face index it shows. */
  value?: number;
  /** Body colour. */
  color?: string;
  /** Pip/text colour. */
  ink?: string;
  /** Edge length (cm, default 1.8). */
  size?: number;
}

/** A token: pawns, coins, cubes, meeples… */
export interface TokenObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'token';
  /** Shape (default `'disc'`). */
  shape?: TokenShape;
  /** Colour. */
  color?: string;
  /** Size (cm). */
  size?: number;
  /** One piece's height (cm): a coin's thickness in a stack, a pawn's or a house's height. */
  height?: number;
  /** Stack of this many (flat shapes and cubes). */
  count?: number;
  /** Maximum drawn stack height. */
  maxStack?: number;
  /** `false` hides the `×n` label. */
  showCount?: boolean;
  /** Top image/text. */
  face?: Face;
  /** Material. */
  material?: 'wood' | 'metal' | 'glass';
}

/** A board. */
export interface BoardObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'board';
  /** Size `[w, d]` (cm). */
  size?: Vec2;
  /** Art (an image fills it). */
  face?: Face;
  /** Thickness (cm). */
  thickness?: number;
}

/** An hourglass for sand timers. */
export interface TimerObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'timer';
  /** End time in host ms (`state.$deadline.at`). */
  endsAt?: number;
  /** Duration in seconds. */
  duration?: number;
  /** Height (cm). */
  size?: number;
}

/** Text printed on the table. */
export interface TextObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'text';
  /** The text. */
  text: string | number;
  /** Letter size (cm). */
  size?: number;
  /** Colour. */
  color?: string;
}

/** A hex tile in a `hex` zone. */
export interface HexObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'hex';
  /** Terrain preset (colour, height, decoration). */
  terrain?: Terrain;
  /** Colour override. */
  color?: string;
  /** Height override (cm). */
  height?: number;
  /** Drawn on its top. */
  face?: Face;
  /** `false` hides the terrain's props. */
  deco?: boolean;
}

/** One end of a link: an object id, a place in the zone, or `[x, z]`. */
export type LinkEnd = string | Vec2 | { cell?: HexCellRef; corner?: number; side?: number; vertex?: string; edge?: string; zone?: string; at?: Vec2 };

/** A road, route, rail or supply line between two ends. */
export interface LinkObject extends SceneObjectBase {
  /** Discriminator. */
  kind: 'link';
  /** Start. */
  from: LinkEnd;
  /** End. */
  to: LinkEnd;
  /** Colour. */
  color?: string;
  /** Width (cm, default 0.7). */
  width?: number;
  /** Thickness (cm). */
  thickness?: number;
  /** Line style. */
  style?: 'solid' | 'dashed' | 'dotted' | 'segments';
  /** Number of separate cars (train routes). */
  segments?: number;
  /** Shorthand for `style: 'dashed'`. */
  dashed?: boolean;
  /** Sideways shift (cm): parallel routes. */
  shift?: number;
  /** Lift (cm): air corridors. */
  raise?: number;
  /** Cut off each end (cm); default about half the piece at an object end, 0 at a place. */
  inset?: number;
  /** Glow in its own colour (default 0.12). */
  emissive?: number;
}

/** A scene object, discriminated by `kind`. */
export type SceneObject = CardObject | DeckObject | DieObject | TokenObject | BoardObject | TimerObject | TextObject | HexObject | LinkObject;

/** Every `SceneObject['kind']`. */
export type ObjectKind = SceneObject['kind'];

/** The 3D table: environment, seats, zones and objects. Units are centimetres. */
export interface Scene {
  /** Lighting, particles, ambience. */
  env?: SceneEnv;
  /** Table shape and surface. */
  table?: SceneTable;
  /** CSS font stacks used on card faces. */
  theme?: { font?: string; serif?: string };
  /** Sound overrides and additions: `{ name: assetKey | url }`. */
  sounds?: Record<string, string>;
  /** Players in turn order. */
  seats?: SceneSeat[];
  /** Zones. */
  zones?: Zone[];
  /** Objects. */
  objects?: SceneObject[];
  /** Initial camera. */
  camera?: { preset?: CameraPreset };
}

// ------------------------------------------------------------------ HUD & UI nodes

/** CSS `align-items` value for `row` / `col`. */
export type UiAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline' | 'flex-start' | 'flex-end' | (string & {});

/** Vertical stack. */
export interface UiCol { /** Discriminator. */ type: 'col'; /** Children. */ children?: UiNode[]; /** Gap (px). */ gap?: number; /** Cross-axis alignment. */ align?: UiAlign }
/** Horizontal row (wraps unless `wrap: false`). */
export interface UiRow { /** Discriminator. */ type: 'row'; /** Children. */ children?: UiNode[]; /** Gap (px). */ gap?: number; /** Cross-axis alignment. */ align?: UiAlign; /** `false` disables wrapping. */ wrap?: boolean }
/** Titled panel. */
export interface UiPanel { /** Discriminator. */ type: 'panel'; /** Title. */ title?: string; /** Accent colour (top border). */ accent?: string; /** Children. */ children?: UiNode[] }
/** Text. */
export interface UiText { /** Discriminator. */ type: 'text'; /** Text. */ text: string | number; /** Size. */ size?: 'sm' | 'md' | 'lg' | 'xl'; /** Bold. */ bold?: boolean; /** Muted. */ muted?: boolean; /** Colour. */ color?: string }
/** Badge. */
export interface UiBadge { /** Discriminator. */ type: 'badge'; /** Text. */ text: string | number; /** Background. */ bg?: string; /** Text colour. */ color?: string }
/** Divider line. */
export interface UiDivider { /** Discriminator. */ type: 'divider' }
/** Button that sends a move. */
export interface UiButton { /** Discriminator. */ type: 'button'; /** Label. */ label: string; /** Move sent on click. */ move?: MoveIntent; /** Style. */ variant?: 'primary' | 'ghost' | 'danger'; /** Disabled. */ disabled?: boolean }
/** A form field. */
export interface UiFormField {
  /** Key of the value in the submitted `args` (always a string, also for `number`; missing when left empty). */
  id: string;
  /** Label. */
  label?: string;
  /** Input kind (default text). */
  kind?: 'select' | 'number' | 'text';
  /** Options of a `select`. */
  options?: Array<{ value: string | number; label: string }>;
  /** Minimum (`number`). */
  min?: number;
  /** Maximum (`number`). */
  max?: number;
  /** Placeholder. */
  placeholder?: string;
}
/** Form; values are merged into the submitted move's `args` as strings (they override fixed args with the same key). */
export interface UiForm { /** Discriminator. */ type: 'form'; /** Fields. */ fields: UiFormField[]; /** Submit button and its move (a name or `{ name, args }`). */ submit: { label?: string; move: string | MoveIntent } }
/** Score chips. */
export interface UiScores { /** Discriminator. */ type: 'scores'; /** Chips. */ items: Array<{ label: string; value: string | number; color?: string }> }
/** Log lines. */
export interface UiLog { /** Discriminator. */ type: 'log'; /** Lines. */ entries: string[] }
/** A grid cell. */
export interface UiGridCell { /** Label. */ label?: string | number; /** Second line. */ sub?: string; /** Background. */ bg?: string; /** Text colour. */ color?: string; /** Border colour. */ border?: string; /** Corner badge. */ badge?: string | number; /** Faded. */ faded?: boolean; /** Move on click. */ move?: MoveIntent; /** Disabled. */ disabled?: boolean }
/** Grid of clickable cells. */
export interface UiGrid { /** Discriminator. */ type: 'grid'; /** Columns (default 5). */ cols?: number; /** Minimum cell height (px). */ cellHeight?: number; /** Cells. */ cells: UiGridCell[] }
/** A 2D card. */
export interface UiCard { /** Title. */ title?: string; /** Text. */ text?: string; /** Footer. */ footer?: string; /** Background. */ bg?: string; /** Text colour. */ color?: string; /** Selected. */ selected?: boolean; /** Move on click. */ move?: MoveIntent; /** Disabled. */ disabled?: boolean }
/** Row of 2D cards. */
export interface UiCards { /** Discriminator. */ type: 'cards'; /** Cards. */ cards: UiCard[] }

/** A declarative 2D UI node (prompt, panels, or a whole 2D view), discriminated by `type`. */
export type UiNode = UiCol | UiRow | UiPanel | UiText | UiBadge | UiDivider | UiButton | UiForm | UiScores | UiLog | UiGrid | UiCards;

/** Every `UiNode['type']`. */
export type UiNodeType = UiNode['type'];

/** A stat on a player card. */
export interface HudStat {
  /** Label (also the icon fallback). */
  label: string;
  /** Value. */
  value: string | number;
  /** Colour. */
  color?: string;
  /** Always visible. */
  key?: boolean;
  /** Icon shown instead of the label. */
  icon?: string;
  /** Hover title. */
  title?: string;
}

/** One player card in the HUD. */
export interface HudPlayer {
  /** Player id. */
  id: PlayerId;
  /** Name. */
  name?: string;
  /** Colour. */
  color?: string;
  /** Drives the turn indicator. */
  active?: boolean;
  /** The viewing player. */
  me?: boolean;
  /** Greyed out. */
  out?: boolean;
  /** Badges ("First player"). */
  badges?: string[];
  /** Stats. */
  stats?: HudStat[];
}

/** A collapsible side panel. */
export interface HudPanel {
  /** Panel id (remembers open/closed). */
  id: string;
  /** Title. */
  title: string;
  /** Icon glyph. */
  icon?: string;
  /** `'left'` stacks under the players; otherwise above the log. */
  side?: 'left' | 'right';
  /** Initially open. */
  open?: boolean;
  /** Content. */
  node: UiNode;
}

/** The 2D overlay: title, status, players, decision prompt, panels, log. */
export interface Hud {
  /** Title. */
  title?: string;
  /** Status line. */
  status?: string;
  /** Your turn (otherwise derived from `players[].active` + `me`). */
  myTurn?: boolean;
  /** Player cards. */
  players?: HudPlayer[];
  /** Decision dock content. */
  prompt?: UiNode | null;
  /** `'wait'` greys the dock while waiting for others. */
  promptTone?: 'wait' | (string & {});
  /** Dock title. */
  promptTitle?: string;
  /** Side panels. */
  panels?: HudPanel[];
  /** The last ~40 log lines. */
  log?: string[];
}

/** A 3D table view. */
export interface TabletopView {
  /** Discriminator. */
  type: 'tabletop';
  /** The 3D table. */
  scene: Scene;
  /** The 2D overlay. */
  hud?: Hud;
}

/** What `view()` returns: a 3D table, or 2D UI nodes on their own (quick prototypes). */
export type View = TabletopView | UiNode;

// ------------------------------------------------------------------ the module

/** A move: mutate and return the state, or return `{ error }` to reject. Don't throw. */
export type MoveHandler<S = any> = {
  /** (bivariant so a move may narrow `ctx.args` with `MoveCtx<{ … }>`) */
  bivarianceHack(state: S, ctx: MoveCtx): S | MoveError;
}['bivarianceHack'];

/** The moves of a game, by name. */
export type Moves<S = any> = Record<string, MoveHandler<S>>;

/** What `endIf` may return: a result to finish the game, or a falsy value while it runs. */
export type EndIfResult = EndResult | null | undefined | false;

/**
 * A game module: what a game file assigns to `module.exports`.
 * `S` is your state type, `C` the type of `options.content`.
 */
export interface GameModule<S = any, C = any> {
  /** Lobby info. */
  meta?: Meta;
  /** Initial state. */
  setup(ctx: SetupCtx<C>): S;
  /** Moves by name. */
  moves: Moves<S>;
  /** What one player sees: `{ type: 'tabletop', scene, hud }` or a 2D UI node. Hidden information lives here. */
  view(state: S, viewer: Viewer): View;
  /** `null` while the game runs, a result to finish it. */
  endIf?(state: S): EndIfResult;
  /** Every legal move for this player right now (powers bots and the referee). */
  actions?(state: S, viewer: Viewer): Action[];
  /** Optional heuristic bot: return one of `input.actions`. */
  bot?(state: S, input: BotInput): Action | null | undefined;
  /** Optional position score for this player (higher is better) — the balance lab's greedy bot. */
  score?(state: S, viewer: Viewer): number;
  /** Optional rule invariants: descriptions of broken rules (empty when fine). */
  invariants?(state: S): Array<string | null | undefined | false>;
}

/** Shorthand for annotating a single move in JS: `/** @type {import('tablecraft/game').Move<State, { card: string }>} *\/`. */
export type Move<S = any, Args = MoveArgs> = (state: S, ctx: MoveCtx<Args>) => S | MoveError;
