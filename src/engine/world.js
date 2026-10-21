// BoardForge Tabletop — 3D table engine. Diffs the server's declarative `scene` (zones + objects) by id and
// applies it with animation; plays fx (dice, sound, banner, shake...); forwards a clicked object's `click` move.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as CANNON from 'cannon-es';
import { layoutScene, footprint, CARD_T, cardSize, tokenDims } from './layout';
import { FaceStore, shade } from './faces';
import { makeCard, updateCardFaces, makeDeck, setDeckCount, updateDeckTop, makeDie, dieRestQuat, makeToken, rebuildToken, makeBoard, makeTimer, updateTimer, makeLabelSprite, makeFlatText, makeHalo, texSize, makeHexTile, hexTileKey, makeHexHalo, makeLink, linkKey, setGhost } from './meshes';
import { Environment } from './env';
import { simulateRoll, DiceRoll } from './dice';
import { fontsReady } from './fonts';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const FLIP = new THREE.Quaternion().setFromAxisAngle(X, Math.PI);
const yaw = (a) => new THREE.Quaternion().setFromAxisAngle(Y, a);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const _tq = new THREE.Quaternion();
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function rrCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class TabletopWorld {
  constructor(canvas, { audio, onMove, onHover, onEvent, youLabel } = {}) {
    this.canvas = canvas; this.audio = audio;
    this.youLabel = youLabel || (() => ' (you)');
    this.onMove = onMove || (() => {}); this.onHover = onHover || (() => {}); this.onEvent = onEvent || (() => {});
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    this.camera.position.set(0, 120, 140);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.46, minDistance: 25, maxDistance: 420, screenSpacePanning: false });
    this.controls.addEventListener('start', () => { this.userCam = true; this.camTween = null; }); // drag, pan or wheel
    this.store = new FaceStore();
    this.store.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.env = new Environment(this.scene, this.renderer);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.zoneGroup = new THREE.Group(); this.scene.add(this.zoneGroup);
    this.seatGroup = new THREE.Group(); this.scene.add(this.seatGroup);
    this.entries = new Map();
    this.tweens = []; this.rolls = []; this.temps = [];
    this.layout = null; this.first = true; this.shake = 0; this.serverOffset = 0;
    this.camTween = null; this.camPreset = 'table';
    this.insets = { top: 0, bottom: 0, left: 0, right: 0 }; // px covered by the HUD; the table is framed into the rest
    this.userCam = false; // the player moved the camera: stop auto-framing until a preset is chosen again
    this.animScale = 1; // animation duration multiplier (settings: cinematic 1.45 / normal 1 / fast 0.65)
    this.youId = null;
    this.fontsOk = false; this.pending = null;
    fontsReady().then(() => { this.fontsOk = true; if (this.pending) { const [sc, o] = this.pending; this.pending = null; this.sync(sc, o); } });
    this._physics();
    this._events();
    this.clock = new THREE.Clock();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement || canvas);
    this.resize();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ---------------------------------------------------------------- setup
  _physics() {
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -981, 0) });
    this.world.allowSleep = true;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.world.defaultContactMaterial.restitution = 0.3;
    this.world.defaultContactMaterial.friction = 0.4;
  }

  _events() {
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    let down = null;
    this._onMoveEv = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.needPick = true;
    };
    this._onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; this.audio?.ensure(); };
    this._onUp = (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || e.button !== 0) return;
      const hit = this._pick();
      if (!hit) return;
      const ent = this.entries.get(hit);
      if (ent?.spec.click && !ent.spec.disabled) {
        this.audio?.play('tap');
        this._pulse(ent);
        this.onMove(ent.spec.click);
      } else if (ent) this.onHover({ id: hit, spec: ent.spec, pinned: true, ...this.pointer });
    };
    this._onLeave = () => { this.pointer = null; this._setHover(null); };
    this._onDbl = () => { if (!this._pick()) this.setCamera(this.camPreset); };
    this.canvas.addEventListener('pointermove', this._onMoveEv);
    this.canvas.addEventListener('pointerdown', this._onDown);
    this.canvas.addEventListener('pointerup', this._onUp);
    this.canvas.addEventListener('pointerleave', this._onLeave);
    this.canvas.addEventListener('dblclick', this._onDbl);
  }

  resize() {
    const el = this.canvas.parentElement || this.canvas;
    const w = el.clientWidth || 800, h = el.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 52 : 40;
    this.camera.updateProjectionMatrix();
    // a real size change (window, embed, fullscreen) re-frames the table even if the player had moved the camera
    const last = this._lastSize;
    if (last && (Math.abs(w - last.w) > last.w * 0.08 || Math.abs(h - last.h) > last.h * 0.08)) this.userCam = false;
    this._lastSize = { w, h };
    this._reframe();
  }

  // HUD-covered margins in px ({ top, bottom, left, right }); the table is centred in what remains
  setInsets(ins = {}) {
    const next = { top: 0, bottom: 0, left: 0, right: 0, ...ins };
    if (['top', 'bottom', 'left', 'right'].every((k) => Math.abs(next[k] - this.insets[k]) < 2)) return;
    this.insets = next;
    this._reframe();
  }

  // keep the current preset framed after size/HUD changes, unless the player took over the camera
  _reframe() {
    if (!this.layout) return;
    if (this.userCam) { this._applyShift(this.camShift || { x: 0, y: 0 }); return; }
    this.setCamera(this.camPreset, true, true);
  }

  _safeRect() {
    const { width: W, height: H } = this.renderer.domElement;
    const pr = this.renderer.getPixelRatio();
    const w = W / pr, h = H / pr, i = this.insets;
    const m = 0.06; // breathing room inside the safe area (NDC)
    const rect = { xmin: -1 + (2 * i.left) / w + m, xmax: 1 - (2 * i.right) / w - m, ymin: -1 + (2 * i.bottom) / h + m, ymax: 1 - (2 * i.top) / h - m };
    if (rect.ymax - rect.ymin < 0.6) { const c = (rect.ymax + rect.ymin) / 2; rect.ymin = c - 0.3; rect.ymax = c + 0.3; } // tiny canvases: never collapse
    return { ...rect, w, h };
  }

  // shift the projection so NDC point (cx, cy) lands on the centre of the safe area
  _applyShift({ x, y }) {
    this.camShift = { x, y };
    const { w, h } = this._safeRect();
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, x, y, w, h);
    this.camera.updateProjectionMatrix();
  }

  // closest distance at which the whole table (rim included) fits the safe area, looking from `elev` degrees
  _fitTable(elevDeg, target) {
    const L = this.layout;
    const round = this.sceneSpec?.table?.shape === 'round';
    const rx = (round ? L.tableR : L.tableRx || L.tableR) + 4, rz = (round ? L.tableR : L.tableRz || L.tableR) + 4;
    const pts = [];
    if (round) for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * rz)); }
    else for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, -5]) pts.push(new THREE.Vector3(sx * rx, y, sz * rz));
    const safe = this._safeRect();
    const cam = (this._fitCam ||= new THREE.PerspectiveCamera());
    cam.fov = this.camera.fov; cam.aspect = this.camera.aspect; cam.near = this.camera.near; cam.far = this.camera.far;
    cam.clearViewOffset(); cam.updateProjectionMatrix();
    const dir = new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(elevDeg)), Math.cos(THREE.MathUtils.degToRad(elevDeg)));
    const v = new THREE.Vector3();
    const box = (d) => {
      cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      return { x0, x1, y0, y1 };
    };
    let lo = 10, hi = 6000;
    for (let k = 0; k < 32; k++) {
      const d = (lo + hi) / 2; const b = box(d);
      if (b.x1 - b.x0 <= safe.xmax - safe.xmin && b.y1 - b.y0 <= safe.ymax - safe.ymin) hi = d; else lo = d;
    }
    const b = box(hi);
    // projection shift that centres the table's box inside the safe area (in px)
    const shift = { x: (((b.x0 + b.x1) / 2 - (safe.xmin + safe.xmax) / 2) / 2) * safe.w, y: (((safe.ymin + safe.ymax) / 2 - (b.y0 + b.y1) / 2) / 2) * safe.h };
    return { pos: target.clone().addScaledVector(dir, hi), shift, dist: hi };
  }

  setAssets(map) {
    const next = map || {};
    if (JSON.stringify(next) === JSON.stringify(this.store.assets)) return;
    this.store.setAssets(next);
  }

  // ---------------------------------------------------------------- sync
  sync(scene, { youId } = {}) {
    if (!scene) return;
    if (!this.fontsOk) { this.pending = [scene, { youId }]; return; } // first draw once fonts are loaded
    this.youId = youId ?? null;
    this.sceneSpec = scene;
    const L = layoutScene(scene, youId);
    this.layout = L;
    if (scene.theme?.font) this.store.font = scene.theme.font;
    if (scene.theme?.serif) this.store.serif = scene.theme.serif;
    const p = this.env.apply(scene.env || {}, scene.table || {}, { rx: L.tableRx, rz: L.tableRz, r: L.tableR }, this.store.assets, this.store);
    this.audio?.setCustom(Object.fromEntries(Object.entries(scene.sounds || {}).map(([k, v]) => [k, this.store.assets[v] || v])));
    this.audio?.ambience(scene.env?.ambience === undefined ? p.ambience : scene.env.ambience);
    this._zones(L);
    this._seats(L, scene.seats || []);
    const seen = new Set();
    const sfx = { slide: 0, flip: 0, clink: 0, clack: 0, dealt: 0 };
    const spots = [];
    for (const raw of scene.objects || []) {
      const o = this._autoImage(raw);
      const pos = L.objects.get(o.id);
      if (!pos) continue;
      seen.add(o.id);
      let ent = this.entries.get(o.id);
      if (ent && ent.kind !== o.kind) { this._remove(ent, true); ent = null; }
      if (!this.first) this._spotCheck(ent?.spec || null, o, ent?.zone ?? null, pos, spots);
      if (!ent) { ent = this._create(o, pos); this._enter(ent, o, sfx); } else this._update(ent, o, pos, sfx);
      ent.spec = o; ent.zone = pos.zone; ent.lay = pos;
      this._decorate(ent);
    }
    for (const ent of [...this.entries.values()]) if (!seen.has(ent.id)) this._remove(ent);
    if (!this.first) {
      if (sfx.slide) this.audio?.play('slide', { vol: Math.min(1, 0.5 + sfx.slide * 0.1) });
      if (sfx.flip) setTimeout(() => this.audio?.play('flip'), 180);
      for (let i = 0; i < Math.min(sfx.clink, 6); i++) setTimeout(() => this.audio?.play('clink', { vol: 0.7 }), 90 + i * 70);
      if (sfx.clack) this.audio?.play('clack', { vol: 0.6 });
    }
    if (spots.length) this.onEvent({ type: 'spot', items: spots });
    if (this.first) { this.first = false; this.setCamera(scene.camera?.preset || 'table', true); this.onEvent({ type: 'ready' }); }
  }

  // ---------------------------------------------------------------- tracking (spotlight) detection
  // Derives cards others revealed / played / discarded from the scene diff. Cards entering my seat
  // (my own hand) are skipped; the React side resolves the actor from seat + active player info.
  _spotCheck(prev, o, prevZone, pos, spots) {
    const seatOf = (zid) => (zid ? this.layout.zones.get(zid)?.zone.seat ?? null : null);
    const toSeat = pos.seat ?? null;
    const item = (reason, extra = {}) => ({
      id: o.id, kind: o.kind, reason, face: o.face, back: o.back, size: o.size, faceUp: true,
      fromZone: prevZone, toZone: pos.zone, fromSeat: seatOf(prevZone), toSeat, zoneLabel: pos.zone ? this.layout.zones.get(pos.zone)?.zone.label || null : null, ...extra,
    });
    if (o.kind === 'card') {
      const up = o.faceUp !== false && o.face != null;
      if (!up) return;
      if (!prev) { if (toSeat !== this.youId) spots.push(item('enter', { fromZone: o.enterFrom || null, fromSeat: seatOf(o.enterFrom) })); return; }
      const wasUp = prev.faceUp !== false && prev.face != null;
      // a hidden card that lands in your own seat (dealt, drafted, passed to you) is yours to read, not news to spotlight
      if (!wasUp) { if (toSeat !== this.youId) spots.push(item(prevZone !== pos.zone ? 'move' : 'flip')); return; }
      if (prevZone !== pos.zone && !(toSeat === this.youId && seatOf(prevZone) === this.youId)) spots.push(item('move'));
    } else if (o.kind === 'deck' && prev && o.faceUp && o.face && (o.count ?? 1) >= (prev.count ?? 1) && JSON.stringify(o.face) !== JSON.stringify(prev.face)) {
      spots.push(item('discard'));
    }
  }

  // spotlight / log thumbnail: card face (or back) at high resolution
  thumb(item, height = 220) {
    if (!item) return null;
    const [w, h] = cardSize(item);
    const s = height / h;
    const up = item.faceUp !== false && item.face != null;
    return this.store.preview(up ? 'card' : 'back', up ? item.face : (item.back || {}), Math.round(w * s), Math.round(height));
  }

  // briefly highlights objects on the table (to find the spotlighted card on the table)
  flash(ids = [], color = '#7fd3ff', ms = 1600) {
    for (const id of ids) {
      const ent = this.entries.get(id);
      if (!ent) continue;
      const fp = footprint(ent.spec, ent.lay);
      const h = ent.kind === 'hex' ? makeHexHalo(ent.lay.hex?.size || 5, ent.lay.hex?.orient, color) : makeHalo(fp.w, fp.d, color);
      h.position.copy(ent.mesh.position).setY((ent.home?.base ?? 0) + (ent.kind === 'hex' ? fp.h + 0.03 : 0.005));
      h.rotation.z = new THREE.Euler().setFromQuaternion(ent.mesh.quaternion, 'YXZ').y;
      this.root.add(h);
      this.tweens.push({ custom: (k) => { h.material.opacity = (Math.sin(k * Math.PI * 4 - Math.PI / 2) * 0.5 + 0.5) * (1 - k * 0.4); }, t: 0, dur: ms, done: () => { h.removeFromParent(); h.geometry.dispose(); } });
    }
  }

  setAnimScale(k) { this.animScale = Math.max(0.3, Math.min(2.5, Number(k) || 1)); }
  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = q !== 'off';
    this.env.setQuality(q);
    this.scene.traverse((c) => { if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.needsUpdate = true; }); });
    this.resize();
  }

  _pose(o, pos, ent) {
    const fp = footprint(o, pos);
    const q = yaw(pos.rotY + (o.kind === 'card' && o.tapped ? -Math.PI / 2 : 0));
    const base = pos.y + (o.raise || 0); // surface the object rests on (table or board)
    const v = new THREE.Vector3(pos.x, base, pos.z);
    if (o.kind === 'card') { v.y += CARD_T / 2 + 0.01; if (o.faceUp === false) q.multiply(FLIP); }
    else if (o.kind === 'die') { v.y += fp.h / 2; return { pos: v, quat: ent?.mesh ? dieRestQuat(ent.mesh, o.value ?? 0, pos.rotY) : q, base }; }
    else if (o.kind === 'text') v.y += 0.03;
    else if (o.kind === 'link') { v.y += 0.03; if (pos.pitch) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, pos.pitch)); }
    return { pos: v, quat: q, base };
  }

  // if face.image is not given and the object id (or o.asset) is a project image key, that image is used
  _autoImage(o) {
    const key = o.asset || o.id;
    if (!this.store.assets[key]) return o;
    const f = o.face == null ? {} : typeof o.face === 'string' ? { title: o.face } : o.face;
    return f.image ? o : { ...o, face: { ...f, image: key } };
  }

  _create(o, pos) {
    let mesh;
    switch (o.kind) {
      case 'card': mesh = makeCard(o, this.store); break;
      case 'deck': mesh = makeDeck(o, this.store); break;
      case 'die': mesh = makeDie(o, this.store); break;
      case 'token': mesh = makeToken(o, this.store); break;
      case 'board': mesh = makeBoard(o, this.store); break;
      case 'timer': mesh = makeTimer(o); break;
      case 'text': mesh = makeFlatText(o.text || '', { size: o.size || 2, color: o.color }); break;
      case 'hex': mesh = makeHexTile(o, this.store, pos.hex || {}); break;
      case 'link': mesh = makeLink(o, pos.len || 4); break;
      default: mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: o.color || '#888' }));
    }
    if (o.ghost && o.kind !== 'hex' && o.kind !== 'link') setGhost(mesh, true);
    const ent = { id: o.id, kind: o.kind, spec: o, mesh, zone: pos.zone, lay: pos };
    mesh.userData.pickId = o.id;
    mesh.traverse((c) => { c.userData.pickId = o.id; });
    this.env.tune(mesh);
    this.root.add(mesh);
    this.entries.set(o.id, ent);
    const pose = this._pose(o, pos, ent);
    ent.home = pose;
    return ent;
  }

  _enter(ent, o, sfx) {
    const home = ent.home;
    if (this.first || reduceMotion) { ent.mesh.position.copy(home.pos); ent.mesh.quaternion.copy(home.quat); return; }
    let from = null;
    const src = o.enterFrom && (this.entries.get(o.enterFrom)?.mesh.position || (this.layout.zones.get(o.enterFrom) && new THREE.Vector3(this.layout.zones.get(o.enterFrom).ox, 0, this.layout.zones.get(o.enterFrom).oz)));
    if (src) {
      from = { pos: src.clone().add(new THREE.Vector3(0, 1.5, 0)), quat: o.kind === 'card' ? yaw(home.quat ? new THREE.Euler().setFromQuaternion(home.quat, 'YXZ').y : 0).multiply(FLIP) : home.quat.clone() };
    } else from = { pos: home.pos.clone().add(new THREE.Vector3(0, 14, 0)), quat: home.quat.clone() };
    ent.mesh.position.copy(from.pos); ent.mesh.quaternion.copy(from.quat);
    // cards drawn from the deck are dealt one by one (each with its own "flick" sound)
    const delay = src && o.kind === 'card' ? Math.min(900, sfx.dealt++ * 90) : 0;
    this._tween(ent, from, home, { dur: src ? 680 : 420, arc: src ? 7 : 0, delay, tilt: src ? 0.2 : 0, onStart: delay ? () => this.audio?.play('deal', { vol: 0.8 }) : null });
    if ((o.kind === 'card' && !delay) || o.kind === 'deck') sfx.slide++;
    if (o.kind === 'card' && src && o.faceUp !== false) sfx.flip++;
    if (o.kind === 'token') sfx.clink += Math.min(3, o.count ?? 1);
  }

  _update(ent, o, pos, sfx) {
    const prev = ent.spec;
    if (o.kind === 'card') updateCardFaces(ent.mesh, o, this.store);
    if (o.kind === 'deck') { updateDeckTop(ent.mesh, o, this.store); if ((o.count ?? 1) !== (prev.count ?? 1)) { setDeckCount(ent.mesh, o); sfx.slide++; } }
    if (o.kind === 'board' && JSON.stringify(o.face || {}) !== ent.mesh.userData.faceKey) { const m = makeBoard(o, this.store); this._swapMesh(ent, m); }
    if (o.kind === 'die' && JSON.stringify([o.faces, o.color, o.size]) !== JSON.stringify([prev.faces, prev.color, prev.size])) { this._swapMesh(ent, makeDie(o, this.store)); ent.rest = null; }
    if (o.kind === 'text' && (o.text !== prev.text || o.color !== prev.color)) this._swapMesh(ent, makeFlatText(o.text || '', { size: o.size || 2, color: o.color }));
    if (o.kind === 'hex' && hexTileKey(o, pos.hex || {}) !== ent.mesh.userData.key) this._swapMesh(ent, makeHexTile(o, this.store, pos.hex || {}));
    if (o.kind === 'link' && linkKey(o, pos.len || 4) !== ent.mesh.userData.key) this._swapMesh(ent, makeLink(o, pos.len || 4));
    if (o.kind !== 'hex' && o.kind !== 'link' && !!o.ghost !== !!prev.ghost) setGhost(ent.mesh, !!o.ghost);
    if (o.kind === 'token') {
      const before = prev.count ?? 1;
      const { added, removed, unit } = rebuildToken(ent.mesh, o, this.store);
      added.forEach((m, i) => { // new tokens drop from above
        const target = m.position.clone(); m.position.y += 8 + i * 1.5;
        this.tweens.push({ obj: m, from: { pos: m.position.clone(), quat: m.quaternion.clone() }, to: { pos: target, quat: m.quaternion.clone() }, t: 0, dur: 380 + i * 60, arc: 0, bounce: true });
      });
      removed.forEach((m) => this._vanish(m, ent.mesh, false));
      if ((o.count ?? 1) > before) sfx.clink += Math.min(4, (o.count ?? 1) - before); else if ((o.count ?? 1) < before) sfx.clack++;
      void unit;
    }
    const pose = this._pose(o, pos, ent);
    if (ent.rolling) { ent.home = pose; return; }
    if (o.kind === 'die' && ent.rest && ent.zone === pos.zone && o.value === prev.value) { ent.home = ent.rest; return; }
    const moved = !ent.home || ent.home.pos.distanceTo(pose.pos) > 0.05 || ent.home.quat.angleTo(pose.quat) > 0.01;
    if (moved) {
      const flipped = o.kind === 'card' && (prev.faceUp === false) !== (o.faceUp === false);
      const far = ent.home ? ent.home.pos.distanceTo(pose.pos) : 0;
      this._tween(ent, { pos: ent.mesh.position.clone(), quat: ent.mesh.quaternion.clone() }, pose, { dur: Math.min(900, 400 + far * 6), arc: flipped ? 5 : Math.min(9, far * 0.13), tilt: o.kind === 'card' && far > 4 ? Math.min(0.22, far * 0.006) : 0 });
      if (o.kind === 'card' || o.kind === 'deck') { if (far > 1) sfx.slide++; if (flipped) sfx.flip++; }
      if (o.kind === 'die') ent.rest = null;
    }
    ent.home = pose;
  }

  _swapMesh(ent, mesh) {
    const old = ent.mesh;
    mesh.position.copy(old.position); mesh.quaternion.copy(old.quaternion);
    mesh.userData.pickId = ent.id; mesh.traverse((c) => { c.userData.pickId = ent.id; });
    this.root.remove(old); this._dispose(old);
    this.env.tune(mesh);
    this.root.add(mesh); ent.mesh = mesh;
    for (const k of ['halo', 'label']) if (ent[k]) { ent[k].removeFromParent(); ent[k] = null; ent[`${k}Key`] = null; }
  }

  // decorations such as labels, halo (glow / clickable)
  _decorate(ent) {
    const o = ent.spec;
    const fp = footprint(o, ent.lay);
    let label = o.label;
    if (label == null && o.kind === 'deck' && o.showCount !== false && (o.count ?? 0) > 0) label = String(o.count);
    if (label == null && o.kind === 'token' && o.showCount !== false && (o.count ?? 1) > 1) label = `×${o.count}`;
    const lkey = label == null ? null : String(label);
    if (lkey !== ent.labelKey) {
      if (ent.label) { ent.label.removeFromParent(); ent.label.material.map.dispose(); ent.label = null; }
      if (lkey) { ent.label = makeLabelSprite(lkey, { height: o.kind === 'token' ? 1.4 : 1.6, bg: o.labelColor || 'rgba(20,24,30,.78)' }); this.root.add(ent.label); }
      ent.labelKey = lkey;
    }
    const glow = o.glow || (o.click && !o.disabled ? (o.glow === false ? null : 'soft') : null);
    const gkey = glow ? `${glow}:${fp.w.toFixed(1)}:${fp.d.toFixed(1)}` : null;
    if (gkey !== ent.haloKey) {
      if (ent.halo) { ent.halo.removeFromParent(); ent.halo.geometry.dispose(); ent.halo = null; }
      if (glow) {
        const color = glow === 'soft' || glow === true ? '#f2c14e' : glow;
        // hex tiles get an outline on their top face; everything else a soft glow on the surface it stands on
        ent.halo = ent.kind === 'hex' ? makeHexHalo(ent.lay?.hex?.size || 5, ent.lay?.hex?.orient, color) : makeHalo(fp.w, fp.d, color, ent.kind === 'link' ? 0.9 : 2.4);
        ent.halo.userData.soft = glow === 'soft'; ent.halo.userData.lift = ent.kind === 'hex' ? fp.h + 0.03 : 0.004;
        this.root.add(ent.halo);
      }
      ent.haloKey = gkey;
    }
    ent.mesh.traverse((c) => { if (c.isMesh) c.userData.pickId = ent.id; });
  }

  _remove(ent, instant = false) {
    this.entries.delete(ent.id);
    for (const k of ['halo', 'label']) if (ent[k]) ent[k].removeFromParent();
    if (instant || reduceMotion) { this.root.remove(ent.mesh); this._dispose(ent.mesh); return; }
    ent.mesh.userData.pickId = null; ent.mesh.traverse((c) => { c.userData.pickId = null; });
    this._vanish(ent.mesh, this.root);
  }

  // releaseTex=false: shared texture (e.g. single token in a stack) stays in the store
  _vanish(obj, parent, releaseTex = true) {
    const mats = [];
    obj.traverse((c) => { if (c.isMesh) { c.material = Array.isArray(c.material) ? c.material.map((m) => m.clone()) : c.material.clone(); (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.transparent = true; mats.push(m); }); } });
    const from = obj.position.clone();
    this.tweens.push({ custom: (k) => { obj.position.y = from.y + k * 6; mats.forEach((m) => { m.opacity = 1 - k; }); }, t: 0, dur: 420, done: () => { parent.remove(obj); this._dispose(obj, releaseTex); } });
  }

  _dispose(obj, releaseTex = true) {
    const maps = new Set();
    obj.traverse((c) => {
      if (!c.isMesh && !c.isSprite) return;
      (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { if (m?.map) maps.add(m.map); m?.dispose?.(); });
    });
    if (releaseTex) maps.forEach((t) => { if (!this._sharedTex(t)) t.dispose?.(); });
  }
  _sharedTex(t) { for (const e of this.store.cache.values()) if (e.tex === t) { this.store.release(t); return true; } return false; }

  // tilt: pitch lifting the leading edge along the flight path (rad) — card seems to glide
  _tween(ent, from, to, { dur = 450, arc = 0, delay = 0, tilt = 0, onStart = null } = {}) {
    this.tweens = this.tweens.filter((t) => t.obj !== ent.mesh);
    const k = reduceMotion ? 0.01 : this.animScale;
    let axis = null;
    if (tilt) { const d = to.pos.clone().sub(from.pos).setY(0); if (d.lengthSq() > 0.01) axis = new THREE.Vector3(-d.z, 0, d.x).normalize(); }
    this.tweens.push({ obj: ent.mesh, from, to, t: -delay * k, dur: dur * k, arc, axis, tilt, onStart });
  }

  _pulse(ent) {
    const m = ent.mesh; const s0 = m.scale.clone();
    this.tweens.push({ custom: (k) => { const f = 1 + Math.sin(k * Math.PI) * 0.06; m.scale.set(s0.x * f, s0.y * (ent.kind === 'deck' ? 1 : f), s0.z * f); }, t: 0, dur: 220, done: () => m.scale.copy(s0) });
  }

  // ---------------------------------------------------------------- zone and seat visuals
  _zones(L) {
    const key = JSON.stringify([...L.zones.values()].map((z) => [z.zone, z.x.toFixed(1), z.z.toFixed(1), z.w.toFixed(1), z.d.toFixed(1), z.rotY.toFixed(3)]));
    if (key === this.zoneKey) return;
    this.zoneKey = key;
    this.zoneGroup.children.slice().forEach((c) => { this.zoneGroup.remove(c); this._dispose(c); });
    for (const zw of L.zones.values()) {
      const z = zw.zone;
      const mat = z.mat === true ? {} : z.mat;
      if (mat) {
        const color = mat.color || 'rgba(255,255,255,0.10)';
        const W = Math.max(64, Math.round(zw.w * 16)), H = Math.max(64, Math.round(zw.d * 16));
        const tex = mat.image && this.store.assets[mat.image]
          ? this.store.texture('board', { image: mat.image }, Math.min(1024, W), Math.min(1024, H))
          : rrCanvas(W, H, (g, w, h) => {
            const r = Math.min(w, h) * 0.08;
            g.fillStyle = color; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, r); g.fill();
            g.setLineDash([18, 12]); g.lineWidth = 4; g.strokeStyle = mat.border || 'rgba(255,255,255,.35)'; g.stroke();
          });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(zw.w, zw.d), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1 }));
        plane.rotation.x = -Math.PI / 2; plane.rotation.z = zw.rotY; plane.position.set(zw.x, zw.y + 0.004, zw.z); plane.receiveShadow = true;
        this.zoneGroup.add(plane);
      }
      if (z.slots || (z.layout === 'track' && z.marks !== false)) {
        const labels = Array.isArray(z.cells) ? z.cells : null;
        for (const sp of zw.slots) {
          const lab = labels ? (typeof labels[sp.cell] === 'object' ? labels[sp.cell] : { label: labels[sp.cell] }) : null;
          const W = Math.round(sp.w * 20), H = Math.round(sp.d * 20);
          const tex = rrCanvas(W, H, (g, w, h) => {
            g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = (lab && lab.color) || z.slotColor || 'rgba(255,255,255,.45)';
            g.beginPath(); if (z.layout === 'track') g.arc(w / 2, h / 2, Math.min(w, h) / 2 - 3, 0, 7); else g.roundRect(3, 3, w - 6, h - 6, Math.min(w, h) * 0.08); g.stroke();
            if (lab?.fill) { g.fillStyle = lab.fill; g.fill(); }
            const text = lab?.label ?? (z.layout === 'track' ? String(sp.cell) : '');
            if (text !== '' && text != null) { g.setLineDash([]); g.fillStyle = lab?.ink || 'rgba(255,255,255,.85)'; g.font = `800 ${Math.round(Math.min(w, h) * 0.42)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(text), w / 2, h / 2); }
          });
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
          plane.rotation.x = -Math.PI / 2; plane.rotation.z = zw.rotY; plane.position.set(sp.x, zw.y + 0.006, sp.z);
          this.zoneGroup.add(plane);
        }
      }
      if (z.label) {
        const t = makeFlatText(z.label, { size: z.labelSize || 1.6, color: z.labelColor || 'rgba(255,255,255,.75)' });
        const off = new THREE.Vector3(0, 0, -(zw.d / 2) - (z.labelSize || 1.6) * 0.75).applyAxisAngle(Y, zw.rotY);
        t.position.set(zw.x + off.x, zw.y + 0.006, zw.z + off.z);
        t.rotation.z = zw.rotY;
        this.zoneGroup.add(t);
      }
    }
  }

  _seats(L, seats) {
    const key = JSON.stringify([seats, L.seats.map((x) => x.R.toFixed(1))]);
    if (key === this.seatKey) return;
    this.seatKey = key;
    this.seatGroup.children.slice().forEach((c) => { this.seatGroup.remove(c); this._dispose(c); });
    this.activeRings = [];
    for (const s of L.seats) {
      const color = s.color || '#c8642b';
      const out = new THREE.Vector3(Math.cos(s.angle), 0, Math.sin(s.angle));
      const plate = makeLabelSprite(`${s.name || s.id}${s.isMe ? this.youLabel() : ''}${s.sub ? `\n${s.sub}` : ''}`, { height: s.sub ? 3.8 : 2.3, bg: s.active ? shade(color, -0.18) : 'rgba(14,17,24,.86)', accent: color, border: s.active ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.16)' });
      const pp = new THREE.Vector3(s.x, 0, s.z).add(out.clone().multiplyScalar(L.seatOuter + (s.isMe ? 6 : 5)));
      plate.position.set(pp.x, s.isMe ? 1.5 : 6, pp.z);
      this.seatGroup.add(plate);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 0.8), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: s.active ? 0.6 : 0.1 }));
      const bp = new THREE.Vector3(s.x, 0, s.z).add(out.clone().multiplyScalar(L.seatOuter + 1.5));
      bar.position.set(bp.x, 0.2, bp.z); bar.rotation.y = s.rotY;
      this.seatGroup.add(bar);
      if (s.active) {
        const ring = makeHalo(40, L.seatInner + L.seatOuter + 2, color);
        const rc = new THREE.Vector3(s.x, 0, s.z).add(out.clone().multiplyScalar((L.seatOuter - L.seatInner) / 2));
        ring.position.set(rc.x, 0.002, rc.z); ring.rotation.z = s.rotY;
        this.seatGroup.add(ring); this.activeRings.push(ring);
      }
    }
  }

  // ---------------------------------------------------------------- camera
  setCamera(preset = 'table', instant = false, keepUser = false) {
    const L = this.layout; if (!L) return;
    this.camPreset = preset;
    if (!keepUser) this.userCam = false;
    let shift = null;
    const R = L.tableR;
    const rx = L.tableRx || R, rz = L.tableRz || R;
    let target, pos;
    const me = L.seats[L.me];
    if (preset === 'top') { target = new THREE.Vector3(0, 0, 0); ({ pos, shift } = this._fitTable(84, target)); }
    else if (preset === 'me' && me) {
      const out = new THREE.Vector3(Math.cos(me.angle), 0, Math.sin(me.angle));
      target = new THREE.Vector3(me.x, 0, me.z).add(out.clone().multiplyScalar(2)).add(new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(-6));
      pos = target.clone().add(out.multiplyScalar(36)).add(new THREE.Vector3(0, 62, 0));
    }
    else if (preset === 'center') { target = new THREE.Vector3(0, 0, 0); pos = new THREE.Vector3(0, R * 1.05, R * 0.95); }
    else {
      // whole table in the HUD-free area; narrow/portrait tables are seen more from above to use the height
      const a = this.camera.aspect;
      const elev = a < 0.8 ? 68 : a < 1.2 ? 62 : 54;
      target = new THREE.Vector3(0, 0, 0);
      ({ pos, shift } = this._fitTable(elev, target));
      void rx; void rz;
    }
    if (!shift) { const s = this._safeRect(); shift = { x: (-(s.xmin + s.xmax) / 2 / 2) * s.w, y: (((s.ymin + s.ymax) / 2) / 2) * s.h }; }
    this.controls.maxDistance = Math.max(420, pos.distanceTo(target) * 1.8);
    this._applyShift(shift);
    if (instant) { this.camTween = null; this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); return; }
    this.camTween = { fromPos: this.camera.position.clone(), fromT: this.controls.target.clone(), pos, target, t: 0, dur: 700 };
  }

  focusOn(ref) {
    const ent = this.entries.get(ref);
    const zw = this.layout?.zones.get(ref);
    const p = ent ? ent.mesh.position : zw ? new THREE.Vector3(zw.x, 0, zw.z) : null;
    if (!p) return;
    const off = this.camera.position.clone().sub(this.controls.target).setLength(70);
    this.camTween = { fromPos: this.camera.position.clone(), fromT: this.controls.target.clone(), pos: p.clone().add(off), target: p.clone(), t: 0, dur: 650 };
  }

  // ---------------------------------------------------------------- fx
  playFx(list = []) {
    for (const e of list) {
      try { this._fx(e); } catch (err) { console.warn('fx', e, err); }
    }
  }

  _seatPoint(pid) {
    const s = this.layout?.seats.find((x) => x.id === pid);
    if (s) return new THREE.Vector3(s.x * 0.92, 0, s.z * 0.92);
    return new THREE.Vector3(0, 0, (this.layout?.R || 40) * 0.8);
  }

  _fx(e) {
    switch (e.type) {
      case 'roll': return this._roll(e);
      case 'sound': return this.audio?.play(e.name, { vol: e.vol });
      case 'shake': this.shake = Math.max(this.shake, e.strength ?? 0.7); return this.audio?.play(e.sound || 'storm');
      case 'toss': return this._toss(e);
      case 'focus': return e.preset ? this.setCamera(e.preset) : this.focusOn(e.zone || e.id);
      case 'highlight': return this.flash(e.ids || [], e.color || '#7fd3ff', e.ms || 1600);
      case 'reveal': { // cards explicitly marked "everyone sees": shown in the spotlight
        const items = (e.ids || []).map((id) => this.entries.get(id)).filter(Boolean).map((ent) => ({
          id: ent.id, kind: ent.kind, reason: 'reveal', face: ent.spec.face, back: ent.spec.back, size: ent.spec.size, faceUp: ent.kind === 'deck' ? !!ent.spec.faceUp : ent.spec.faceUp !== false,
          toZone: ent.zone, toSeat: this.layout.objects.get(ent.id)?.seat ?? null,
        }));
        return this.onEvent({ type: 'spot', items, by: e.by || null, title: e.title || null, text: e.text || null, explicit: true });
      }
      default: return this.onEvent(e);
    }
  }

  _roll(e) {
    const dice = [];
    for (const d of e.dice || []) {
      let ent = this.entries.get(d.id);
      let temp = false;
      if (!ent || ent.kind !== 'die') {
        const spec = { id: `__temp_${d.id}_${Math.random()}`, kind: 'die', faces: d.faces || 6, value: d.value, size: 1.8 };
        const mesh = makeDie(spec, this.store); this.root.add(mesh);
        ent = { id: spec.id, kind: 'die', spec, mesh, home: null };
        temp = true;
      }
      dice.push({ ent, value: d.value, temp });
    }
    if (!dice.length) return;
    const z = e.zone && this.layout.zones.get(e.zone);
    const homeZone = this.layout.zones.get(dice[0].ent.zone);
    const target = z ? new THREE.Vector3(z.x, 0, z.z) : homeZone ? new THREE.Vector3(homeZone.x, 0, homeZone.z) : dice[0].ent.home ? dice[0].ent.home.pos.clone().setY(0) : new THREE.Vector3();
    const tz = z || homeZone;
    const trayR = Math.max(6, Math.min(22, (tz ? Math.min(tz.w, tz.d) : 20) / 2 - 1.5));
    const origin = e.by ? this._seatPoint(e.by) : target.clone().add(new THREE.Vector3(0, 0, 30));
    if (origin.distanceTo(target) < 12) origin.add(new THREE.Vector3(0, 0, 18));
    const sim = simulateRoll(dice.map((d) => ({ size: Number(d.ent.spec.size) || 1.8, box: !!d.ent.mesh.userData.perm })), { origin, target, trayR });
    dice.forEach((d) => { d.ent.rolling = true; this.tweens = this.tweens.filter((t) => t.obj !== d.ent.mesh); });
    this.audio?.play('dice', { vol: 0.5 });
    const roll = new DiceRoll(dice.map((d) => ({ mesh: d.ent.mesh, value: d.value, isBox: !!d.ent.mesh.userData.perm, size: Number(d.ent.spec.size) || 1.8 })), sim, this.audio, () => {
      dice.forEach((d) => {
        d.ent.rolling = false;
        d.ent.rest = { pos: d.ent.mesh.position.clone(), quat: d.ent.mesh.quaternion.clone() };
        d.ent.home = d.ent.rest;
        const face = d.ent.mesh.userData.faces?.[d.value];
        const txt = face?.text ?? face?.title ?? String(d.value + 1);
        if (txt) this._floatText(txt, d.ent.mesh.position, e.color);
        if (d.temp) setTimeout(() => this._vanish(d.ent.mesh, this.root), 2200);
      });
      this.onEvent({ type: 'rolled', by: e.by || null, values: dice.map((d) => { const f = d.ent.mesh.userData.faces?.[d.value]; return String(f?.text ?? f?.title ?? d.value + 1); }) });
    });
    this.rolls.push(roll);
  }

  _floatText(text, at, color) {
    const sp = makeLabelSprite(text, { height: 2.4, bg: color || 'rgba(200,100,43,.92)' });
    sp.position.copy(at).add(new THREE.Vector3(0, 3, 0));
    this.root.add(sp);
    const y0 = sp.position.y;
    this.tweens.push({ custom: (k) => { sp.position.y = y0 + k * 4; sp.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }, t: 0, dur: 1800, done: () => { sp.removeFromParent(); sp.material.map.dispose(); } });
  }

  _toss(e) {
    const zw = this.layout?.zones.get(e.zone);
    const ent = e.target && this.entries.get(e.target);
    const target = ent ? ent.mesh.position.clone() : zw ? new THREE.Vector3(zw.x, 0, zw.z) : new THREE.Vector3();
    const origin = e.from ? (this.entries.get(e.from)?.mesh.position.clone() || this._seatPoint(e.from)) : new THREE.Vector3(0, 0, 0);
    const n = Math.min(12, e.n || 1);
    for (let i = 0; i < n; i++) {
      const spec = { id: '__toss', kind: 'token', shape: 'disc', count: 1, ...(e.token || {}) };
      const mesh = makeToken(spec, this.store);
      const t = tokenDims(spec);
      const body = new CANNON.Body({ mass: 0.3, shape: new CANNON.Cylinder(t.w / 2, t.w / 2, t.unit, 12), linearDamping: 0.1, angularDamping: 0.2 });
      body.position.set(origin.x + (Math.random() - 0.5) * 3, 8 + i * 0.8, origin.z + (Math.random() - 0.5) * 3);
      const dx = target.x - origin.x, dz = target.z - origin.z; const fl = 0.55;
      body.velocity.set(dx / fl, 18 + Math.random() * 8, dz / fl);
      body.angularVelocity.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
      this.world.addBody(body);
      this.root.add(mesh);
      let hit = false;
      body.addEventListener('collide', (ev) => { const v = Math.abs(ev.contact.getImpactVelocityAlongNormal()); if (v > 20 && !hit) { hit = true; this.audio?.impact(Math.min(1, v / 200), e.sound || 'token'); } });
      this.temps.push({ mesh, body, age: -i * 0.06, life: 1.6 + Math.random() * 0.3 });
    }
  }

  // ---------------------------------------------------------------- picking
  _pick() {
    if (!this.pointer) return null;
    this.ray.setFromCamera(this.mouse, this.camera);
    const hits = this.ray.intersectObjects(this.root.children, true);
    for (const h of hits) { const id = h.object.userData.pickId; if (id && this.entries.has(id)) return id; }
    return null;
  }
  _setHover(id) {
    if (id === this.hoverId) return;
    const prev = this.hoverId && this.entries.get(this.hoverId);
    if (prev && prev.kind === 'card') prev.hoverLift = 0;
    this.hoverId = id;
    const ent = id && this.entries.get(id);
    this.canvas.style.cursor = ent?.spec.click && !ent.spec.disabled ? 'pointer' : ent ? 'help' : '';
    if (ent && ent.kind === 'card') ent.hoverLift = 1.1;
    if (ent?.spec.click && !ent.spec.disabled) this.audio?.play('hover');
    this.onHover(ent ? { id, spec: ent.spec, ...this.pointer } : null);
  }

  // preview (React side shows a large card on hover)
  preview(id) {
    const ent = this.entries.get(id);
    if (!ent) return null;
    const o = ent.spec;
    if (o.kind === 'card' || o.kind === 'deck') {
      const [w, h] = cardSize(o); const s = 520 / Math.max(w, h);
      const up = o.kind === 'deck' ? o.faceUp : o.faceUp !== false;
      return this.store.preview(up ? 'card' : 'back', up ? (o.face || {}) : (o.back || {}), Math.round(w * s), Math.round(h * s));
    }
    if (o.kind === 'board') { const [w, h] = o.size || [30, 20]; const s = 640 / Math.max(w, h); return this.store.preview('board', o.face || {}, Math.round(w * s), Math.round(h * s)); }
    if (o.kind === 'token' && o.face) return this.store.preview('token', o.face, 220, 220);
    return null;
  }

  // ---------------------------------------------------------------- loop
  _frame() {
    // animations advance in real time (slow devices drop frames, no slow motion); physics step is capped
    const rawDt = Math.min(0.25, this.clock.getDelta());
    const dt = Math.min(0.05, rawDt);
    const ms = rawDt * 1000;
    // tweens
    for (const tw of this.tweens) {
      const was = tw.t;
      tw.t += ms;
      if (tw.t < 0) continue; // delayed start (sequential dealing)
      if (was <= 0 && tw.onStart) tw.onStart();
      const k = Math.min(1, tw.t / tw.dur);
      if (tw.custom) { tw.custom(k); } else {
        const e = tw.bounce ? (k < 0.7 ? (k / 0.7) ** 2 : 1 - Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.08) : ease(k);
        tw.obj.position.lerpVectors(tw.from.pos, tw.to.pos, e);
        if (tw.arc) tw.obj.position.y += Math.sin(Math.PI * e) * tw.arc;
        tw.obj.quaternion.slerpQuaternions(tw.from.quat, tw.to.quat, e);
        if (tw.axis) tw.obj.quaternion.premultiply(_tq.setFromAxisAngle(tw.axis, Math.sin(Math.PI * e) * tw.tilt));
      }
      if (k >= 1) { tw.finished = true; tw.done?.(); }
    }
    this.tweens = this.tweens.filter((t) => !t.finished);
    // dice rolls
    for (const r of this.rolls) r.update(rawDt);
    this.rolls = this.rolls.filter((r) => !r.done);
    // tossed tokens (live physics)
    if (this.temps.length) {
      this.world.step(1 / 60, rawDt, 8);
      for (const t of this.temps) {
        t.age += rawDt;
        t.mesh.position.set(t.body.position.x, t.body.position.y - (t.mesh.userData.count ? 0 : 0), t.body.position.z);
        t.mesh.quaternion.set(t.body.quaternion.x, t.body.quaternion.y, t.body.quaternion.z, t.body.quaternion.w);
        if (t.age > t.life && !t.gone) { t.gone = true; this.world.removeBody(t.body); this._vanish(t.mesh, this.root); }
      }
      this.temps = this.temps.filter((t) => !t.gone);
    }
    // decorations: label/halo positions, hover lift, sand timers
    const now = Date.now() + this.serverOffset;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);
    for (const ent of this.entries.values()) {
      const o = ent.spec; const m = ent.mesh;
      if (ent.kind === 'card' && !this.tweens.some((t) => t.obj === m) && ent.home) {
        const target = ent.home.pos.y + (ent.hoverLift || 0);
        m.position.y += (target - m.position.y) * Math.min(1, dt * 12);
      }
      const fp = footprint(o, ent.lay);
      if (ent.label) ent.label.position.set(m.position.x, m.position.y + (ent.kind === 'deck' ? m.scale.y : fp.h) + 1.6, m.position.z);
      if (ent.halo) { ent.halo.position.set(m.position.x, (ent.home?.base ?? 0) + (ent.halo.userData.lift ?? 0.004), m.position.z); ent.halo.rotation.z = new THREE.Euler().setFromQuaternion(m.quaternion, 'YXZ').y; ent.halo.material.opacity = ent.halo.userData.soft ? 0.25 + pulse * 0.3 : 0.55 + pulse * 0.4; }
      if (ent.kind === 'timer' && o.endsAt) {
        const total = (o.duration || 60) * 1000; const left = Math.max(0, o.endsAt - now);
        updateTimer(m, left / total);
        const sec = Math.ceil(left / 1000);
        if (sec !== ent.lastSec) { if (sec <= 5 && sec > 0) this.audio?.play('tick'); if (sec === 0 && ent.lastSec > 0) this.audio?.play('alarm'); ent.lastSec = sec; }
      }
    }
    for (const r of this.activeRings || []) r.material.opacity = 0.1 + pulse * 0.14;
    // hover picking
    if (this.needPick) { this.needPick = false; this._setHover(this._pick()); }
    // camera
    if (this.camTween) {
      const c = this.camTween; c.t += ms; const k = ease(Math.min(1, c.t / c.dur));
      this.camera.position.lerpVectors(c.fromPos, c.pos, k); this.controls.target.lerpVectors(c.fromT, c.target, k);
      if (c.t >= c.dur) this.camTween = null;
    }
    this.controls.update();
    this.env.update(dt, this.camera);
    if (this.shake > 0.001) {
      const s = this.shake * 1.2;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      this.shake *= Math.pow(0.04, dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointermove', this._onMoveEv);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointerleave', this._onLeave);
    this.canvas.removeEventListener('dblclick', this._onDbl);
    this.controls.dispose();
    this.scene.traverse((c) => { if (c.isMesh) { c.geometry?.dispose?.(); } });
    this.store.dispose();
    this.renderer.dispose();
  }
}

export { texSize };
