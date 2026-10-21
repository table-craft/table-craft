// Scene layout: zones and objects (cm) -> world positions. Pure math (no three.js dependency).
// Coordinates: x = right, z = toward viewer (+), y = up. In seat zones (zone.seat) the same axes are
// relative to that player's view; "me" is always the seat nearest the camera, facing the table center.

export const CARD_SIZES = { poker: [6.3, 8.8], bridge: [5.7, 8.9], mini: [4.4, 6.8], tarot: [7, 12], square: [7, 7], large: [8.8, 12.6], domino: [4, 8] };
export const CARD_T = 0.035;
export const TOKEN_H = { disc: 0.38, coin: 0.25, square: 0.38, hex: 0.38, star: 0.45, cube: null, cylinder: null, pawn: null, meeple: null, gem: null, house: null };

// hex tiles: terrain presets (colour, height in cm, 3D decoration drawn on top)
export const TERRAIN = {
  plains: { color: '#b5cf72', height: 0.55 }, grass: { color: '#8fc25a', height: 0.55 },
  forest: { color: '#5d9142', height: 0.6, deco: 'forest' }, hills: { color: '#a3b86a', height: 0.8, deco: 'hills' },
  mountain: { color: '#b8b1a4', height: 1.4, deco: 'mountain' }, desert: { color: '#e8d394', height: 0.5 },
  snow: { color: '#eef2f5', height: 0.7 }, swamp: { color: '#6f8d63', height: 0.45 },
  wasteland: { color: '#9a8b74', height: 0.5, deco: 'rubble' }, city: { color: '#cdbb98', height: 0.6, deco: 'city' },
  water: { color: '#4d9fd4', height: 0.22, deco: 'water' }, sea: { color: '#3a87c4', height: 0.2, deco: 'water' },
};
export const HEX_SIZE = 5; // default hex radius (centre → corner, cm)
const SQ3 = Math.sqrt(3);

export function cardSize(o) {
  const s = Array.isArray(o.size) ? o.size : CARD_SIZES[o.size] || CARD_SIZES.poker;
  return [Number(s[0]) || 6.3, Number(s[1]) || 8.8];
}

export function tokenDims(o) {
  const s = Number(o.size) || (o.shape === 'cube' ? 1.2 : o.shape === 'pawn' || o.shape === 'meeple' ? 1.8 : o.shape === 'boat' ? 4 : 2.2);
  if (o.shape === 'boat') return { w: s, d: s * 0.45, unit: s * 0.9, h: s * 0.9, shown: Math.min(1, o.count == null ? 1 : o.count | 0), stackable: false };
  const flat = TOKEN_H[o.shape || 'disc'];
  const unit = flat != null ? (o.height || flat) : (o.height || ({ cube: s, cylinder: s * 0.9, pawn: s * 1.7, meeple: s * 1.1, gem: s * 0.9, house: s * 0.9 })[o.shape] || s);
  const stackable = flat != null || o.shape === 'cube';
  const count = Math.max(0, o.count == null ? 1 : o.count | 0);
  const shown = stackable ? Math.min(count, o.maxStack || 15) : Math.min(1, count);
  return { w: s, d: s, unit, h: unit * Math.max(1, shown), shown, stackable };
}

