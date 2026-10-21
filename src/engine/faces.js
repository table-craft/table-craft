// Card / token / die / board faces, drawn with canvas. If face.image resolves to a project image (asset key) or URL
// it is used; otherwise a deterministic "default" illustration is generated from title + color.
import * as THREE from 'three';
import { UI_FONT, SERIF_FONT, fontsReady } from './fonts';

const PAPER = '#f2efe6';
const INK = '#1f2328';
const imgs = new Map(); // url -> { img, ok, fail, waiters:Set<fn> }

export function resolveImage(assets, ref) {
  if (!ref || typeof ref !== 'string') return null;
  if (assets && assets[ref]) return assets[ref];
  if (/^(https?:|\/|data:|blob:)/.test(ref)) return ref;
  return null;
}

function loadImage(url, cb) {
  let e = imgs.get(url);
  if (!e) {
    e = { img: new Image(), ok: false, fail: false, waiters: new Set() };
    e.img.crossOrigin = 'anonymous';
    e.img.onload = () => { e.ok = true; e.waiters.forEach((f) => f()); e.waiters.clear(); };
    e.img.onerror = () => { e.fail = true; e.waiters.clear(); };
    e.img.src = url;
    imgs.set(url, e);
  }
  if (!e.ok && !e.fail && cb) e.waiters.add(cb);
  return e.ok ? e.img : null;
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function shade(hex, f) {
  const c = new THREE.Color(hex || '#888');
  if (f < 0) c.lerp(new THREE.Color('#000'), -f); else c.lerp(new THREE.Color('#fff'), f);
  return `#${c.getHexString()}`;
}
function readable(bg) { const c = new THREE.Color(bg); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 0.6 ? INK : '#fff'; }

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function cover(g, img, x, y, w, h, focus = 0.5) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) * focus, sw, sh, x, y, w, h);
}

