// 3D geometries and materials of table pieces (in cm).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CARD_T, cardSize, tokenDims, TERRAIN, HEX_SIZE, hexHeight } from './layout';
import { shade, hash } from './faces';
import { UI_FONT } from './fonts';

const geoCache = new Map();
const geo = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe6dfcc, roughness: 0.85 });
const PX_PER_CM = 84; // card texture resolution
const TEX_MAX = 800;

// rounded-corner card body: group 2 = front (+y), 3 = back (-y), 0 = edge. UVs oriented like BoxGeometry
// (front: v=1 at far edge; back: reads upright when flipped about X). top: top face + edge only (deck).
function roundedSlab(w, h, t, { back = true, base = -t / 2 } = {}) {
  const r = Math.min(w, h) * 0.055;
  const sh = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  sh.moveTo(x0 + r, y0); sh.lineTo(x0 + w - r, y0); sh.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  sh.lineTo(x0 + w, y0 + h - r); sh.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  sh.lineTo(x0 + r, y0 + h); sh.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
  const face = (up) => {
    const g = new THREE.ShapeGeometry(sh, 5).toNonIndexed();
    const pos = g.attributes.position; const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
    g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
    g.translate(0, up ? base + t : base, 0);
    return g;
  };
  // edge strip
  const pts = sh.getPoints(5);
  const P = [], N = [], U = [];
  let perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = a.distanceTo(b); if (len < 1e-6) continue;
    const nx = (b.y - a.y) / len, nz = (b.x - a.x) / len; // outward normal (with x, -y -> z mapping)
    const A = [a.x, -a.y], B = [b.x, -b.y];
    const quad = [[A, base], [B, base], [B, base + t], [A, base], [B, base + t], [A, base + t]];
    for (const [[x, z], y] of quad) { P.push(x, y, z); N.push(nx, 0, nz); U.push((perim + (x === A[0] && z === A[1] ? 0 : len)) / (w + h), (y - base) / t); }
    perim += len;
  }
  const side = new THREE.BufferGeometry();
  side.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  side.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  side.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const parts = back ? [face(true), face(false), side] : [face(true), side];
  const g = mergeGeometries(parts, true);
  const idx = back ? [2, 3, 0] : [2, 0];
  g.groups.forEach((gr, i) => { gr.materialIndex = idx[i]; });
  g.computeBoundingSphere();
  return g;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let deckSideTex = null;
function deckSide() {
  if (!deckSideTex) {
    deckSideTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#ede6d3'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 3) { g.fillStyle = y % 6 ? 'rgba(0,0,0,.07)' : 'rgba(0,0,0,.14)'; g.fillRect(0, y, w, 1); }
    });
    deckSideTex.wrapT = THREE.RepeatWrapping;
  }
  return deckSideTex;
}