// object's footprint on the table (before rotation): w (x), d (z), h (y). `lay` (its layoutScene entry) gives hex tiles
// their grid size and links their length.
export function footprint(o, lay) {
  switch (o.kind) {
    case 'card': { const [w, d] = cardSize(o); return o.tapped ? { w: d, d: w, h: CARD_T } : { w, d, h: CARD_T }; }
    case 'deck': { const [w, d] = cardSize(o); return { w, d, h: Math.max(1, Math.min(o.count ?? 1, 120)) * CARD_T }; }
    case 'die': { const s = Number(o.size) || 1.8; return { w: s, d: s, h: s }; }
    case 'token': { const t = tokenDims(o); return { w: t.w, d: t.d, h: t.h }; }
    case 'board': { const s = o.size || [30, 20]; return { w: s[0], d: s[1], h: o.thickness || 0.4 }; }
    case 'timer': { const s = Number(o.size) || 6; return { w: s * 0.6, d: s * 0.6, h: s }; }
    case 'hex': { const s = (lay && lay.hex ? lay.hex.size : Number(o.size)) || HEX_SIZE; const flat = (lay && lay.hex ? lay.hex.orient : o.orient) === 'flat'; return { w: flat ? 2 * s : SQ3 * s, d: flat ? SQ3 * s : 2 * s, h: hexHeight(o) }; }
    case 'link': { const w = Number(o.width) || 0.7; return { w: (lay && lay.len) || 4, d: w, h: 0.3 }; }
    case 'text': { const s = Number(o.size) || 2; return { w: Math.max(2, String(o.text || '').length * s * 0.55), d: s * 1.2, h: 0.01 }; }
    default: return { w: 2, d: 2, h: 1 };
  }
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const rot2 = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)]; // same direction as three.js Y rotation
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- hex grid math (axial q, r; see T.hex)
export function hexHeight(o) { return o.ghost ? 0.06 : Number(o.height ?? TERRAIN[o.terrain]?.height ?? 0.5); }
const cellOf = (c) => (Array.isArray(c) ? [Number(c[0]) | 0, Number(c[1]) | 0] : String(c).split(',').slice(0, 2).map((x) => Number(x) | 0));
const m6 = (i) => (((i | 0) % 6) + 6) % 6;
const HEX_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export function hexCenter(q, r, s, orient) {
  return orient === 'flat' ? [1.5 * s * q, SQ3 * s * (r + q / 2)] : [SQ3 * s * (q + r / 2), 1.5 * s * r];
}
// corner c offset from the cell centre (clockwise from above; corner c starts side c)
export function hexCorner(c, s, orient) { const a = (60 * m6(c) + (orient === 'flat' ? 0 : -30)) * DEG; return [Math.cos(a) * s, Math.sin(a) * s]; }
// where an object sits in a hex zone: cell centre, a corner (vertex) or the middle of a side (edge)
// → { key, x, z, rot, cells } (cells: the cells it touches, to lift it onto the highest tile) or null
export function hexPlace(o, s, orient) {
  let cell = o.cell, corner = o.corner, side = o.side;
  if (o.vertex != null) { const p = String(o.vertex).split(','); cell = p.slice(0, 2).join(','); corner = Number(p[2]) | 0; }
  if (o.edge != null) { const p = String(o.edge).split(','); cell = p.slice(0, 2).join(','); side = Number(p[2]) | 0; }
  if (cell == null) return null;
  const [q, r] = cellOf(cell);
  const [cx, cz] = hexCenter(q, r, s, orient);
  const nb = (i) => { const d = HEX_DIRS[m6(i)]; return `${q + d[0]},${r + d[1]}`; };
  if (corner != null && o.kind !== 'hex') {
    const [dx, dz] = hexCorner(corner, s, orient);
    return { key: `v${Math.round((cx + dx) * 100)}:${Math.round((cz + dz) * 100)}`, x: cx + dx, z: cz + dz, rot: 0, cells: [`${q},${r}`, nb(corner - 1), nb(corner)], at: 'corner' };
  }
  if (side != null && o.kind !== 'hex') {
    const [ax, az] = hexCorner(side, s, orient); const [bx, bz] = hexCorner(side + 1, s, orient);
    const x = cx + (ax + bx) / 2, z = cz + (az + bz) / 2;
    return { key: `e${Math.round(x * 100)}:${Math.round(z * 100)}`, x, z, rot: -Math.atan2(bz - az, bx - ax), cells: [`${q},${r}`, nb(side)], at: 'side' };
  }
  return { key: `c${q},${r}`, x: cx, z: cz, rot: 0, cells: [`${q},${r}`], at: 'cell' };
}

