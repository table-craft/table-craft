// Environment: light presets, background/fog, table surface (procedural or project image), particles.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { shade } from './faces';

export const PRESETS = {
  // lamp: pendant lamp above the table (pool of light); env: reflection environment strength
  tavern: { bg: ['#2a1d14', '#0b0806'], fog: '#120c08', hemi: ['#ffe2b8', '#2a2018', 0.5], key: ['#ffd9a8', 1.5], lamp: ['#ffd49a', 2.6], env: 0.35, fire: '#ff8a3d', exposure: 1.05, ambience: 'fire', surface: 'wood' },
  winter: { bg: ['#1b2a3d', '#05080d'], fog: '#0a1019', hemi: ['#d6e7ff', '#2a3442', 0.7], key: ['#e3eeff', 1.6], lamp: ['#ffe4c0', 2.2], env: 0.4, fire: '#ff7a2e', exposure: 1.1, ambience: 'winter', particles: 'snow', surface: 'darkwood' },
  day: { bg: ['#dfe7ee', '#a9b8c6'], fog: '#b9c6d2', hemi: ['#ffffff', '#8a8f86', 0.75], key: ['#fff6e8', 2.0], lamp: ['#fff8ec', 1.1], env: 0.55, fire: null, exposure: 1.0, ambience: null, surface: 'felt' },
  night: { bg: ['#14182a', '#04050a'], fog: '#080a12', hemi: ['#a9b6ff', '#141420', 0.32], key: ['#c9d4ff', 0.9], lamp: ['#ffd8a8', 2.8], env: 0.3, fire: '#ffb066', exposure: 1.1, ambience: null, surface: 'darkwood' },
  sea: { bg: ['#1d3b52', '#081520'], fog: '#0b1b27', hemi: ['#e6f4ff', '#1d3040', 0.6], key: ['#fff1d6', 1.5], lamp: ['#fff0d8', 2.3], env: 0.4, fire: null, exposure: 1.05, ambience: 'sea', surface: 'felt-blue' },
  forest: { bg: ['#1f2b1d', '#080c07'], fog: '#0d130b', hemi: ['#e8f5d8', '#1b2216', 0.55], key: ['#fff0cf', 1.4], lamp: ['#ffdcae', 2.5], env: 0.35, fire: '#ffa24d', exposure: 1.05, ambience: 'fire', surface: 'wood' },
};

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
function rnd(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

const SURFACE = { wood: '#7a4a2a', darkwood: '#3a2618', felt: '#2f6b48', 'felt-blue': '#2b5a80', 'felt-red': '#7a2e2e', stone: '#6d6f73', snow: '#e9eef4', leather: '#5a3a24', dark: '#23262b' };

export function surfaceTexture(kind, color) {
  const r = rnd(7);
  const base = color || SURFACE[kind] || '#4a4f57';
  const felt = kind.startsWith('felt') || kind === 'dark';
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (kind === 'wood' || kind === 'darkwood') {
      // wood grain: wavy, tone-shifting long lines + knots + seams
      for (let i = 0; i < 160; i++) {
        const dark = r() < 0.75;
        g.strokeStyle = dark ? `rgba(30,14,4,${0.05 + r() * 0.12})` : `rgba(255,214,170,${0.012 + r() * 0.025})`;
        g.lineWidth = dark ? 0.8 + r() * 3.4 : 0.5 + r() * 1.2;
        const y = r() * h; const amp = 6 + r() * 26; const ph = r() * 6;
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / w * Math.PI * 2 + ph) * amp + Math.sin(x / 90 + ph * 3) * 2);
        g.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const kx = r() * w, ky = r() * h;
        for (let k = 1; k < 7; k++) { g.strokeStyle = `rgba(40,20,8,${0.1 - k * 0.012})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(kx, ky, k * 7, k * 2.6, 0, 0, Math.PI * 2); g.stroke(); }
      }
      for (let y = 0; y < h; y += h / 5) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, w, 2); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y + 2, w, 1); }
    } else if (kind === 'stone') {
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
    } else if (kind === 'snow') {
      for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() < 0.6 ? '180,200,225' : '255,255,255'},${r() * 0.25})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 5, 0, 7); g.fill(); }
    } else if (felt) {
      // felt: broad soft blotches + many short, randomly oriented fibers
      for (let i = 0; i < 40; i++) {
        const x = r() * w, y = r() * h, rad = 60 + r() * 180;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        const c = r() < 0.5 ? '0,0,0' : '255,255,255';
        gr.addColorStop(0, `rgba(${c},${0.015 + r() * 0.02})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr;
        // seamless tiling: blotches crossing an edge continue on the opposite edge
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          if (x + ox + rad < 0 || x + ox - rad > w || y + oy + rad < 0 || y + oy - rad > h) continue;
          g.save(); g.translate(ox, oy); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
        }
      }
      g.lineCap = 'round';
      for (let i = 0; i < 26000; i++) {
        const x = r() * w, y = r() * h, a = r() * Math.PI, l = 1.5 + r() * 4;
        g.strokeStyle = `rgba(${r() < 0.6 ? '0,0,0' : '255,255,255'},${0.015 + r() * 0.035})`; g.lineWidth = 0.6 + r() * 0.8;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    } else {
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.05})`; g.fillRect(r() * w, r() * h, 1, 1 + r() * 2); }
    }
  }, kind === 'wood' || kind === 'darkwood' ? 2 : 3);
}

// subtle bump map for felt/wood (texture feel with light angle)
function bumpTexture(kind) {
  const r = rnd(11);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    if (kind === 'wood' || kind === 'darkwood') {
      for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${0.08 + r() * 0.1})`; g.lineWidth = 1 + r() * 2; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 20, w * 0.7, y + (r() - 0.5) * 20, w, y); g.stroke(); }
    } else {
      for (let i = 0; i < 30000; i++) { const v = Math.floor(r() * 255); g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(r() * w, r() * h, 1 + r(), 1 + r()); }
    }
  }, 3);
}