export function texSize(o) {
  const [w, h] = cardSize(o);
  const s = Math.min(PX_PER_CM, TEX_MAX / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

// ---------------------------------------------------------------- card
// BoxGeometry faces: +x,-x,+y(front),-y(back),+z,-z. Back face reads upright when flipped about X.
export function makeCard(o, store) {
  const [w, h] = cardSize(o);
  const g = geo(`card:${w}:${h}`, () => roundedSlab(w, h, CARD_T));
  const [tw, th] = texSize(o);
  // lightly lacquered cardboard: soft reflections
  const cardMat = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.42, envMapIntensity: 1 });
  const front = cardMat(store.texture('card', o.face || {}, tw, th));
  const back = cardMat(store.texture('back', o.back || {}, tw, th));
  const m = new THREE.Mesh(g, [edgeMat, edgeMat, front, back]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.faceKeys = [JSON.stringify(o.face || {}), JSON.stringify(o.back || {})];
  return m;
}
export function updateCardFaces(m, o, store) {
  const keys = [JSON.stringify(o.face || {}), JSON.stringify(o.back || {})];
  const [tw, th] = texSize(o);
  if (keys[0] !== m.userData.faceKeys[0]) { store.release(m.material[2].map); m.material[2].map = store.texture('card', o.face || {}, tw, th); m.material[2].needsUpdate = true; }
  if (keys[1] !== m.userData.faceKeys[1]) { store.release(m.material[3].map); m.material[3].map = store.texture('back', o.back || {}, tw, th); m.material[3].needsUpdate = true; }
  m.userData.faceKeys = keys;
}

// ---------------------------------------------------------------- deck (card stack)
export function makeDeck(o, store) {
  const [w, h] = cardSize(o);
  const g = geo(`deck:${w}:${h}`, () => roundedSlab(w, h, 1, { back: false, base: 0 }));
  const [tw, th] = texSize(o);
  const top = new THREE.MeshPhysicalMaterial({ map: o.faceUp ? store.texture('card', o.face || {}, tw, th) : store.texture('back', o.back || {}, tw, th), roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 1 });
  const side = new THREE.MeshStandardMaterial({ map: deckSide(), roughness: 0.95 });
  const m = new THREE.Mesh(g, [side, side, top, side]);
  m.castShadow = true; m.receiveShadow = true;
  m.userData.topKey = JSON.stringify([o.faceUp, o.face, o.back]);
  setDeckCount(m, o);
  return m;
}
export function setDeckCount(m, o) {
  const n = Math.max(0, Math.min(o.count ?? 1, 120));
  m.visible = n > 0 || o.showEmpty;
  m.scale.y = Math.max(1, n) * CARD_T;
}
export function updateDeckTop(m, o, store) {
  const key = JSON.stringify([o.faceUp, o.face, o.back]);
  if (key === m.userData.topKey) return;
  const [tw, th] = texSize(o);
  store.release(m.material[2].map);
  m.material[2].map = o.faceUp ? store.texture('card', o.face || {}, tw, th) : store.texture('back', o.back || {}, tw, th);
  m.material[2].needsUpdate = true;
  m.userData.topKey = key;
}

// ---------------------------------------------------------------- die
export function dieFaces(o) {
  const f = o.faces;
  if (Array.isArray(f)) return f.map((x) => (typeof x === 'object' ? x : { text: String(x) }));
  const n = Number(f) || 6;
  return Array.from({ length: n }, (_, i) => ({ text: String(i + 1) }));
}
export function makeDie(o, store) {
  const s = Number(o.size) || 1.8;
  const faces = dieFaces(o);
  const color = o.color || '#f4f1ea';
  let m;
  if (faces.length === 6) {
    const g = geo(`die:${s}`, () => new THREE.BoxGeometry(s, s, s));
    const mats = faces.map((f) => new THREE.MeshStandardMaterial({ map: store.texture('die', f, 128, 128, { color, ink: o.ink || '#1f2328' }), roughness: 0.45 }));
    m = new THREE.Mesh(g, mats);
    m.userData.perm = [0, 1, 2, 3, 4, 5]; // physical face -> value index
  } else {
    const n = faces.length;
    const make = n <= 4 ? () => new THREE.TetrahedronGeometry(s * 0.75) : n <= 8 ? () => new THREE.OctahedronGeometry(s * 0.7) : n <= 12 ? () => new THREE.DodecahedronGeometry(s * 0.7) : () => new THREE.IcosahedronGeometry(s * 0.7);
    m = new THREE.Mesh(geo(`poly:${n}:${s}`, make), new THREE.MeshStandardMaterial({ color, roughness: 0.4, flatShading: true }));
  }
  m.castShadow = true; m.receiveShadow = true;
  m.userData.faces = faces;
  return m;
}
// local normals in BoxGeometry face order
export const DIE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((v) => new THREE.Vector3(...v));
// die quaternion showing the wanted value on top (rest pose)
export function dieRestQuat(m, value, yaw = 0) {
  const perm = m.userData.perm;
  let slot = perm ? perm.indexOf(value) : 2;
  if (slot < 0) slot = 2;
  const q = new THREE.Quaternion().setFromUnitVectors(DIE_NORMALS[slot], new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}
// swaps materials so the physical top face shows `value`
export function assignDieTop(m, topSlot, value) {
  const perm = m.userData.perm;
  if (!perm) return;
  const cur = perm.indexOf(value);
  if (cur === topSlot || cur < 0) return;
  [perm[cur], perm[topSlot]] = [perm[topSlot], perm[cur]];
  const mats = m.material.slice();
  [mats[cur], mats[topSlot]] = [mats[topSlot], mats[cur]];
  m.material = mats;
}
export function topSlotOf(quat) {
  const up = new THREE.Vector3(0, 1, 0);
  let best = 0, bd = -2;
  DIE_NORMALS.forEach((n, i) => { const d = n.clone().applyQuaternion(quat).dot(up); if (d > bd) { bd = d; best = i; } });
  return best;
}

// ---------------------------------------------------------------- tokens
function latheGeo(points, seg = 28) { return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg); }
// flat: shape lies on the table (star); otherwise stands upright (meeple, house)
function shapeGeo(pts, depth, flat = true) {
  const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: depth * 0.1, bevelSegments: 2 });
  if (flat) g.rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  const bb = g.boundingBox; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  return g;
}
function tokenUnitGeo(shape, s, unit) {
  switch (shape) {
    case 'square': return geo(`sq:${s}:${unit}`, () => { const b = new THREE.BoxGeometry(s, unit, s); b.translate(0, unit / 2, 0); return b; });
    case 'cube': return geo(`cube:${s}`, () => { const b = new THREE.BoxGeometry(s, s, s); b.translate(0, s / 2, 0); return b; });
    case 'hex': return geo(`hex:${s}:${unit}`, () => { const c = new THREE.CylinderGeometry(s / 2, s / 2, unit, 6); c.translate(0, unit / 2, 0); return c; });
    case 'cylinder': return geo(`cyl:${s}:${unit}`, () => { const c = new THREE.CylinderGeometry(s * 0.4, s * 0.4, unit, 28); c.translate(0, unit / 2, 0); return c; });
    case 'pawn': return geo(`pawn:${s}`, () => latheGeo([[0, 0], [s * 0.45, 0], [s * 0.45, s * 0.12], [s * 0.3, s * 0.2], [s * 0.18, s * 0.75], [s * 0.3, s * 0.85], [s * 0.12, s * 0.95], [s * 0.26, s * 1.15], [s * 0.26, s * 1.35], [s * 0.12, s * 1.55], [0, s * 1.6]]));
    case 'meeple': return geo(`meeple:${s}`, () => shapeGeo([[-0.5, 0], [-0.15, 0], [0, 0.25], [0.15, 0], [0.5, 0], [0.33, 0.45], [0.55, 0.62], [0.5, 0.72], [0.18, 0.7], [0.22, 0.86], [0.12, 1.0], [-0.12, 1.0], [-0.22, 0.86], [-0.18, 0.7], [-0.5, 0.72], [-0.55, 0.62], [-0.33, 0.45]].map(([x, y]) => [x * s, y * s]), s * 0.35, false));
    case 'house': return geo(`house:${s}`, () => shapeGeo([[-0.5, 0], [0.5, 0], [0.5, 0.55], [0, 0.95], [-0.5, 0.55]].map(([x, y]) => [x * s, y * s]), s * 0.6, false));
    case 'star': return geo(`star:${s}:${unit}`, () => { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.22 : s * 0.5; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return shapeGeo(pts, unit); });
    case 'gem': return geo(`gem:${s}`, () => { const g = new THREE.OctahedronGeometry(s * 0.5); g.scale(1, 1.2, 1); g.translate(0, s * 0.6, 0); return g; });
    case 'coin':
    case 'disc':
    default: return geo(`disc:${s}:${unit}`, () => { const c = new THREE.CylinderGeometry(s / 2, s / 2, unit, 40); c.translate(0, unit / 2, 0); return c; });
  }
}