// splits text into lines, fitting it in the box (shrinking the font)
export function fitText(g, text, x, y, w, h, { max = 30, min = 9, weight = 400, family, color = INK, align = 'left', italic = false, lineH = 1.22, valign = 'top', shadow = null } = {}) {
  const fam = family || UI_FONT;
  const paras = String(text ?? '').split('\n');
  let size = Math.floor(max); let lines = [];
  for (; size >= min; size -= 1) {
    g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${fam}`;
    lines = [];
    for (const para of paras) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const wd of words) {
        const t = line ? `${line} ${wd}` : wd;
        if (g.measureText(t).width > w && line) { lines.push(line); line = wd; } else line = t;
      }
      lines.push(line);
    }
    if (lines.length * size * lineH <= h && lines.every((l) => g.measureText(l).width <= w)) break;
  }
  g.save();
  g.fillStyle = color; g.textBaseline = 'top'; g.textAlign = align;
  if (shadow) { g.shadowColor = shadow; g.shadowBlur = size * 0.25; g.shadowOffsetY = size * 0.06; }
  const total = lines.length * size * lineH;
  let yy = valign === 'middle' ? y + (h - total) / 2 : valign === 'bottom' ? y + h - total : y;
  yy += size * (lineH - 1) * 0.5;
  const xx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
  for (const l of lines) { if (yy + size > y + h + size * 0.35) break; g.fillText(l, xx, yy); yy += size * lineH; }
  g.restore();
  return size;
}

// ---------------------------------------------------------------- default illustration
// no image: deterministic calm landscape/pattern from the title + initial medallion
function placeholderArt(g, x, y, w, h, seedStr, color, icon) {
  const r = rng(hash(seedStr || 'x'));
  const base = color || `hsl(${Math.floor(r() * 360)}, 34%, 44%)`;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const grd = g.createLinearGradient(x, y, x, y + h);
  grd.addColorStop(0, shade(base, 0.55)); grd.addColorStop(0.55, shade(base, 0.12)); grd.addColorStop(1, shade(base, -0.3));
  g.fillStyle = grd; g.fillRect(x, y, w, h);
  // soft light source
  const sx = x + w * (0.25 + r() * 0.5), sy = y + h * (0.2 + r() * 0.2);
  const sun = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.6);
  sun.addColorStop(0, 'rgba(255,248,230,.55)'); sun.addColorStop(1, 'rgba(255,248,230,0)');
  g.fillStyle = sun; g.fillRect(x, y, w, h);
  const kind = Math.floor(r() * 3);
  if (kind === 0) { // layered hills (aerial perspective)
    for (let k = 0; k < 4; k++) {
      g.fillStyle = shade(base, 0.25 - k * 0.17); g.globalAlpha = 0.55 + k * 0.12;
      g.beginPath(); g.moveTo(x, y + h);
      const baseY = y + h * (0.5 + k * 0.12);
      let px = x; g.lineTo(px, baseY);
      while (px < x + w) { const nx = px + w * (0.12 + r() * 0.18); g.quadraticCurveTo((px + nx) / 2, baseY - h * (0.06 + r() * 0.22), nx, baseY - h * r() * 0.05); px = nx; }
      g.lineTo(x + w, y + h); g.closePath(); g.fill();
    }
  } else if (kind === 1) { // concentric rings
    g.strokeStyle = shade(base, 0.6); g.lineWidth = Math.max(1, w * 0.01); g.globalAlpha = 0.35;
    const cx = x + w * (0.3 + r() * 0.4), cy = y + h * (0.35 + r() * 0.3);
    for (let k = 1; k < 10; k++) { g.beginPath(); g.arc(cx, cy, k * w * 0.075, 0, Math.PI * 2); g.stroke(); }
  } else { // waves
    g.strokeStyle = shade(base, 0.55); g.lineWidth = Math.max(1, w * 0.009); g.globalAlpha = 0.32;
    for (let k = 0; k < 9; k++) {
      const yy = y + h * (0.2 + k * 0.09); g.beginPath(); g.moveTo(x, yy);
      for (let px = 0; px <= w; px += w / 12) g.lineTo(x + px, yy + Math.sin(px / w * Math.PI * 3 + k) * h * 0.025);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  // initial medallion
  const glyph = icon || (seedStr || '?').trim().charAt(0).toLocaleUpperCase('tr');
  const R = Math.min(w, h) * 0.24; const cx = x + w / 2, cy = y + h / 2;
  g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(1.5, R * 0.05); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.floor(R * 1.15)}px ${SERIF_FONT}`;
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = R * 0.2;
  g.fillText(glyph, cx, cy + R * 0.05);
  g.restore();
  // bottom shadow: depth
  const sh = g.createLinearGradient(0, y + h * 0.7, 0, y + h);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = sh; g.fillRect(x, y + h * 0.7, w, h * 0.3);
}

function paperNoise(g, w, h, seed, alpha = 0.05) {
  const r = rng(seed);
  g.save(); g.globalAlpha = alpha;
  for (let i = 0; i < 420; i++) { g.fillStyle = r() < 0.5 ? '#000' : '#fff'; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  g.restore();
}

// paper: warm ground darkening slightly toward the edges
function paper(g, W, H, bg, seed) {
  g.fillStyle = bg || PAPER; g.fillRect(0, 0, W, H);
  const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(255,255,255,.28)'); v.addColorStop(1, 'rgba(90,70,40,.12)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  paperNoise(g, W, H, seed, 0.03);
}

function badge(g, cx, cy, rad, spec, accent, fam, assets, redraw) {
  const s = typeof spec === 'object' && spec ? spec : { text: String(spec) };
  const col = s.color || accent;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = rad * 0.3; g.shadowOffsetY = rad * 0.08;
  g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2);
  const fill = g.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.1, cx, cy, rad);
  fill.addColorStop(0, shade(col, 0.28)); fill.addColorStop(1, shade(col, -0.12));
  g.fillStyle = fill; g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = rad * 0.13; g.strokeStyle = 'rgba(255,255,255,.92)'; g.stroke();
  g.beginPath(); g.arc(cx, cy, rad * 1.065, 0, Math.PI * 2); g.lineWidth = rad * 0.05; g.strokeStyle = 'rgba(0,0,0,.25)'; g.stroke();
  const img = s.icon && resolveImage(assets, s.icon) ? loadImage(resolveImage(assets, s.icon), redraw) : null;
  if (img) { g.save(); g.beginPath(); g.arc(cx, cy, rad * 0.86, 0, Math.PI * 2); g.clip(); g.globalAlpha = 0.45; cover(g, img, cx - rad, cy - rad, rad * 2, rad * 2); g.restore(); }
  const fg = readable(col);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (fg === '#fff') { g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = rad * 0.12; }
  const main = String(s.text ?? '');
  g.font = `800 ${Math.floor(rad * (main.length > 2 ? 0.72 : main.length > 1 ? 0.9 : 1.05))}px ${fam}`;
  g.fillText(main, cx, cy - (s.sub ? rad * 0.16 : 0) + rad * 0.04);
  if (s.sub) { g.font = `700 ${Math.floor(rad * 0.4)}px ${fam}`; g.fillText(s.sub, cx, cy + rad * 0.5); }
  g.restore();
}

