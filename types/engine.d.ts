// tablecraft/engine — the framework-free 3D table (three.js + cannon-es) that <Tabletop> is built on (docs/client.md).
// three.js objects are typed `any` so this file does not require @types/three.
import type {
  CameraPreset, CardSizeName, EnvPreset, Face, Fx, MoveIntent, ObjectKind, PlayerId, Scene, SceneObject, Terrain, Vec2,
} from './contract.js';
import type { Assets } from './client.js';

/** A card the Spotlight shows (derived from scene diffs or `reveal` fx). */
export interface SpotItem {
  /** Object id. */
  id: string;
  /** Object kind. */
  kind: ObjectKind;
  /** Why it is shown. */
  reason: 'enter' | 'move' | 'flip' | 'discard' | 'reveal';
  /** Front. */
  face?: Face;
  /** Back. */
  back?: Face;
  /** Card size. */
  size?: CardSizeName | Vec2;
  /** Shown face up. */
  faceUp: boolean;
  /** Zone it came from. */
  fromZone?: string | null;
  /** Zone it went to. */
  toZone?: string | null;
  /** Seat it came from. */
  fromSeat?: PlayerId | null;
  /** Seat it went to. */
  toSeat?: PlayerId | null;
  /** Label of the target zone. */
  zoneLabel?: string | null;
}

/** Events the world reports to its host UI; unhandled fx (banner, toast…) are forwarded as they are. */
export type WorldEvent =
  | { /** Cards to put on the Spotlight. */ type: 'spot'; items: SpotItem[]; by?: PlayerId | null; title?: string | null; text?: string | null; explicit?: boolean }
  | { /** The first scene is on screen. */ type: 'ready' }
  | { /** Thrown dice settled. */ type: 'rolled'; by: PlayerId | null; values: string[] }
  | Fx;

/** What the pointer is over (`null` when nothing). */
export interface HoverInfo {
  /** Object id. */
  id: string;
  /** The object's scene spec. */
  spec: SceneObject;
  /** Pointer x in canvas pixels. */
  x?: number;
  /** Pointer y in canvas pixels. */
  y?: number;
  /** Clicked (not just hovered) a non-clickable object. */
  pinned?: boolean;
}

/** Options of `new TabletopWorld(canvas, opts)`. */
export interface TabletopWorldOptions {
  /** Sound engine. */
  audio?: TableAudio;
  /** A clickable object was clicked → its `click` intent. */
  onMove?: (intent: MoveIntent) => void;
  /** Hover changes. */
  onHover?: (hover: HoverInfo | null) => void;
  /** Spotlight, dice and forwarded fx events. */
  onEvent?: (event: WorldEvent) => void;
  /** Suffix after the viewing player's name plate (default `' (you)'`). */
  youLabel?: () => string;
}

/** HUD-covered margins in px; the table is framed into the rest. */
export interface Insets {
  /** Top. */ top: number;
  /** Bottom. */ bottom: number;
  /** Left. */ left: number;
  /** Right. */ right: number;
}

/** The three.js table: layout, animation, physics dice, camera — bring your own UI. */
export declare class TabletopWorld {
  /** Create the world on a canvas (sized to its parent). */
  constructor(canvas: HTMLCanvasElement, opts?: TabletopWorldOptions);
  /** The canvas. */
  canvas: HTMLCanvasElement;
  /** three.js `WebGLRenderer`. */
  renderer: any;
  /** three.js `Scene`. */
  scene: any;
  /** three.js `PerspectiveCamera`. */
  camera: any;
  /** Face texture store. */
  store: FaceStore;
  /** Animation duration multiplier. */
  animScale: number;
  /** Re-measure the canvas. */
  resize(): void;
  /** Set the HUD-covered margins. */
  setInsets(insets?: Partial<Insets>): void;
  /** Set the asset map. */
  setAssets(map: Assets | null | undefined): void;
  /** Lay out and animate to a new scene (as seen by `youId`). */
  sync(scene: Scene, opts?: { youId?: PlayerId | null }): void;
  /** High-resolution card thumbnail for the Spotlight / log. */
  thumb(item: SpotItem | null | undefined, height?: number): HTMLCanvasElement | null;
  /** Briefly highlight objects. */
  flash(ids?: string[], color?: string, ms?: number): void;
  /** Animation speed multiplier (0.3–2.5). */
  setAnimScale(k: number): void;
  /** Graphics quality (`'low'` lowers pixel ratio and shadows, `'off'` disables shadows). */
  setQuality(quality: 'high' | 'low' | 'off' | (string & {})): void;
  /** Move the camera to a preset. */
  setCamera(preset?: CameraPreset, instant?: boolean, keepUser?: boolean): void;
  /** Look at an object or zone. */
  focusOn(ref: string): void;
  /** Play effects. */
  playFx(list?: Fx[]): void;
  /** Large preview of a card/deck (hover), or `null`. */
  preview(id: string): HTMLCanvasElement | null;
  /** Stop rendering and free GPU resources. */
  dispose(): void;
}

/** Procedural sounds and ambience (Web Audio). */
export declare class TableAudio {
  /** Create the audio engine (the context starts on the first user gesture). */
  constructor();
  /** Create/resume the audio context → it, or `null` without Web Audio. */
  ensure(): AudioContext | null;
  /** Mute or unmute. */
  setMuted(muted: boolean): void;
  /** Master volume 0..1. */
  setVolume(volume: number): void;
  /** Custom sounds `{ name: url }`. */
  setCustom(map: Record<string, string>): void;
  /** Play a sound. */
  play(name: string, opts?: { vol?: number }): void;
  /** Impact of a die or token. */
  impact(strength?: number, material?: 'dice' | (string & {})): void;
  /** Ambient loop (`null` = silence). */
  ambience(kind: string | null | undefined, force?: boolean): void;
  /** Close the audio context. */
  dispose(): void;
}