// boat marker (route/position cursor): hull, bow, cabin, mast, sail and player-colored stripe + pennant
function makeBoat(s, color) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a4b2a, roughness: 0.7 });
  const team = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.5 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.9, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(s * 0.72, s * 0.22, s * 0.36), wood); hull.position.set(-s * 0.06, s * 0.11, 0); g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(s * 0.2, s * 0.32, 4), wood);
  bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.scale.set(1, 1, 0.9); bow.position.set(s * 0.45, s * 0.11, 0); g.add(bow);
  const band = new THREE.Mesh(new THREE.BoxGeometry(s * 0.74, s * 0.05, s * 0.38), team); band.position.set(-s * 0.06, s * 0.2, 0); g.add(band);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(s * 0.22, s * 0.16, s * 0.24), cloth); cabin.position.set(-s * 0.22, s * 0.3, 0); g.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.018, s * 0.018, s * 0.75, 8), wood); mast.position.set(s * 0.05, s * 0.55, 0); g.add(mast);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(s * 0.34, 0); sh.lineTo(0, s * 0.55); sh.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), cloth); sail.position.set(s * 0.07, s * 0.3, 0); g.add(sail);
  const fl = new THREE.Shape(); fl.moveTo(0, 0); fl.lineTo(-s * 0.16, -s * 0.05); fl.lineTo(0, -s * 0.1); fl.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(fl), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide }));
  flag.position.set(s * 0.04, s * 0.92, 0); g.add(flag);
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return g;
}