// ---------------------------------------------------------------- card front
export function drawCard(g, W, H, face, ctx) {
  const f = typeof face === 'string' ? { title: face } : (face || {});
  const fam = ctx.font || UI_FONT;
  const serif = ctx.serif || SERIF_FONT;
  const accent = f.color || '#5b6470';
  const R = W * 0.05;
  g.clearRect(0, 0, W, H);
  g.save(); rr(g, 0, 0, W, H, R); g.clip();
  paper(g, W, H, f.bg, hash(f.title || 'c'));
  const url = resolveImage(ctx.assets, f.image);
  const img = url ? loadImage(url, ctx.redraw) : null;
  if (f.fit === 'full') {
    if (img) cover(g, img, 0, 0, W, H); else placeholderArt(g, 0, 0, W, H, f.title, accent, f.icon);
    if (f.title && f.titleOnFull !== false) {
      const gy = H * 0.78;
      const sh = g.createLinearGradient(0, gy, 0, H);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.35, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,.78)');
      g.fillStyle = sh; g.fillRect(0, gy, W, H - gy);
      fitText(g, f.title, W * 0.07, H * 0.845, W * 0.86, H * 0.12, { max: W * 0.095, min: 10, weight: 700, color: '#fff', align: 'center', valign: 'middle', family: serif, shadow: 'rgba(0,0,0,.6)' });
    }
  } else {
    const pad = W * 0.05;
    // title band: gradient + bottom highlight line
    const hb = H * 0.12;
    const bandH = hb + pad * 0.6;
    const band = g.createLinearGradient(0, 0, 0, bandH);
    band.addColorStop(0, shade(accent, 0.14)); band.addColorStop(1, shade(accent, -0.14));
    g.fillStyle = band; g.fillRect(0, 0, W, bandH);
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(0, bandH - Math.max(2, H * 0.005), W, Math.max(2, H * 0.005));
    const hasTL = f.corners?.tl != null; const hasTR = f.corners?.tr != null;
    const side = (hasTL || hasTR) ? W * 0.2 : pad;
    const tc = readable(accent);
    fitText(g, f.title || '', side, pad * 0.45, W - side * 2, hb, { max: W * 0.098, min: 10, weight: 700, color: tc, align: 'center', valign: 'middle', family: serif, shadow: tc === '#fff' ? 'rgba(0,0,0,.45)' : null });
    // illustration window (rounded corners + inner shadow)
    const ax = pad * 0.6, aw = W - pad * 1.2;
    const ay = bandH + pad * 0.35, ah = H * (f.text || f.chips ? 0.4 : 0.6);
    const ar = W * 0.025;
    g.save(); rr(g, ax, ay, aw, ah, ar); g.clip();
    if (img) cover(g, img, ax, ay, aw, ah, f.focus ?? 0.45); else placeholderArt(g, ax, ay, aw, ah, f.title, accent, f.icon);
    const ins = g.createLinearGradient(0, ay, 0, ay + ah * 0.18);
    ins.addColorStop(0, 'rgba(0,0,0,.22)'); ins.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ins; g.fillRect(ax, ay, aw, ah * 0.18);
    g.restore();
    g.strokeStyle = shade(accent, -0.35); g.lineWidth = W * 0.007; rr(g, ax, ay, aw, ah, ar); g.stroke();
    let y = ay + ah + pad * 0.4;
    if (f.subtitle) {
      const sh = H * 0.058;
      g.fillStyle = shade(accent, 0.8); rr(g, pad * 0.9, y, W - pad * 1.8, sh, sh / 2); g.fill();
      g.strokeStyle = shade(accent, 0.45); g.lineWidth = W * 0.004; g.stroke();
      fitText(g, f.subtitle, pad * 1.4, y, W - pad * 2.8, sh, { max: W * 0.048, min: 8, weight: 700, color: shade(accent, -0.5), align: 'center', valign: 'middle', family: fam });
      y += sh + pad * 0.35;
    }
    const chipsH = f.chips?.length ? H * 0.085 : 0;
    const footH = f.footer ? H * 0.05 : 0;
    const textH = H - y - chipsH - footH - pad * 0.9;
    if (f.text || f.flavor) {
      const flavorH = f.flavor ? Math.min(textH * 0.32, H * 0.09) : 0;
      if (f.text) fitText(g, f.text, pad, y, W - pad * 2, textH - flavorH, { max: W * 0.066, min: 8, weight: 500, color: f.ink || INK, family: fam, align: f.align || 'left', lineH: 1.24 });
      if (f.flavor) fitText(g, f.flavor, pad, y + textH - flavorH, W - pad * 2, flavorH, { max: W * 0.047, min: 7, italic: true, weight: 400, color: '#5f5a52', family: serif, valign: 'bottom', align: 'center' });
    }
    if (chipsH) {
      const cy = H - chipsH - footH - pad * 0.45;
      const n = f.chips.length; const cw = Math.min(W * 0.28, (W - pad * 2 - (n - 1) * pad * 0.3) / n);
      let cx = (W - (n * cw + (n - 1) * pad * 0.3)) / 2;
      for (const c of f.chips) {
        const chip = typeof c === 'object' ? c : { label: String(c) };
        const cc = chip.color || shade(accent, 0.2);
        const cg = g.createLinearGradient(0, cy, 0, cy + chipsH);
        cg.addColorStop(0, shade(cc, 0.12)); cg.addColorStop(1, shade(cc, -0.1));
        g.fillStyle = cg; rr(g, cx, cy, cw, chipsH, chipsH * 0.45); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = W * 0.004; g.stroke();
        const ic = chip.icon && resolveImage(ctx.assets, chip.icon) ? loadImage(resolveImage(ctx.assets, chip.icon), ctx.redraw) : null;
        let tx = cx;
        if (ic) { g.save(); g.beginPath(); g.arc(cx + chipsH / 2, cy + chipsH / 2, chipsH * 0.4, 0, 7); g.clip(); cover(g, ic, cx + chipsH * 0.1, cy + chipsH * 0.1, chipsH * 0.8, chipsH * 0.8); g.restore(); tx = cx + chipsH * 0.8; }
        fitText(g, chip.label, tx + 4, cy, cw - (tx - cx) - 8, chipsH, { max: chipsH * 0.55, min: 7, weight: 800, color: readable(cc), align: 'center', valign: 'middle', family: fam });
        cx += cw + pad * 0.3;
      }
    }
    if (footH) {
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(pad * 2, H - footH - pad * 0.55, W - pad * 4, Math.max(1, H * 0.002));
      fitText(g, f.footer, pad, H - footH - pad * 0.35, W - pad * 2, footH, { max: W * 0.042, min: 7, weight: 600, color: '#6a645b', align: 'center', valign: 'middle', family: fam });
    }
  }
  // corner badges
  const rad = W * 0.088;
  const C = f.corners || {};
  const bacc = shade(accent, -0.35);
  if (C.tl != null) badge(g, rad * 1.18, rad * 1.18, rad, C.tl, bacc, fam, ctx.assets, ctx.redraw);
  if (C.tr != null) badge(g, W - rad * 1.18, rad * 1.18, rad, C.tr, bacc, fam, ctx.assets, ctx.redraw);
  if (C.bl != null) badge(g, rad * 1.18, H - rad * 1.18, rad, C.bl, bacc, fam, ctx.assets, ctx.redraw);
  if (C.br != null) badge(g, W - rad * 1.18, H - rad * 1.18, rad, C.br, bacc, fam, ctx.assets, ctx.redraw);
  g.restore();
  // double frame: dark outer line + thin light inner line
  const lw = W * 0.022;
  g.lineWidth = lw; g.strokeStyle = f.border || shade(accent, -0.2);
  rr(g, lw / 2, lw / 2, W - lw, H - lw, R); g.stroke();
  g.lineWidth = W * 0.005; g.strokeStyle = 'rgba(255,255,255,.45)';
  rr(g, lw * 1.1, lw * 1.1, W - lw * 2.2, H - lw * 2.2, R * 0.75); g.stroke();
}

