# Scene

`view()` returns `{ type: 'tabletop', scene, hud }`. The scene describes the physical table; Tablecraft lays it out,
turns it to face the viewing player and animates every change.

**Units are centimetres.** Axes: `x` → right, `z` → towards the viewer, `y` → up. The viewing player always sits at
the bottom of the screen; centre content is auto-centred and seats are placed around it.

```js
scene = {
  env:    { preset: 'tavern', particles: 'snow', ambience: 'fire', exposure: 1 },
  table:  { shape: 'rect', surface: 'felt', color, image, size: [w, d] },
  theme:  { font, serif },                     // CSS font stacks used on card faces
  sounds: { roll: 'my-dice-asset', chime: 'https://…/bell.mp3' },
  seats:  [{ id, name, color, active, me, sub }],
  zones:  [Zone, ...],
  objects:[Obj, ...],
  camera: { preset: 'table' },                 // initial camera: table | me | top | center
}
```

## Environment

| `env.preset` | Mood | Default surface | Ambience |
|---|---|---|---|
| `tavern` | warm lamp, fire glow | wood | fire |
| `winter` | cold light, snow | dark wood | wind + fire |
| `day` | bright, neutral | felt | — |
| `night` | dim, warm lamp | dark wood | — |
| `sea` | blue, airy | blue felt | sea |
| `forest` | green, warm | wood | fire |

Override parts with `particles: 'snow' | 'embers' | null`, `ambience: 'wind' | 'fire' | 'winter' | 'rain' | 'sea' | 'tavern' | null`
and `exposure`. `table.surface`: `wood`, `darkwood`, `felt`, `felt-blue`, `felt-red`, `stone`, `snow`, `leather`, `dark`;
`table.image` uses an asset as the table top; `table.shape: 'round'` makes a round table. `table.corner` rounds a
rectangular table's corners (a fraction of the shorter half-side, default `0.35`; `0` = square); `table.rim` is the
colour of the wooden rim.

## Seats

`seats` lists players in turn order: `{ id: playerId, name, color, active?, me?, sub? }`. Each seat gets a name plate
and a coloured rail; the active seat glows. `sub` is a second line on the plate ("Gold Fleet · 12 pts").

## Zones

A zone is a place where objects are arranged.

```js
{ id, seat?: playerId, at: [x, z], rot?: deg,
  layout: 'row' | 'column' | 'grid' | 'stack' | 'pile' | 'fan' | 'track' | 'hex' | 'free',
  gap: 0.8, cols, align: 'center' | 'start' | 'end',
  slots: n, slot: 'poker' | [w, d],                 // dashed empty places filled in order
  cells: n | [{ label, fill, ink, color }], to: [dx, dz], spacing: 4, path: [[x, z], ...],   // track
  hex: 5, orient: 'pointy' | 'flat',                                                 // hex map (see below)
  mat: true | { color, border, image }, size: [w, d], label, labelSize, pad }
```

| More zone props | |
|---|---|
| `slotColor` | outline colour of the dashed slots and track cells (default soft white) |
| `marks: false` | hides a `track`'s dashed cells (objects still use the cell positions) |
| track `cells[i].color` | outline colour of that one cell (over `slotColor`); `fill` and `ink` fill it and colour its text |
| `radius`, `spread` | `fan` only: arc radius (cm, default 28) and degrees between cards (default 7; the whole fan stays within 60°) |
| `hexSize` | alias of `hex` (cell radius in cm) |
| `labelColor` | colour of the printed zone `label` |
| `y` | height above the table (cm); overrides the automatic lift onto a `board` |

- **Seat zones** (`seat: playerId`) use that player's local frame: `x` is their right, `+z` is towards them. Typical
  seat layout: tableau row at `[0, -4]`, resources at `[0, 7]`, side column at `[-22, 0]`, hand `fan` at `[0, 6]`.