// group of `count` stacked tokens (flat shapes stacked, others as one piece)
export function makeToken(o, store) {
  const group = new THREE.Group();
  group.userData.kind = 'token';
  rebuildToken(group, o, store);
  return group;
}
export function rebuildToken(group, o, store) {
  const shape = o.shape || 'disc';
  const t = tokenDims(o);
  const key = JSON.stringify([shape, o.size, o.color, o.face, o.height, o.material]);
  if (group.userData.key !== key) {
    group.children.slice().forEach((c) => { group.remove(c); });
    group.userData.unitTemplate = null;
    group.userData.key = key;
  }
  const color = o.color || '#8a8f94';
  if (shape === 'boat') {
    if (!group.children.length) { const b = makeBoat(t.w, color); b.traverse((c) => { c.userData.pickId = group.userData.pickId; }); group.add(b); }
    group.userData.count = 1;
    return { added: [], removed: [], unit: t.unit };
  }
  if (!group.userData.unitTemplate) {
    const g = tokenUnitGeo(shape, t.w, t.unit);
    const metal = o.material === 'metal' || shape === 'coin';
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(color, -0.12)), roughness: metal ? 0.3 : o.material === 'glass' ? 0.1 : 0.6, metalness: metal ? 0.7 : 0, transparent: o.material === 'glass', opacity: o.material === 'glass' ? 0.8 : 1 });
    let mats = side;
    if (o.face && (shape === 'disc' || shape === 'coin' || shape === 'hex' || shape === 'cylinder')) {
      const top = new THREE.MeshStandardMaterial({ map: store.texture('token', o.face, 256, 256, { color }), roughness: metal ? 0.35 : 0.6, metalness: metal ? 0.5 : 0 });
      mats = [side, top, side];
    } else if (o.face && (shape === 'square' || shape === 'cube')) {
      const top = new THREE.MeshStandardMaterial({ map: store.texture('tokenSquare', o.face, 256, 256, { color }), roughness: 0.6 });
      mats = shape === 'cube' ? [top, top, top, top, top, top] : [side, side, top, side, side, side];
    }
    group.userData.unitTemplate = { g, mats };
  }
  const { g, mats } = group.userData.unitTemplate;
  const want = t.shown;
  const cur = group.children.length;
  const added = [];
  for (let i = cur; i < want; i++) {
    const m = new THREE.Mesh(g, mats);
    m.castShadow = true; m.receiveShadow = true;
    const r = (i * 2654435761) >>> 0;
    m.position.set(t.stackable ? ((r % 100) / 100 - 0.5) * 0.12 : 0, t.stackable ? i * t.unit : 0, t.stackable ? (((r >> 8) % 100) / 100 - 0.5) * 0.12 : 0);
    m.rotation.y = t.stackable ? (((r >> 16) % 100) / 100) * Math.PI : 0;
    m.userData.pickId = group.userData.pickId;
    group.add(m);
    added.push(m);
  }
  const removed = [];
  for (let i = cur - 1; i >= want; i--) { removed.push(group.children[i]); }
  group.userData.count = o.count == null ? 1 : o.count;
  return { added, removed, unit: t.unit };
}