// ---------------------------------------------------------------- card back
export function drawBack(g, W, H, face, ctx) {
  const f = typeof face === 'string' ? { title: face } : (face || {});
  const accent = f.color || '#3a4350';
  const serif = ctx.serif || SERIF_FONT;
  const R = W * 0.05;
  g.clearRect(0, 0, W, H);
  g.save(); rr(g, 0, 0, W, H, R); g.clip();
  const url = resolveImage(ctx.assets, f.image);
  const img = url ? loadImage(url, ctx.redraw) : null;
  if (img) cover(g, img, 0, 0, W, H);
  else {
    const grd = g.createRadialGradient(W / 2, H * 0.42, W * 0.05, W / 2, H / 2, H * 0.72);
    grd.addColorStop(0, shade(accent, 0.28)); grd.addColorStop(1, shade(accent, -0.42));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // diamond lattice
    g.strokeStyle = 'rgba(255,255,255,.09)'; g.lineWidth = W * 0.005;
    const step = W * 0.085;
    for (let k = -H; k < W + H; k += step) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H, H); g.stroke(); g.beginPath(); g.moveTo(k, H); g.lineTo(k + H, 0); g.stroke(); }
    const gold = shade(accent, 0.62);
    g.strokeStyle = gold; g.globalAlpha = 0.75; g.lineWidth = W * 0.012;
    rr(g, W * 0.07, H * 0.05, W * 0.86, H * 0.9, R * 0.8); g.stroke();
    g.lineWidth = W * 0.004; rr(g, W * 0.1, H * 0.072, W * 0.8, H * 0.856, R * 0.6); g.stroke();
    g.globalAlpha = 1;
    // center medallion
    const mr = W * 0.24, mx = W / 2, my = H * (f.title ? 0.4 : 0.5);
    const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, shade(accent, 0.18)); mg.addColorStop(1, shade(accent, -0.3));
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = gold; g.lineWidth = W * 0.012; g.stroke();
    g.beginPath(); g.arc(mx, my, mr * 0.84, 0, Math.PI * 2); g.lineWidth = W * 0.004; g.stroke();
    const glyph = f.icon || (f.title || '✦').trim().charAt(0).toLocaleUpperCase('tr');
    g.fillStyle = 'rgba(255,255,255,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.floor(mr * 1.05)}px ${serif}`;
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = mr * 0.15;
    g.fillText(glyph, mx, my + mr * 0.05);
    g.shadowColor = 'transparent';
  }
  if (f.title) {
    const py = H * 0.66, ph = H * 0.12;
    g.fillStyle = 'rgba(0,0,0,.42)'; rr(g, W * 0.13, py, W * 0.74, ph, ph / 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = W * 0.004; g.stroke();
    fitText(g, f.title, W * 0.16, py, W * 0.68, ph, { max: W * 0.085, min: 9, weight: 800, color: '#fff', align: 'center', valign: 'middle', family: serif, shadow: 'rgba(0,0,0,.5)' });
  }
  g.restore();
  g.lineWidth = W * 0.022; g.strokeStyle = f.border || shade(accent, -0.5);
  rr(g, g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth, R); g.stroke();
}