// zone-local positions of the objects in a zone
function layoutZone(zone, list) {
  const gap = zone.gap ?? 0.8;
  const out = new Map();
  const L = zone.layout || 'row';
  const fps = list.map((o) => footprint(o));
  const slotFp = zone.slot ? (Array.isArray(zone.slot) ? { w: zone.slot[0], d: zone.slot[1] } : (() => { const [w, d] = CARD_SIZES[zone.slot] || CARD_SIZES.poker; return { w, d }; })()) : null;
  const slots = zone.slots || 0;
  let bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const grow = (x, z, w, d) => {
    bounds = { minX: Math.min(bounds.minX, x - w / 2), maxX: Math.max(bounds.maxX, x + w / 2), minZ: Math.min(bounds.minZ, z - d / 2), maxZ: Math.max(bounds.maxZ, z + d / 2) };
  };
  const slotPos = [];
  const tops = new Map(); // hex zones: cell → height of its tile
  if (L === 'row' || L === 'column' || L === 'grid') {
    const n = Math.max(list.length, slots);
    const cols = L === 'row' ? n : L === 'column' ? 1 : Math.max(1, zone.cols || Math.ceil(Math.sqrt(n)));
    const cw = Math.max(slotFp?.w || 0, ...fps.map((f) => f.w), 0.1);
    const cd = Math.max(slotFp?.d || 0, ...fps.map((f) => f.d), 0.1);
    const rows = Math.ceil(n / cols) || 1;
    const totalW = cols * cw + (cols - 1) * gap;
    const totalD = rows * cd + (rows - 1) * gap;
    const align = zone.align || 'center';
    const x0 = align === 'start' ? cw / 2 : align === 'end' ? -totalW + cw / 2 : -totalW / 2 + cw / 2;
    const z0 = L === 'row' ? 0 : -totalD / 2 + cd / 2;
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = x0 + c * (cw + gap), z = z0 + r * (cd + gap);
      if (i < slots) slotPos.push({ x, z, w: slotFp?.w || cw, d: slotFp?.d || cd });
      if (i < list.length) { out.set(list[i].id, { x, y: 0, z, rot: 0 }); grow(x, z, fps[i].w, fps[i].d); } else grow(x, z, slotFp?.w || cw, slotFp?.d || cd);
    }
  } else if (L === 'stack' || L === 'pile') {
    let y = 0;
    list.forEach((o, i) => {
      const r = hashStr(o.id);
      const jx = L === 'pile' ? ((r % 100) / 100 - 0.5) * 1.6 : 0;
      const jz = L === 'pile' ? (((r >> 8) % 100) / 100 - 0.5) * 1.6 : 0;
      const jr = L === 'pile' ? (((r >> 16) % 100) / 100 - 0.5) * 30 * DEG : 0;
      out.set(o.id, { x: jx, y, z: jz, rot: jr });
      grow(jx, jz, fps[i].w, fps[i].d);
      y += fps[i].h;
    });
  } else if (L === 'fan') {
    const n = list.length;
    const step = Math.min(zone.spread ?? 7, 60 / Math.max(1, n)) * DEG;
    const radius = zone.radius ?? 28;
    list.forEach((o, i) => {
      const a = (i - (n - 1) / 2) * step;
      const x = Math.sin(a) * radius; const z = radius - Math.cos(a) * radius;
      out.set(o.id, { x, y: i * CARD_T * 1.2, z, rot: -a });
      grow(x, z, fps[i].w, fps[i].d);
    });
  } else if (L === 'track') {
    const cells = Array.isArray(zone.cells) ? zone.cells.length : (zone.cells || 10);
    const path = zone.path || null;
    const spacing = zone.spacing ?? 4;
    const to = zone.to || [(cells - 1) * spacing, 0];
    const cellAt = (k) => {
      if (path && path.length) return { x: path[Math.min(k, path.length - 1)][0], z: path[Math.min(k, path.length - 1)][1] };
      const t = cells > 1 ? k / (cells - 1) : 0;
      return { x: to[0] * t, z: to[1] * t };
    };
    for (let k = 0; k < cells; k++) { const c = cellAt(k); slotPos.push({ x: c.x, z: c.z, w: spacing * 0.8, d: spacing * 0.8, cell: k }); grow(c.x, c.z, spacing, spacing); }
    const used = new Map();
    list.forEach((o, i) => {
      const k = Math.max(0, Math.min(cells - 1, (o.order ?? o.cell ?? 0) | 0));
      const m = used.get(k) || 0; used.set(k, m + 1);
      const c = cellAt(k);
      out.set(o.id, { x: c.x + m * 0.7, y: 0, z: c.z + m * 0.7, rot: 0 });
      grow(c.x, c.z, fps[i].w, fps[i].d);
    });
  } else if (L === 'hex') {
    // tiles (kind 'hex') sit on their cell; everything else stands on the highest tile it touches. Several pieces on
    // the same cell / corner / side are spread in a small circle (in `order`).
    const s = Number(zone.hex) || Number(zone.hexSize) || HEX_SIZE; const orient = zone.orient === 'flat' ? 'flat' : 'pointy';
    for (const o of list) if (o.kind === 'hex' && o.cell != null) { const k = cellOf(o.cell).join(','); tops.set(k, Math.max(tops.get(k) || 0, hexHeight(o))); }
    const groups = new Map();
    list.forEach((o, i) => {
      const pl = hexPlace(o, s, orient);
      if (!pl) { const [x, z] = o.at || [0, 0]; out.set(o.id, { x, y: 0, z, rot: 0 }); grow(x, z, fps[i].w, fps[i].d); return; }
      if (o.kind === 'hex') {
        out.set(o.id, { x: pl.x, y: 0, z: pl.z, rot: 0, hex: { size: s, orient } });
        const f = footprint(o, { hex: { size: s, orient } }); grow(pl.x, pl.z, f.w, f.d); return;
      }
      if (!groups.has(pl.key)) groups.set(pl.key, { pl, items: [] });
      groups.get(pl.key).items.push(i);
    });
    for (const { pl, items } of groups.values()) {
      const y = Math.max(0, ...pl.cells.map((k) => tops.get(k) || 0));
      const n = items.length;
      const rad = n > 1 ? (pl.at === 'cell' ? s * 0.38 : s * 0.2) * Math.min(1, 0.55 + n * 0.15) : 0;
      items.forEach((i, k) => {
        const a = (k / n) * Math.PI * 2 + (n === 2 ? 0 : -Math.PI / 2);
        const x = pl.x + Math.cos(a) * rad, z = pl.z + Math.sin(a) * rad;
        out.set(list[i].id, { x, y, z, rot: pl.rot });
        grow(x, z, fps[i].w, fps[i].d);
      });
    }
  } else { // free
    list.forEach((o, i) => { const [x, z] = o.at || [0, 0]; out.set(o.id, { x, y: 0, z, rot: 0 }); grow(x, z, fps[i].w, fps[i].d); });
  }
  if (zone.size) { const [w, d] = zone.size; grow(0, 0, w, d); }
  return { pos: out, bounds, slotPos, tops };
}