// ---------------------------------------------------------------- board
export function makeBoard(o, store) {
  const [w, d] = o.size || [30, 20];
  const th = o.thickness || 0.4;
  const g = geo(`board:${w}:${d}:${th}`, () => { const b = new THREE.BoxGeometry(w, th, d); b.translate(0, th / 2, 0); return b; });
  const s = Math.min(1600 / Math.max(w, d), 48);
  const top = new THREE.MeshStandardMaterial({ map: store.texture('board', o.face || {}, Math.round(w * s), Math.round(d * s)), roughness: 0.75 });
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(o.face?.color || '#3b3f45', -0.3)), roughness: 0.8 });
  const m = new THREE.Mesh(g, [side, side, top, side, side, side]);
  m.receiveShadow = true; m.castShadow = true;
  m.userData.faceKey = JSON.stringify(o.face || {});
  return m;
}

// ---------------------------------------------------------------- hex tile (prism; top face textured)
// hexPrism: bevelled prism from y=0 to y=h, corners clockwise from above like layout.hexCorner. Group 0 = top/bottom
// (UV = position in the tile's bounding square, see drawHexTop), group 1 = sides.
function hexPrism(s, h, orient) {
  return geo(`hexp:${s.toFixed(3)}:${h.toFixed(3)}:${orient}`, () => {
    const b = Math.min(0.12, h * 0.25, s * 0.03);
    const sh = new THREE.Shape();
    for (let c = 0; c < 6; c++) {
      const a = ((60 * c + (orient === 'flat' ? 0 : -30)) * Math.PI) / 180;
      const x = Math.cos(a) * (s - b), y = -Math.sin(a) * (s - b); // shape y → world -z after rotateX(-90°)
      if (c) sh.lineTo(x, y); else sh.moveTo(x, y);
    }
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, h - 2 * b), bevelEnabled: b > 0.001, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
    const pos = g.attributes.position; const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) / s + 1) / 2, (pos.getY(i) / s + 1) / 2);
    g.rotateX(-Math.PI / 2);
    g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0);
    g.computeVertexNormals();
    return g;
  });
}