// ---------------------------------------------------------------- token / die / board
export function drawTokenTop(g, S, face, ctx, { round = true, color = '#888' } = {}) {
  const f = typeof face === 'string' ? { text: face } : (face || {});
  const bg = f.bg || color;
  g.clearRect(0, 0, S, S);
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const grd = g.createRadialGradient(S * 0.35, S * 0.3, S * 0.05, S / 2, S / 2, S * 0.7);
  grd.addColorStop(0, 'rgba(255,255,255,.25)'); grd.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const url = resolveImage(ctx.assets, f.image);
  const img = url ? loadImage(url, ctx.redraw) : null;
  g.save();
  if (round) { g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); g.clip(); } else { g.beginPath(); g.rect(S * 0.1, S * 0.1, S * 0.8, S * 0.8); g.clip(); }
  if (img) cover(g, img, S * 0.08, S * 0.08, S * 0.84, S * 0.84);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = S * 0.035;
  if (round) { g.beginPath(); g.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2); g.stroke(); } else g.strokeRect(S * 0.08, S * 0.08, S * 0.84, S * 0.84);
  const label = f.text ?? f.title ?? f.icon;
  if (!img && label != null) fitText(g, String(label), S * 0.14, S * 0.14, S * 0.72, S * 0.72, { max: S * 0.48, min: 10, weight: 800, color: f.ink || readable(bg), align: 'center', valign: 'middle', family: ctx.serif || SERIF_FONT });
}