// zone-local -> seat/center-local
function toParent(zone, x, z) {
  const a = (zone.rot || 0) * DEG;
  const [rx, rz] = rot2(x, z, a);
  const [ax, az] = zone.at || [0, 0];
  return [ax + rx, az + rz];
}

export function layoutScene(scene, meId) {
  const seats = (scene.seats || []).map((s) => ({ ...s }));
  let me = seats.findIndex((s) => s.me || (meId && s.id === meId));
  if (me < 0) me = 0;
  const zones = new Map((scene.zones || []).map((z) => [z.id, z]));
  const objs = scene.objects || [];
  const byZone = new Map();
  const free = [];
  const anchored = []; // anchor: markers anchored to another object (e.g. boat on a route) — placed after the target
  const links = []; // kind 'link': a road / route / line between two objects or hex places — placed last
  objs.forEach((o, i) => {
    if (o.kind === 'link') links.push(o);
    else if (o.anchor) anchored.push(o);
    else if (o.zone && zones.has(o.zone)) {
      if (!byZone.has(o.zone)) byZone.set(o.zone, []);
      byZone.get(o.zone).push({ o, i });
    } else free.push(o);
  });
  // zones on a board are raised to its surface (can also be set via zone.y)
  const boards = free.filter((o) => o.kind === 'board' && o.at);
  const elevOf = (z) => {
    if (z.y != null) return Number(z.y) || 0;
    const [zx, zz] = z.at || [0, 0];
    for (const b of boards) {
      if ((b.seat || null) !== (z.seat || null)) continue;
      const [w, d] = b.size || [30, 20];
      if (Math.abs(zx - b.at[0]) <= w / 2 && Math.abs(zz - b.at[1]) <= d / 2) return b.thickness || 0.4;
    }
    return 0;
  };
  const zl = new Map();
  for (const z of zones.values()) {
    const list = (byZone.get(z.id) || []).sort((a, b) => (a.o.order ?? a.i) - (b.o.order ?? b.i) || a.i - b.i).map((x) => x.o);
    zl.set(z.id, { ...layoutZone(z, list), elev: elevOf(z) });
  }
  // center content points (zone corners + free objects) and seat area (seat-local) bounds
  const pts = [];
  const seatExt = { minZ: 0, maxZ: 0, minX: 0, maxX: 0 };
  for (const z of zones.values()) {
    const { bounds } = zl.get(z.id);
    const corners = [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.minX, bounds.maxZ], [bounds.maxX, bounds.maxZ]].map(([x, zz]) => toParent(z, x, zz));
    if (z.seat != null) for (const [x, zz] of corners) { seatExt.minZ = Math.min(seatExt.minZ, zz); seatExt.maxZ = Math.max(seatExt.maxZ, zz); seatExt.minX = Math.min(seatExt.minX, x); seatExt.maxX = Math.max(seatExt.maxX, x); }
    else {
      // edges sampled too: a seat narrower than a big centre zone (a map) must still see it in front of it
      pts.push(...corners);
      const [a, b, c, d] = corners;
      for (const [p0, p1] of [[a, b], [c, d], [a, c], [b, d]]) {
        const n = Math.min(40, Math.floor(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 3));
        for (let k = 1; k < n; k++) pts.push([p0[0] + ((p1[0] - p0[0]) * k) / n, p0[1] + ((p1[1] - p0[1]) * k) / n]);
      }
    }
  }
  for (const o of free) {
    if (o.seat || !o.at) continue;
    const f = footprint(o);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push([o.at[0] + (dx * f.w) / 2, o.at[1] + (dz * f.d) / 2]);
  }
  // center content is shifted to the table center (disable with table.center === false)
  let sx = 0, sz = 0;
  if (pts.length && scene.table?.center !== false) {
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    sx = -(Math.min(...xs) + Math.max(...xs)) / 2; sz = -(Math.min(...zs) + Math.max(...zs)) / 2;
    for (const p of pts) { p[0] += sx; p[1] += sz; }
  }
  const centerR = Math.max(10, ...pts.map(([x, zz]) => Math.hypot(x, zz)));
  const n = Math.max(1, seats.length);
  const inner = -seatExt.minZ; const outer = Math.max(seatExt.maxZ, 3);
  const seatW = seatExt.maxX - seatExt.minX + 4;
  const chord = n > 2 ? seatW / (2 * Math.sin(Math.PI / n)) : 0;
  // each seat moves in up to the center content in its direction (by points within its side width)
  const seatGeo = seats.map((s, i) => {
    const th = Math.PI / 2 + ((i - me) * 2 * Math.PI) / n;
    const ux = Math.cos(th), uz = Math.sin(th);
    const tx = Math.sin(th), tz = -Math.cos(th); // seat's local +x axis (in world)
    let h = 0;
    for (const [x, zz] of pts) {
      const lat = x * tx + zz * tz;
      if (lat >= seatExt.minX - 3 && lat <= seatExt.maxX + 3) h = Math.max(h, x * ux + zz * uz);
    }
    const R = scene.table?.seatRadius || Math.max(h + inner + 5, inner + 10, chord);
    return { ...s, index: i, angle: th, R, x: ux * R, z: uz * R, rotY: Math.PI / 2 - th, isMe: i === me };
  });
  const seatById = new Map(seatGeo.map((s) => [s.id, s]));
  const toWorld = (seatId, x, z) => {
    const s = seatId != null ? seatById.get(seatId) : null;
    if (!s) return [x + sx, z + sz, 0];
    const [rx, rz] = rot2(x, z, s.rotY);
    return [s.x + rx, s.z + rz, s.rotY];
  };
  // table: rounded rectangle enclosing all content (or a circle if table.shape === 'round')
  let ax = 10, az = 10;
  for (const [x, zz] of pts) { ax = Math.max(ax, Math.abs(x)); az = Math.max(az, Math.abs(zz)); }
  for (const s of seatGeo) for (const [lx, lz] of [[seatExt.minX, seatExt.minZ], [seatExt.maxX, seatExt.minZ], [seatExt.minX, outer], [seatExt.maxX, outer]]) {
    const [wx, wz] = toWorld(s.id, lx, lz); ax = Math.max(ax, Math.abs(wx)); az = Math.max(az, Math.abs(wz));
  }
  const tableRx = scene.table?.size ? scene.table.size[0] / 2 : ax + 7;
  const tableRz = scene.table?.size ? scene.table.size[1] / 2 : az + 7;
  const tableR = scene.table?.radius || Math.hypot(ax, az) + 7;
  const out = new Map();
  for (const z of zones.values()) {
    const { pos, elev } = zl.get(z.id);
    for (const [id, p] of pos) {
      const [px, pz] = toParent(z, p.x, p.z);
      const [wx, wz, baseRot] = toWorld(z.seat, px, pz);
      out.set(id, { x: wx, y: p.y + elev, z: wz, rotY: baseRot + (z.rot || 0) * DEG + p.rot, zone: z.id, seat: z.seat, ...(p.hex ? { hex: p.hex } : {}) });
    }
  }
  for (const o of free) {
    const [x, zz] = o.at || [0, 0];
    const [wx, wz, baseRot] = toWorld(o.seat, x, zz);
    out.set(o.id, { x: wx, y: 0, z: wz, rotY: baseRot, zone: null, seat: o.seat });
  }
  // anchored objects: offset [dx, dz] from target position/heading (in target's local axes); onTop: on top of target
  for (let pass = 0; pass < 3; pass++) {
    for (const o of anchored) {
      if (out.has(o.id)) continue;
      const t = out.get(o.anchor);
      if (!t) continue;
      const tgt = objs.find((x) => x.id === o.anchor);
      const [dx, dz] = o.offset || [0, 0];
      const [rx, rz] = rot2(dx, dz, t.rotY);
      out.set(o.id, { x: t.x + rx, y: t.y + (o.onTop && tgt ? footprint(tgt).h : 0), z: t.z + rz, rotY: t.rotY, zone: t.zone, seat: t.seat, anchor: o.anchor });
    }
  }
  for (const o of objs) { const p = out.get(o.id); if (p && o.kind !== 'link') p.rotY += (o.rot || 0) * DEG; }
  // links: a straight piece from one end to the other, shortened so it does not run into the pieces it joins
  const byId = new Map(objs.map((o) => [o.id, o]));
  const endOf = (ref, link) => {
    if (typeof ref === 'string') {
      const p = out.get(ref); const t = byId.get(ref);
      if (!p || !t) return null;
      const f = footprint(t, p);
      return { x: p.x, y: p.y, z: p.z, inset: t.kind === 'hex' ? 0 : Math.min(f.w, f.d) * 0.45, seat: p.seat };
    }
    if (!ref || typeof ref !== 'object') return null;
    const zone = zones.get(ref.zone || link.zone);
    const spec = Array.isArray(ref) ? { at: ref } : ref;
    if (!zone) { const [x, zz] = spec.at || [0, 0]; const [wx, wz] = toWorld(link.seat, x, zz); return { x: wx, y: 0, z: wz, inset: 0 }; }
    let lx, lz, y = 0;
    const pl = zone.layout === 'hex' ? hexPlace({ ...spec, kind: 'point' }, Number(zone.hex) || Number(zone.hexSize) || HEX_SIZE, zone.orient === 'flat' ? 'flat' : 'pointy') : null;
    if (pl) { lx = pl.x; lz = pl.z; const tops = zl.get(zone.id).tops; y = Math.max(0, ...pl.cells.map((k) => tops.get(k) || 0)); } else [lx, lz] = spec.at || [0, 0];
    const [px, pz] = toParent(zone, lx, lz); const [wx, wz] = toWorld(zone.seat, px, pz);
    return { x: wx, y: y + zl.get(zone.id).elev, z: wz, inset: 0, seat: zone.seat };
  };
  for (const o of links) {
    const a = endOf(o.from, o), b = endOf(o.to, o);
    if (!a || !b) continue;
    const dx = b.x - a.x, dz = b.z - a.z; const dist = Math.hypot(dx, dz) || 0.001;
    const ia = o.inset ?? a.inset, ib = o.inset ?? b.inset;
    const len = Math.max(0.3, dist - ia - ib);
    const ux = dx / dist, uz = dz / dist; const mid = (ia + (dist - ib)) / 2;
    const y = (a.y + b.y) / 2;
    const sh = Number(o.shift) || 0; // sideways, to the left of from → to: parallel routes between the same places
    out.set(o.id, { x: a.x + ux * mid + uz * sh, y, z: a.z + uz * mid - ux * sh, rotY: -Math.atan2(dz, dx), len, pitch: Math.atan2(b.y - a.y, dist), zone: o.zone || null, seat: a.seat ?? b.seat ?? null });
  }
  // world info for zones (for drawing mats/labels/slots)
  const zoneWorld = new Map();
  for (const z of zones.values()) {
    const { bounds, slotPos, elev } = zl.get(z.id);
    const pad = z.pad ?? 1;
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const [px, pz] = toParent(z, cx, cz);
    const [wx, wz, baseRot] = toWorld(z.seat, px, pz);
    const rotY = baseRot + (z.rot || 0) * DEG;
    const slots = slotPos.map((sp) => { const [sx, sz] = toParent(z, sp.x, sp.z); const [x, zz] = toWorld(z.seat, sx, sz); return { ...sp, x, z: zz }; });
    const [ox, oz] = toWorld(z.seat, ...toParent(z, 0, 0));
    zoneWorld.set(z.id, { zone: z, x: wx, z: wz, y: elev, ox, oz, rotY, w: (bounds.maxX - bounds.minX) + pad * 2, d: (bounds.maxZ - bounds.minZ) + pad * 2, slots });
  }
  return { objects: out, zones: zoneWorld, seats: seatGeo, tableR, tableRx, tableRz, R: Math.max(...seatGeo.map((x) => x.R), centerR), centerR, seatInner: inner, seatOuter: outer, me };
}