// small 3D props on a tile, kept to the outer ring so pieces in the middle stay readable
function hexDeco(kind, s, top, seed, color) {
  const g = new THREE.Group();
  let r = seed >>> 0; const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return r / 4294967296; };
  const spots = (n, rad) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 + rnd() * 0.6 + 0.4; const d = rad * (0.85 + rnd() * 0.3); return [Math.cos(a) * d, Math.sin(a) * d]; });
  const mat = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: rough, flatShading: true });
  if (kind === 'mountain') {
    const rock = mat(shade(color, -0.25)); const snow = mat('#f4f6f8', 0.7);
    for (const [x, z] of spots(3, s * 0.52)) {
      const hh = s * (0.42 + rnd() * 0.25), rad = s * (0.2 + rnd() * 0.07);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rad, hh, 5), rock); m.position.set(x, top + hh / 2, z); m.rotation.y = rnd() * 3; g.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.38, hh * 0.38, 5), snow); cap.position.set(x, top + hh * 0.81, z); cap.rotation.y = m.rotation.y; g.add(cap);
    }
  } else if (kind === 'forest') {
    const leaf = mat(shade(color, -0.3)); const trunk = mat('#6b4a2f');
    for (const [x, z] of spots(5, s * 0.55)) {
      const hh = s * (0.26 + rnd() * 0.12);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.02, s * 0.025, hh * 0.3, 5), trunk); t.position.set(x, top + hh * 0.15, z); g.add(t);
      const c = new THREE.Mesh(new THREE.ConeGeometry(s * 0.09, hh * 0.8, 6), leaf); c.position.set(x, top + hh * 0.3 + hh * 0.4, z); g.add(c);
    }
  } else if (kind === 'hills') {
    const m0 = mat(shade(color, -0.12));
    for (const [x, z] of spots(3, s * 0.52)) { const m = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), m0); m.scale.set(1.3, 0.55, 1); m.position.set(x, top, z); m.rotation.y = rnd() * 3; g.add(m); }
  } else if (kind === 'city') {
    const wall = mat('#e8e0cf', 0.7); const roof = mat('#a0503a', 0.7);
    for (const [x, z] of spots(4, s * 0.55)) {
      const w = s * (0.1 + rnd() * 0.05), hh = s * (0.12 + rnd() * 0.14);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, w), wall); b.position.set(x, top + hh / 2, z); b.rotation.y = rnd() * 3; g.add(b);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, w * 0.6, 4), roof); rf.position.set(x, top + hh + w * 0.3, z); rf.rotation.y = b.rotation.y + Math.PI / 4; g.add(rf);
    }
  } else if (kind === 'rubble') {
    const m0 = mat(shade(color, -0.3));
    for (const [x, z] of spots(5, s * 0.55)) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s * (0.05 + rnd() * 0.05), 0), m0); m.position.set(x, top + s * 0.03, z); m.rotation.set(rnd() * 3, rnd() * 3, 0); g.add(m); }
  }
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return g;
}

// hex tile: { terrain, color, height, face (title/text/icon/image on top), deco: false | kind, ghost }
export function makeHexTile(o, store, { size = HEX_SIZE, orient = 'pointy' } = {}) {
  const t = TERRAIN[o.terrain] || {};
  const color = o.color || t.color || '#9cbf6a';
  const h = hexHeight(o);
  const grp = new THREE.Group();
  const gap = o.ghost ? 0.25 : 0.12; // a hairline between neighbouring tiles
  const s = Math.max(0.5, size - gap / Math.sqrt(3));
  const face = o.face ?? {};
  const deco = o.deco === false ? null : o.deco || t.deco;
  const top = new THREE.MeshStandardMaterial({ map: store.texture('hex', face, 384, 384, { color, orient, ring: deco === 'water', ghost: !!o.ghost }), roughness: deco === 'water' ? 0.35 : 0.8, transparent: !!o.ghost, depthWrite: !o.ghost });
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade(color, -0.28)), roughness: 0.8, transparent: !!o.ghost, opacity: o.ghost ? 0.25 : 1 });
  const m = new THREE.Mesh(hexPrism(s, h, orient), [top, side]);
  m.castShadow = !o.ghost; m.receiveShadow = true;
  grp.add(m);
  if (deco && !o.ghost && deco !== 'water') grp.add(hexDeco(deco, s, h, hash(String(o.id)), color));
  grp.userData.key = JSON.stringify([o.terrain, o.color, o.height, face, o.deco, o.ghost, size, orient]);
  return grp;
}
export function hexTileKey(o, { size = HEX_SIZE, orient = 'pointy' } = {}) {
  const face = o.face ?? {};
  return JSON.stringify([o.terrain, o.color, o.height, face, o.deco, o.ghost, size, orient]);
}

// see-through placement preview (ghost pieces): every material of the mesh fades, or comes back
export function setGhost(obj, on) {
  obj.traverse((c) => {
    if (!c.isMesh) return;
    for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
      if (m.userData.ghostBase == null) m.userData.ghostBase = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
      const b = m.userData.ghostBase;
      m.transparent = on ? true : b.transparent; m.opacity = on ? b.opacity * 0.4 : b.opacity; m.depthWrite = on ? false : b.depthWrite;
      m.needsUpdate = true;
    }
    c.castShadow = !on;
  });
}