export function drawDieFace(g, S, face, ctx, { color = '#f4f1ea', ink = '#1f2328' } = {}) {
  const f = typeof face === 'object' && face ? face : { text: String(face ?? '') };
  const bg = f.bg || color;
  g.fillStyle = shade(bg, -0.25); g.fillRect(0, 0, S, S);
  g.fillStyle = bg; rr(g, S * 0.04, S * 0.04, S * 0.92, S * 0.92, S * 0.16); g.fill();
  const url = resolveImage(ctx.assets, f.image);
  const img = url ? loadImage(url, ctx.redraw) : null;
  const txt = f.text ?? f.title ?? '';
  if (/^[1-6]$/.test(txt) && f.pips !== false && !img) {
    const n = +txt; const P = { 1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.26, 0.26], [0.5, 0.5], [0.74, 0.74]], 4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
      5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]], 6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]] }[n];
    g.fillStyle = f.ink || ink;
    for (const [px, py] of P) { g.beginPath(); g.arc(px * S, py * S, S * 0.085, 0, Math.PI * 2); g.fill(); }
    return;
  }
  if (img) { g.save(); rr(g, S * 0.14, S * 0.1, S * 0.72, S * (txt ? 0.58 : 0.78), S * 0.1); g.clip(); cover(g, img, S * 0.14, S * 0.1, S * 0.72, S * (txt ? 0.58 : 0.78)); g.restore(); }
  if (txt) fitText(g, txt, S * 0.08, img ? S * 0.68 : S * 0.1, S * 0.84, img ? S * 0.26 : S * 0.8, { max: img ? S * 0.2 : S * 0.42, min: 8, weight: 800, color: f.ink || ink, align: 'center', valign: 'middle', family: ctx.font });
}