/** Where an object lands (world coordinates, cm). */
export interface ObjectPlacement {
  /** x. */ x: number;
  /** y (height). */ y: number;
  /** z. */ z: number;
  /** Rotation around y (radians). */ rotY?: number;
  /** Zone id. */ zone?: string | null;
  /** Seat id. */ seat?: PlayerId | null;
  /** Layout details (hex info, link length, …). */
  [key: string]: unknown;
}

/** The result of `layoutScene`. */
export interface SceneLayout {
  /** Object placements by id. */
  objects: Map<string, ObjectPlacement>;
  /** Zone geometry by id. */
  zones: Map<string, { zone: import('./contract.js').Zone; x: number; z: number; y: number; rotY: number; w: number; d: number; [key: string]: unknown }>;
  /** Seat geometry. */
  seats: Array<{ id: PlayerId; x: number; z: number; angle: number; R: number; [key: string]: unknown }>;
  /** Table radius. */
  tableR: number;
  /** Table half-width. */
  tableRx: number;
  /** Table half-depth. */
  tableRz: number;
  /** Outer radius. */
  R: number;
  /** Centre content radius. */
  centerR: number;
  /** Seat area inner radius. */
  seatInner: number;
  /** Seat area outer radius. */
  seatOuter: number;
  /** Index of the viewing seat. */
  me: number;
}

/** Lay out a scene (pure math, no three.js). */
export declare function layoutScene(scene: Scene, meId?: PlayerId | null): SceneLayout;
/** An object's footprint before rotation: `w` (x), `d` (z), `h` (y), in cm. */
export declare function footprint(obj: SceneObject, lay?: unknown): { w: number; d: number; h: number };
/** A card's `[w, h]` in cm. */
export declare function cardSize(obj: { size?: CardSizeName | Vec2 | (string & {}) }): [number, number];
/** Named card sizes in cm. */
export declare const CARD_SIZES: Record<CardSizeName, [number, number]>;
/** Terrain presets of hex tiles. */
export declare const TERRAIN: Record<Terrain, { color: string; height: number; deco?: string }>;
/** Default hex radius centre → corner (cm). */
export declare const HEX_SIZE: number;
/** Centre `[x, z]` of hex cell `(q, r)` for radius `s`. */
export declare function hexCenter(q: number, r: number, s: number, orient?: 'pointy' | 'flat'): [number, number];
/** Offset `[x, z]` of corner `c` from a cell centre. */
export declare function hexCorner(c: number, s: number, orient?: 'pointy' | 'flat'): [number, number];

/** What face drawing functions get. */
export interface FaceDrawContext {
  /** Asset map. */
  assets: Assets;
  /** UI font stack. */
  font?: string | null;
  /** Serif font stack. */
  serif?: string | null;
  /** Called when a late image arrives. */
  redraw?: () => void;
}

/** Texture kinds of the face store. */
export type FaceKind = 'card' | 'back' | 'token' | 'tokenSquare' | 'die' | 'hex' | 'board';

/** Canvas textures for faces, cached by content. */
export declare class FaceStore {
  /** Create a store (redraws everything once fonts arrive). */
  constructor();
  /** Asset map. */
  assets: Assets;
  /** UI font stack. */
  font: string | null;
  /** Serif font stack. */
  serif: string | null;
  /** Texture anisotropy. */
  anisotropy: number;
  /** Redraw every cached texture. */
  redrawAll(): void;
  /** Set the asset map. */
  setAssets(assets: Assets | null | undefined): void;
  /** A (cached, ref-counted) three.js `CanvasTexture` for a face. */
  texture(kind: FaceKind, spec: Face | null | undefined, w: number, h: number, opts?: Record<string, unknown>): any;
  /** Release a texture. */
  release(texture: any): void;
  /** A high-resolution canvas of a face (hover preview). */
  preview(kind: FaceKind, spec: Face | null | undefined, w: number, h: number): HTMLCanvasElement;
  /** Free every texture. */
  dispose(): void;
}

/** Draw a card front. */
export declare function drawCard(g: CanvasRenderingContext2D, W: number, H: number, face: Face | null | undefined, ctx: FaceDrawContext): void;
/** Draw a card back. */
export declare function drawBack(g: CanvasRenderingContext2D, W: number, H: number, face: Face | null | undefined, ctx: FaceDrawContext): void;
/** Fit wrapped text into a box, shrinking the font → the font size used. */
export declare function fitText(g: CanvasRenderingContext2D, text: unknown, x: number, y: number, w: number, h: number, opts?: {
  max?: number; min?: number; weight?: number | string; family?: string; color?: string; align?: CanvasTextAlign; italic?: boolean;
  lineH?: number; valign?: 'top' | 'middle' | 'bottom'; shadow?: string | null;
}): number;

/** Lighting presets (background, fog, lights, ambience, default surface). */
export declare const PRESETS: Record<EnvPreset, {
  bg: [string, string]; fog: string; hemi: [string, string, number]; key: [string, number]; lamp: [string, number]; env: number;
  fire: string | null; exposure: number; ambience: string | null; surface: string; particles?: string;
}>;

/** Resolves once the bundled fonts are loaded (`false` after `timeout` ms). */
export declare function fontsReady(timeout?: number): Promise<boolean>;
/** UI font stack (Inter). */
export declare const UI_FONT: string;
/** Serif font stack (Playfair Display). */
export declare const SERIF_FONT: string;