// glowing outline around a hex tile (selectable / highlighted)
export function makeHexHalo(size, orient, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(size * 0.8, size * 1.02, 6, 1, orient === 'flat' ? 0 : Math.PI / 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color || '#f2c14e'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------- link (road / route / supply line between two points)
// Lies along local +x, centred, on y=0..thickness. style: 'solid' | 'dashed' | 'dotted' | 'segments' (n train cars).
export function makeLink(o, len) {
  const g = new THREE.Group();
  const w = Number(o.width) || 0.7;
  const th = Number(o.thickness) || 0.22;
  const color = new THREE.Color(o.color || '#f1ede4');
  const style = o.style || (o.segments ? 'segments' : o.dashed ? 'dashed' : 'solid');
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: o.emissive ?? 0.12, transparent: !!o.ghost, opacity: o.ghost ? 0.45 : 1 });
  const piece = (x0, x1, h = th, ww = w) => { const b = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, x1 - x0), h, ww), mat); b.position.set((x0 + x1) / 2, h / 2, 0); b.castShadow = !o.ghost; b.receiveShadow = true; g.add(b); };
  if (style === 'solid') piece(-len / 2, len / 2);
  else if (style === 'dotted') { const n = Math.max(2, Math.round(len / (w * 2.2))); for (let i = 0; i < n; i++) { const x = -len / 2 + (len * (i + 0.5)) / n; const d = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.45, th, 12), mat); d.position.set(x, th / 2, 0); g.add(d); } }
  else {
    const n = style === 'segments' ? Math.max(1, o.segments | 0 || 1) : Math.max(2, Math.round(len / 1.6));
    const gapW = style === 'segments' ? Math.min(0.5, len / n * 0.18) : len / n * 0.4;
    const step = len / n;
    for (let i = 0; i < n; i++) piece(-len / 2 + i * step + gapW / 2, -len / 2 + (i + 1) * step - gapW / 2, style === 'segments' ? th * 1.6 : th);
  }
  // wider invisible strip so thin links are easy to click and hover
  const hit = new THREE.Mesh(new THREE.BoxGeometry(len, th * 4, Math.max(w, 1.8)), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  hit.position.y = th; g.add(hit);
  g.userData.key = JSON.stringify([style, o.width, o.thickness, o.color, o.segments, o.ghost, o.emissive, len.toFixed(2)]);
  return g;
}
export function linkKey(o, len) {
  const style = o.style || (o.segments ? 'segments' : o.dashed ? 'dashed' : 'solid');
  return JSON.stringify([style, o.width, o.thickness, o.color, o.segments, o.ghost, o.emissive, len.toFixed(2)]);
}