export function drawBoard(g, W, H, face, ctx) {
  const f = typeof face === 'string' ? { title: face } : (face || {});
  const accent = f.color || '#4a4f57';
  const url = resolveImage(ctx.assets, f.image);
  const img = url ? loadImage(url, ctx.redraw) : null;
  if (img) cover(g, img, 0, 0, W, H);
  else {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, shade(accent, 0.2)); grd.addColorStop(1, shade(accent, -0.3));
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    paperNoise(g, W, H, hash(f.title || 'b'), 0.06);
  }
  if (f.tint) { g.fillStyle = f.tint; g.fillRect(0, 0, W, H); }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(4, W * 0.006); g.strokeRect(0, 0, W, H);
  if (f.title) {
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, Math.min(H * 0.18, 90));
    fitText(g, f.title, W * 0.02, 4, W * 0.96, Math.min(H * 0.18, 90) - 8, { max: 60, min: 10, weight: 800, color: '#fff', align: 'center', valign: 'middle', family: ctx.serif || SERIF_FONT, shadow: 'rgba(0,0,0,.5)' });
  }
}

// hex tile top. The texture is the tile's bounding square seen from above (canvas x → world x, canvas y → world z), so
// the hexagon is inscribed: pointy tiles touch the top and bottom edges, flat tiles the left and right.
export function drawHexTop(g, S, face, ctx, { color = '#9cbf6a', orient = 'pointy', ring = false, ghost = false } = {}) {
  const f = typeof face === 'string' ? { title: face } : (face || {});
  const bg = f.bg || f.color || color;
  const corners = [0, 1, 2, 3, 4, 5].map((c) => { const a = ((60 * c + (orient === 'flat' ? 0 : -30)) * Math.PI) / 180; return [(Math.cos(a) + 1) / 2 * S, (Math.sin(a) + 1) / 2 * S]; });
  const path = (k = 1) => { g.beginPath(); corners.forEach(([x, y], i) => { const px = S / 2 + (x - S / 2) * k, py = S / 2 + (y - S / 2) * k; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); };
  g.clearRect(0, 0, S, S);
  if (ghost) {
    path(0.94); g.fillStyle = 'rgba(255,255,255,.08)'; g.fill();
    g.setLineDash([S * 0.05, S * 0.035]); g.lineWidth = S * 0.022; g.strokeStyle = f.border || 'rgba(255,255,255,.75)'; g.stroke(); g.setLineDash([]);
  } else {
    g.fillStyle = shade(bg, -0.35); g.fillRect(0, 0, S, S); // bleeds into the bevel
    g.save(); path(); g.clip();
    const grd = g.createRadialGradient(S * 0.4, S * 0.35, S * 0.05, S / 2, S / 2, S * 0.62);
    grd.addColorStop(0, shade(bg, 0.12)); grd.addColorStop(1, shade(bg, -0.1));
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    paperNoise(g, S, S, hash(String(f.title || bg)), 0.07);
    const url = resolveImage(ctx.assets, f.image);
    const img = url ? loadImage(url, ctx.redraw) : null;
    if (img) {
      // rotate: degrees, clockwise seen from above — the same way angles grow in table coordinates (x right, z towards
      // the viewer). The hexagon lies inside the circle the turned square still covers, so no corner shows through.
      g.save();
      if (f.rotate) { g.translate(S / 2, S / 2); g.rotate((Number(f.rotate) * Math.PI) / 180); g.translate(-S / 2, -S / 2); }
      cover(g, img, 0, 0, S, S, f.focus ?? 0.5);
      g.restore();
    }
    if (f.tint) { g.fillStyle = f.tint; g.fillRect(0, 0, S, S); }
    g.restore();
    if (ring) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = S * 0.018; g.beginPath(); g.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(S * 0.47, S * 0.47); g.lineTo(S * 0.44, S * 0.53); g.stroke(); }
    path(0.97); g.lineWidth = S * 0.018; g.strokeStyle = f.border || 'rgba(255,255,255,.28)'; g.stroke();
  }
  const c = new THREE.Color(bg).convertLinearToSRGB(); // readable() measures linear values, too dark for pale terrain
  const ink = f.ink || (ghost || 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 0.6 ? '#fff' : INK);
  if (f.title) fitText(g, String(f.title), S * 0.2, S * 0.13, S * 0.6, S * 0.14, { max: S * 0.1, min: 8, weight: 800, color: ink, align: 'center', valign: 'middle', family: ctx.font || UI_FONT });
  if (f.text) fitText(g, String(f.text), S * 0.2, S * 0.72, S * 0.6, S * 0.13, { max: S * 0.075, min: 7, weight: 600, color: ink, align: 'center', valign: 'middle', family: ctx.font || UI_FONT });
  if (f.icon && !f.text) fitText(g, String(f.icon), S * 0.3, S * 0.68, S * 0.4, S * 0.18, { max: S * 0.14, min: 8, weight: 700, color: ink, align: 'center', valign: 'middle' });
}