- Objects in a zone are ordered by `order` (or array order).
- `stack` piles exactly; `pile` adds natural jitter; `fan` is a hand; `track` places objects on cell `order`.
- `label` is printed on the table and used as the Spotlight caption ("→ Market").
- Zones on top of a `board` are lifted onto its surface automatically.

### Hex maps

A zone with `layout: 'hex'` is a hex grid. Tiles are `hex` objects; every other object in the zone is placed on a
cell, a corner or a side and stands on the highest tile it touches.

```js
zones: [{ id: 'map', layout: 'hex', at: [0, 0], hex: 5, orient: 'pointy' }],   // hex: radius centre → corner (cm)
objects: [
  { id: 'hex:0,0', kind: 'hex', zone: 'map', cell: '0,0', terrain: 'mountain', face: { title: 'C3 Morva' } },
  { id: 'army:7', kind: 'token', shape: 'meeple', zone: 'map', cell: '0,0' },                  // on a cell
  { id: 'city:b6', kind: 'token', shape: 'cylinder', zone: 'map', vertex: T.hex.corner('0,0', 2) },  // on a corner
  { id: 'wall:1', kind: 'token', shape: 'square', zone: 'map', edge: T.hex.edge('0,0', 1) },  // on a side
  { id: 'route:1', kind: 'link', from: 'city:b6', to: 'city:e4', color: '#d8453b', segments: 3 },
]
```

- Cells use axial coordinates `'q,r'` (or `[q, r]`). Pointy grids have rows, flat grids (`orient: 'flat'`) columns.
- Place an object with `cell`, plus `corner: 0..5` or `side: 0..5`, or with the canonical keys from the rules kit:
  `vertex: T.hex.corner(cell, c)` / `edge: T.hex.edge(cell, s)`. Corners and sides are numbered clockwise as seen from
  above; side `s` faces neighbour `T.hex.DIRS[s]`. Objects on a side are turned along it.
- Several objects on the same cell / corner / side are spread in a small circle (in `order`).
- Objects with `at` instead of a cell are placed freely in zone coordinates.

### hex

A hex tile: `cell`, `terrain`, `color`, `height` (cm), `face` (`title`, `text`, `icon`, `image`, `rotate`, `bg`, `ink`,
`tint`, `border` — drawn on its top). `rotate` turns only the image, in degrees clockwise seen from above (angles grow
from +x towards +z), e.g. to point a coastline at the sea; turning the tile itself with `rot` knocks it off the grid, `deco` (`false` hides the terrain's props), `ghost`. `click`, `glow` (an outline on its
top), `tip` and `label` work as on any object, so tiles are selectable places.

| `terrain` | Look |
|---|---|
| `plains` · `grass` · `desert` · `snow` · `swamp` | flat colour |
| `forest` · `hills` · `mountain` · `city` · `wasteland` | trees, hills, snowy peaks, houses, rubble around the edge |
| `water` · `sea` | low, blue, a ripple ring |

A tile without terrain is a plain coloured slab; `face.image` puts art on top.

### link

A road, route, rail or supply line drawn between two ends: `from`, `to` — an object id, or a place
`{ cell, corner?, side?, vertex?, edge?, zone? }` in the link's `zone` (or `[x, z]` there). It is shortened so it does
not run into the pieces it joins (`inset` overrides) and tilts when the ends stand at different heights.

`shift` moves it sideways (cm) — two routes between the same places side by side; `raise` lifts it (an air corridor).
`color`, `width` (0.7), `thickness`, `style: 'solid' | 'dashed' | 'dotted' | 'segments'` (`dashed: true` is short for
`style: 'dashed'`), `segments: n` (n separate cars, like a train route), `ghost` (see-through: an unclaimed route),
`emissive` (how much it glows in its own colour, default `0.12`), `inset` (cm cut off each end; by default about half
the piece at an object end and `0` at a place or a hex tile). Links are clickable like any object (an invisible
wider strip makes thin lines easy to hit).