// ---------------------------------------------------------------- sand timer
export function makeTimer(o) {
  const s = Number(o.size) || 6;
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.6 });
  const capG = new THREE.CylinderGeometry(s * 0.32, s * 0.32, s * 0.08, 24);
  const bot = new THREE.Mesh(capG, wood); bot.position.y = s * 0.04; g.add(bot);
  const top = new THREE.Mesh(capG, wood); top.position.y = s * 0.96; g.add(top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.025, s * 0.025, s * 0.88, 8), wood);
    post.position.set(Math.cos(a) * s * 0.27, s * 0.5, Math.sin(a) * s * 0.27); g.add(post);
  }
  const glassPts = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20; const y = s * (0.08 + t * 0.84); const r = s * (0.03 + 0.2 * Math.pow(Math.abs(t - 0.5) * 2, 0.9)); glassPts.push(new THREE.Vector2(r, y)); }
  const glass = new THREE.Mesh(new THREE.LatheGeometry(glassPts, 24), new THREE.MeshPhysicalMaterial({ color: 0xddeeff, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.35, depthWrite: false }));
  g.add(glass);
  const sandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.color || '#d9b26a'), roughness: 0.9 });
  const upper = new THREE.Mesh(new THREE.ConeGeometry(s * 0.19, s * 0.34, 20), sandMat);
  upper.rotation.x = Math.PI; upper.position.y = s * 0.68; g.add(upper);
  const lower = new THREE.Mesh(new THREE.ConeGeometry(s * 0.2, s * 0.3, 20), sandMat);
  lower.position.y = s * 0.23; g.add(lower);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.008, s * 0.008, s * 0.4, 6), sandMat);
  stream.position.y = s * 0.3; g.add(stream);
  g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
  g.userData.sand = { upper, lower, stream, s };
  return g;
}
export function updateTimer(g, frac) {
  const { upper, lower, stream, s } = g.userData.sand;
  const f = Math.max(0, Math.min(1, frac)); // remaining fraction
  upper.scale.set(Math.max(0.01, Math.sqrt(f)), Math.max(0.01, f), Math.max(0.01, Math.sqrt(f)));
  upper.position.y = s * (0.53 + 0.15 * f);
  lower.scale.set(Math.max(0.01, Math.sqrt(1 - f)), Math.max(0.01, 1 - f), Math.max(0.01, Math.sqrt(1 - f)));
  lower.position.y = s * (0.08 + 0.15 * (1 - f));
  stream.visible = f > 0.001 && f < 0.999;
}

// ---------------------------------------------------------------- text (printed on table) and label
export function textTexture(text, { size = 64, color = '#fff', bg = null, weight = 700, family = UI_FONT, pad = 0.35, maxW = 1024, border = null, accent = null } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `${weight} ${size}px ${family}`;
  const lines = String(text).split('\n');
  const tw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width)) + size * pad * 2);
  c.width = Math.ceil(tw); c.height = Math.ceil(lines.length * size * 1.25 + size * pad * 1.4);
  g.font = `${weight} ${size}px ${family}`;
  const r = Math.min(c.height / 2, size * 0.6);
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(2, 2, c.width - 4, c.height - 4, r); g.fill(); }
  if (border) { g.strokeStyle = border; g.lineWidth = 3; g.beginPath(); g.roundRect(2, 2, c.width - 4, c.height - 4, r); g.stroke(); }
  if (accent) { g.fillStyle = accent; g.beginPath(); g.roundRect(2, 2, size * 0.22, c.height - 4, [r, 0, 0, r]); g.fill(); }
  g.font = `${weight} ${size}px ${family}`;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'top';
  lines.forEach((l, i) => { if (i) g.font = `600 ${Math.round(size * 0.8)}px ${family}`; g.fillText(l, c.width / 2, size * pad * 0.7 + i * size * 1.25 + (i ? size * 0.12 : 0), c.width - size * pad); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, w: c.width, h: c.height };
}
export function makeLabelSprite(text, opts = {}) {
  const { tex, w, h } = textTexture(text, { size: 52, color: opts.color || '#fff', bg: opts.bg || 'rgba(16,19,26,.82)', weight: 700, border: opts.border || 'rgba(255,255,255,.18)', accent: opts.accent });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  const height = opts.height || 1.6;
  sp.scale.set((w / h) * height, height, 1);
  sp.renderOrder = 20;
  sp.userData.text = text;
  return sp;
}
export function makeFlatText(text, opts = {}) {
  const { tex, w, h } = textTexture(text, { size: 64, color: opts.color || 'rgba(255,255,255,.85)', weight: opts.weight || 800, family: opts.family });
  const height = opts.size || 2;
  const m = new THREE.Mesh(new THREE.PlaneGeometry((w / h) * height, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// halo under selectable/glowing objects
let haloTex = null;
export function makeHalo(w, d, color, pad = 2.4) {
  if (!haloTex) haloTex = canvasTex(128, 128, (g, W) => { const r = g.createRadialGradient(W / 2, W / 2, W * 0.25, W / 2, W / 2, W / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, W, W); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w + pad, d + pad), new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(color || '#f2c14e'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}