// ---------------------------------------------------------------- texture store
export class FaceStore {
  constructor() {
    this.cache = new Map(); this.assets = {}; this.font = null; this.serif = null; this.anisotropy = 4;
    fontsReady(8000).then(() => this.redrawAll()); // late font: all textures are redrawn
  }
  redrawAll() { for (const e of this.cache.values()) e.draw?.(); }
  setAssets(a) { this.assets = a || {}; }
  // kind: card|back|token|tokenSquare|die|board ; spec: face object ; w,h: pixels
  texture(kind, spec, w, h, opts = {}) {
    const key = `${kind}|${w}x${h}|${JSON.stringify(spec)}|${JSON.stringify(opts)}`;
    let e = this.cache.get(key);
    if (e) { e.refs++; return e.tex; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    e = { tex, canvas, refs: 1, key };
    const draw = () => {
      const g = canvas.getContext('2d');
      const ctx = { assets: this.assets, font: this.font, serif: this.serif, redraw: () => { draw(); tex.needsUpdate = true; } };
      if (kind === 'card') drawCard(g, w, h, spec, ctx);
      else if (kind === 'back') drawBack(g, w, h, spec, ctx);
      else if (kind === 'token') drawTokenTop(g, w, spec, ctx, { round: true, ...opts });
      else if (kind === 'tokenSquare') drawTokenTop(g, w, spec, ctx, { round: false, ...opts });
      else if (kind === 'die') drawDieFace(g, w, spec, ctx, opts);
      else if (kind === 'hex') drawHexTop(g, w, spec, ctx, opts);
      else drawBoard(g, w, h, spec, ctx);
      tex.needsUpdate = true;
    };
    e.draw = draw;
    draw();
    this.cache.set(key, e);
    return tex;
  }
  release(tex) {
    for (const [k, e] of this.cache) {
      if (e.tex === tex && --e.refs <= 0) { e.tex.dispose(); this.cache.delete(k); }
    }
  }
  // high-res copy for hover preview (separate canvas)
  preview(kind, spec, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const ctx = { assets: this.assets, font: this.font, serif: this.serif, redraw: () => { if (c.isConnected) this._redrawInto(c, kind, spec); } };
    this._drawKind(g, kind, spec, w, h, ctx);
    return c;
  }
  _redrawInto(c, kind, spec) { this._drawKind(c.getContext('2d'), kind, spec, c.width, c.height, { assets: this.assets, font: this.font, serif: this.serif, redraw: () => {} }); }
  _drawKind(g, kind, spec, w, h, ctx) {
    if (kind === 'back') drawBack(g, w, h, spec, ctx);
    else if (kind === 'board') drawBoard(g, w, h, spec, ctx);
    else if (kind === 'token' || kind === 'tokenSquare') drawTokenTop(g, w, spec, ctx, { round: kind === 'token' });
    else drawCard(g, w, h, spec, ctx);
  }
  dispose() { for (const e of this.cache.values()) e.tex.dispose(); this.cache.clear(); }
}