// floor: rug + wood fading into darkness away from the table
function floorTexture(fog) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = shade(fog, 0.06); g.fillRect(0, 0, w, h);
    const r = rnd(3);
    for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(0,0,0,${0.06 + r() * 0.1})`; g.lineWidth = 1 + r() * 3; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 20); g.stroke(); }
    // rug
    const rug = g.createRadialGradient(w / 2, h / 2, w * 0.05, w / 2, h / 2, w * 0.36);
    rug.addColorStop(0, shade(fog, 0.22)); rug.addColorStop(0.8, shade(fog, 0.14)); rug.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rug; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.36, h * 0.3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,220,170,.06)'; g.lineWidth = 6; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.32, h * 0.26, 0, 0, Math.PI * 2); g.stroke();
    // edge vignette
    const v = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.5);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.85)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.group = new THREE.Group(); scene.add(this.group);
    this.key = null; this.tableKey = null; this.fires = []; this.particles = null; this.t = 0;
    // reflection environment: cards, tokens and varnished rim shine realistically
    const pm = new THREE.PMREMGenerator(renderer);
    this.envMap = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pm.dispose();
    scene.environment = this.envMap;
    this.envIntensity = 0.4;
  }

  // sets reflection strength of all scene materials per preset (new objects are set by world)
  tune(obj) {
    const k = this.envIntensity;
    obj.traverse((c) => {
      if (!c.isMesh) return;
      for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
        if (m && 'envMapIntensity' in m && !m.userData.envFixed) { m.userData.envBase ??= m.envMapIntensity ?? 1; m.envMapIntensity = m.userData.envBase * k; }
      }
    });
  }

  // dims: { rx, rz, r } — table half width/depth (cm) or circle radius
  apply(env = {}, table = {}, dims, assets, store) {
    const presetName = env.preset || 'tavern';
    const p = { ...(PRESETS[presetName] || PRESETS.tavern), ...env };
    const key = JSON.stringify([presetName, env]);
    if (key !== this.key) {
      this.key = key;
      this.envIntensity = p.env ?? 0.4;
      this._lights(p);
      this._background(p);
      this._particles(p.particles === undefined ? PRESETS[presetName]?.particles : p.particles);
      this.renderer.toneMappingExposure = p.exposure || 1;
    }
    const tkey = JSON.stringify([table, Math.round(dims.rx), Math.round(dims.rz), Math.round(dims.r), presetName, Object.keys(assets || {}).length]);
    if (tkey !== this.tableKey) { this.tableKey = tkey; this._table(table, dims, p.surface, assets, store, p); }
    if (this.lamp) this._aimLamp(dims, table.shape === 'round');
    this.preset = p;
    return p;
  }

  _clear(name) { const old = this[name]; if (old) { this.group.remove(old); old.traverse?.((c) => { c.geometry?.dispose?.(); }); } this[name] = null; }

  _lights(p) {
    this._clear('lights');
    const g = new THREE.Group();
    const [sky, ground, hi] = p.hemi;
    g.add(new THREE.HemisphereLight(new THREE.Color(sky), new THREE.Color(ground), hi));
    const key = new THREE.DirectionalLight(new THREE.Color(p.key[0]), p.key[1]);
    key.position.set(60, 160, 90); key.castShadow = true;
    key.shadow.mapSize.set(this.quality === 'low' ? 1024 : 2048, this.quality === 'low' ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 420 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    g.add(key);
    this.keyLight = key;
    // pendant lamp: warm pool of light at table center, soft falloff toward the edges
    const [lc, li] = p.lamp || ['#ffe0b0', 2];
    const lamp = new THREE.SpotLight(new THREE.Color(lc), li * 3000, 0, Math.PI / 5, 0.75, 1.6);
    lamp.position.set(0, 230, 25);
    lamp.target.position.set(0, 0, 0);
    g.add(lamp); g.add(lamp.target);
    this.lamp = lamp; this.lampBase = lamp.intensity;
    this.fires = [];
    if (p.fire) {
      for (const [x, z] of [[-140, -90], [150, -60]]) {
        const l = new THREE.PointLight(new THREE.Color(p.fire), 2.2, 520, 1.2);
        l.position.set(x, 60, z); g.add(l); this.fires.push({ l, base: 2.2, seed: Math.random() * 100 });
      }
    }
    this.lights = g; this.group.add(g);
  }

  _background(p) {
    const [top, bottom] = p.bg;
    this.scene.background = canvasTex(16, 512, (g, w, h) => { const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, top); grd.addColorStop(1, bottom); g.fillStyle = grd; g.fillRect(0, 0, w, h); });
    this.scene.fog = new THREE.Fog(new THREE.Color(p.fog), 380, 900);
  }

  _particles(kind) {
    this._clear('particles');
    if (!kind) return;
    const n = kind === 'snow' ? 1400 : 300;
    const pos = new Float32Array(n * 3); const vel = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 700; pos[i * 3 + 1] = Math.random() * 300; pos[i * 3 + 2] = (Math.random() - 0.5) * 700; vel[i] = 0.5 + Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = canvasTex(32, 32, (c, w) => { const r = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.fillRect(0, 0, w, w); });
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: kind === 'snow' ? 1.6 : 1.2, map: dot, transparent: true, depthWrite: false, color: kind === 'snow' ? 0xffffff : 0xffa040, opacity: kind === 'snow' ? 0.85 : 0.9, blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending }));
    m.userData = { kind, vel };
    this.particles = m; this.group.add(m);
  }

  _aimLamp(dims, round) {
    const R = round ? dims.r : Math.hypot(dims.rx, dims.rz);
    const hgt = Math.max(160, R * 2.4);
    this.lamp.position.set(0, hgt, R * 0.12);
    this.lamp.angle = Math.min(Math.PI / 3, Math.atan((R * 1.25) / hgt));
    this.lamp.intensity = this.lampBase * (hgt / 230) ** 1.6;
  }

  _table(table, dims, surface, assets, store, preset = {}) {
    this._clear('tableMesh');
    const g = new THREE.Group();
    const kind = table.surface || surface || 'wood';
    let topTex;
    if (table.image && assets?.[table.image]) topTex = store.texture('board', { image: table.image }, 1024, 1024);
    else topTex = surfaceTexture(kind, table.color);
    const rimTex = surfaceTexture('darkwood', table.rim);
    const round = table.shape === 'round';
    const rx = round ? dims.r : dims.rx, rz = round ? dims.r : dims.rz;
    // world-UV (cm) surface: texture repeats every ~90 cm
    const uvTex = (t, cm) => { if (table.image) { t.repeat.set(1 / (rx * 2), 1 / (rz * 2)); t.offset.set(0.5, 0.5); } else { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / cm, 1 / cm); } return t; };
    const shapeOf = (hx, hz) => {
      const sh = new THREE.Shape();
      if (round) { sh.absarc(0, 0, hx, 0, Math.PI * 2, false); return sh; }
      const r = Math.min(hx, hz) * (table.corner ?? 0.35);
      sh.moveTo(-hx + r, -hz); sh.lineTo(hx - r, -hz); sh.quadraticCurveTo(hx, -hz, hx, -hz + r); sh.lineTo(hx, hz - r);
      sh.quadraticCurveTo(hx, hz, hx - r, hz); sh.lineTo(-hx + r, hz); sh.quadraticCurveTo(-hx, hz, -hx, hz - r); sh.lineTo(-hx, -hz + r); sh.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
      return sh;
    };
    const slab = (hx, hz, depth, mats) => {
      const geo = new THREE.ExtrudeGeometry(shapeOf(hx, hz), { depth, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.8, bevelSegments: 3, curveSegments: 48 });
      geo.rotateX(-Math.PI / 2); // shape lies on the XZ plane, thickness +y
      const m = new THREE.Mesh(geo, mats); m.receiveShadow = true; m.castShadow = false;
      return m;
    };
    const isFelt = kind.startsWith('felt') || kind === 'dark';
    const bump = table.image ? null : uvTex(bumpTexture(kind), isFelt ? 40 : 90);
    if (bump) { bump.colorSpace = THREE.NoColorSpace; bump.needsUpdate = true; }
    const topMat = new THREE.MeshStandardMaterial({ map: uvTex(topTex.clone(), isFelt ? 120 : 90), roughness: isFelt ? 0.97 : 0.55, metalness: 0.0, bumpMap: bump, bumpScale: isFelt ? 0.5 : 0.25, envMapIntensity: isFelt ? 0.12 : 0.5 });
    topMat.map.needsUpdate = true;
    // varnished dark wood frame
    const rimMat = new THREE.MeshPhysicalMaterial({ map: uvTex(rimTex.clone(), 60), roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.25, envMapIntensity: 0.9 });
    rimMat.map.needsUpdate = true;
    const top = slab(rx, rz, 2.2, [topMat, rimMat]); top.position.y = -3; g.add(top); // top face y = 0
    const rim = slab(rx + 3.2, rz + 3.2, 3.2, [rimMat, rimMat]); rim.position.y = -4.6; g.add(rim);
    const legMat = new THREE.MeshStandardMaterial({ map: rimTex, roughness: 0.55 });
    if (round) { const ped = new THREE.Mesh(new THREE.CylinderGeometry(rx * 0.12, rx * 0.3, 70, 32), legMat); ped.position.y = -40; g.add(ped); }
    else for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(7, 70, 7), legMat); leg.position.set(x * (rx - 12), -40, z * (rz - 12)); g.add(leg); }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ map: floorTexture(preset.fog || this.preset?.fog || '#1a1410'), color: 0x3a3a3a, roughness: 0.95, envMapIntensity: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -75; floor.receiveShadow = true; g.add(floor);
    g.traverse((c) => { if (c.isMesh) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.userData.envFixed = true; }); });
    this.tableMesh = g; this.group.add(g);
  }

  setQuality(q) {
    this.quality = q;
    if (this.keyLight) { const n = q === 'low' ? 1024 : 2048; this.keyLight.shadow.mapSize.set(n, n); this.keyLight.shadow.map?.dispose(); this.keyLight.shadow.map = null; }
  }

  update(dt, camera) {
    this.t += dt;
    for (const f of this.fires) f.l.intensity = f.base * (0.82 + 0.18 * Math.sin(this.t * 7 + f.seed) * Math.sin(this.t * 13.3 + f.seed * 2) + 0.08 * Math.random());
    const pm = this.particles;
    if (pm) {
      const a = pm.geometry.attributes.position; const v = pm.userData.vel; const snow = pm.userData.kind === 'snow';
      for (let i = 0; i < v.length; i++) {
        let y = a.array[i * 3 + 1] + (snow ? -v[i] * 9 : v[i] * 12) * dt;
        a.array[i * 3] += Math.sin(this.t * 0.6 + i) * dt * (snow ? 3 : 1.5);
        if (snow && y < -70) y = 300; if (!snow && y > 300) y = -70;
        a.array[i * 3 + 1] = y;
      }
      a.needsUpdate = true;
      if (camera) pm.position.set(camera.position.x * 0.3, 0, camera.position.z * 0.3);
    }
  }

  dispose() { this.scene.remove(this.group); this.envMap?.dispose(); }
}