### Placement previews

`ghost: true` on a token, tile or link draws it see-through — use it for "you can build here" spots together with
`click`, or to preview where a piece would land.

## Objects

Common props:

| Prop | |
|---|---|
| `id` | **stable identity** — the same physical piece keeps its id when it moves, so it animates |
| `kind` | `card` · `deck` · `die` · `token` · `board` · `timer` · `text` · `hex` · `link` |
| `zone` or `at: [x, z]` (+ `seat`) | where it lives (in a hex zone: `cell`, `corner`, `side`, `vertex`, `edge`) |
| `order`, `rot` | position in the zone, extra rotation in degrees |
| `click: { name, args }` | makes it clickable (glows, pulses) and sends that move |
| `glow: true \| color \| false`, `disabled` | highlight / disable the click |
| `tip` | hover text |
| `label`, `labelColor` | floating label (decks and stacks show their count automatically); `labelColor` is its background |
| `enterFrom: zoneId \| objId` | a new object flies in from there (cards drawn from a deck) |
| `anchor: objId`, `offset: [dx, dz]`, `onTop` | markers that follow another object (a ship next to its next port) |
| `asset` | asset key for the object's art (see [Art](#art)) |

### card

`size: 'poker' (6.3×8.8) | 'bridge' | 'mini' | 'tarot' | 'square' | 'large' | 'domino' | [w, h]`, `face`, `back`,
`faceUp` (default `true`), `tapped` (rotated 90°). Opponents' cards: `faceUp: false` and **no `face`**.

### deck

A pile of cards rendered as one object: `count`, `back`, `faceUp` + `face` (shows the top card — use for discard
piles), `size`, `showCount`, `showEmpty`.

### die

`faces: 6 | [Face | string, ...]` (6 faces → a physical d6; other counts → a polyhedron), `value: faceIndex`, `color`,
`ink`, `size` (1.8). Throw it with `ctx.roll(…, { id })`.

### token

`shape: 'disc' | 'coin' | 'square' | 'hex' | 'cube' | 'cylinder' | 'pawn' | 'meeple' | 'house' | 'star' | 'gem' | 'boat'`,
`color`, `size`, `count` (flat shapes and cubes stack up to `maxStack`, labelled `×n` unless `showCount: false`),
`face` (top image/text), `material: 'wood' | 'metal' | 'glass'`, `height` (cm: one piece's height — a coin's
thickness in a stack, a pawn's or a house's height). `boat` is a little sailing ship pointing to local +x.

### board

`size: [w, d]`, `face` (an image fills it), `thickness`.

### timer

An hourglass: `endsAt` (ms, from `state.$deadline.at`), `duration` (s), `size`. Ticks in the last five seconds.

### text

`text`, `size`, `color` — printed on the table.

## Faces

Cards, decks, tokens, dice and boards draw their faces from data:

```js
Face = 'Title' | {
  image: assetKey | URL,                 // art
  fit: 'art' | 'full',                   // framed card (default) or full-bleed image
  title, subtitle, text, flavor, footer,
  icon: '✦',                             // glyph used by the default illustration
  color, bg, ink, border,                // accent / paper / text / frame
  corners: { tl, tr, bl, br: 'text' | { text, sub, color, icon } },   // cost, points…
  chips: [{ label: '2 Wood', color, icon }],                          // requirements row
  align: 'left' | 'center', focus: 0..1, titleOnFull: false,
  pips: false,                           // dice: print '1'…'6' as a number instead of pips
}
```

## Art

Pass `assets: { key: url }` to the client (the room server sends `assets` from `createRoom`). Resolution order for an
object's art: `face.image` → `obj.asset` → an asset whose key equals the object `id`. Without art, Tablecraft draws a
calm default illustration from `title`, `color` and `icon`, so a prototype always looks finished — and real art drops
in later without changing the module.
