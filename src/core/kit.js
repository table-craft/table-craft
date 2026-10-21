// The rules kit `T` — a global inside every game module.
//
// `createCore` and every mechanics installer must stay fully self-contained (no references to anything outside their
// bodies): their source text is injected into the game sandbox via `Function.prototype.toString()`, so the kit lives in
// the same realm as the game code and never hands host-realm functions to untrusted modules.
import { installScoring } from './mechanics/scoring.js';
import { installGrid } from './mechanics/grid.js';
import { installTurns } from './mechanics/turns.js';
import { installCards } from './mechanics/cards.js';
import { installLuck } from './mechanics/luck.js';
import { installEconomy } from './mechanics/economy.js';
import { installInteraction } from './mechanics/interaction.js';

// Generic board-game mechanics (docs/mechanics.md), installed in this order — later installers may use earlier ones.
const INSTALLERS = [installScoring, installGrid, installTurns, installCards, installLuck, installEconomy, installInteraction];

function createCore() {
  const T = {};

  // ------------------------------------------------------------ dice
  // faces: number of sides (6) or a list of faces (['Snow', 'Snow', 'Sun', ...]).
  // Returns { index, face } — face is the list entry, or 1..n for numeric dice.
  T.roll = function roll(random, faces) {
    const n = Array.isArray(faces) ? faces.length : Math.max(2, faces | 0 || 6);
    const index = random.int(n);
    return { index, face: Array.isArray(faces) ? faces[index] : index + 1 };
  };

  // ------------------------------------------------------------ decks
  // Draws n cards from the front of `deck`. When the deck runs out, `discard` is shuffled back in.
  // Both arrays are mutated; returns the drawn cards (fewer if both run out).
  T.draw = function draw(deck, discard, random, n = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!deck.length && discard && discard.length) {
        deck.push(...random.shuffle(discard));
        discard.length = 0;
      }
      if (!deck.length) break;
      out.push(deck.shift());
    }
    return out;
  };
  T.drawOne = (deck, discard, random) => T.draw(deck, discard, random, 1)[0];

  // ------------------------------------------------------------ turn order
  // Players clockwise from index `start`; players for which skip(p) is true are left out.
  T.orderFrom = function orderFrom(players, start, skip) {
    const out = [];
    for (let i = 0; i < players.length; i++) {
      const p = players[(start + i) % players.length];
      if (!skip || !skip(p)) out.push(p);
    }
    return out;
  };
  T.nextIndex = (n, i, step = 1) => (((i + step) % n) + n) % n;

  // ------------------------------------------------------------ resource dictionaries ({ wood: 2, ore: 1 })
  T.sum = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  T.add = function add(target, delta, mul = 1) {
    for (const k of Object.keys(delta || {})) target[k] = (target[k] || 0) + (delta[k] || 0) * mul;
    return target;
  };
  T.canPay = (have, cost) => Object.keys(cost || {}).every((k) => (have[k] || 0) >= (cost[k] || 0));
  T.pay = function pay(have, cost) {
    if (!T.canPay(have, cost)) return false;
    for (const k of Object.keys(cost || {})) have[k] = (have[k] || 0) - (cost[k] || 0);
    return true;
  };
  // Loses up to n without going negative; returns what was actually lost.
  T.lose = function lose(have, key, n) {
    const x = Math.max(0, Math.min(have[key] || 0, n));
    have[key] = (have[key] || 0) - x;
    return x;
  };

  // ------------------------------------------------------------ sand timer
  // state.$deadline is watched by the host: when time is up, `move(args)` is applied as `playerId` (or the system).
  T.setDeadline = function setDeadline(state, now, seconds, move, args, playerId) {
    state.$deadline = { at: now + Math.round(seconds * 1000), seconds, move, args: args || {}, playerId: playerId || null };
    return state.$deadline;
  };
  T.clearDeadline = (state) => { delete state.$deadline; };

  // ------------------------------------------------------------ graphs
  // Cheapest path from `start` to `goal` (string keys). next(node) → [node, ...] or [[node, cost], ...].
  // goal may be a predicate. Returns { path: [start, ..., goal], cost } or null. Deterministic (insertion order).
  T.findPath = function findPath(start, goal, next, { maxCost = Infinity } = {}) {
    const isGoal = typeof goal === 'function' ? goal : (n) => n === goal;
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const open = [start];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (isGoal(cur)) {
        const path = [cur];
        while (prev.has(path[0])) path.unshift(prev.get(path[0]));
        return { path, cost: dist.get(cur) };
      }
      for (const e of next(cur) || []) {
        const [n, c] = Array.isArray(e) ? [e[0], e[1] == null ? 1 : Number(e[1])] : [e, 1];
        const d = dist.get(cur) + c;
        if (!(c >= 0) || d > maxCost || (dist.has(n) && dist.get(n) <= d)) continue;
        if (!dist.has(n) || !open.includes(n)) open.push(n);
        dist.set(n, d); prev.set(n, cur);
      }
    }
    return null;
  };
  // Every node reachable from `start` (including it) → array of keys.
  T.reachable = function reachable(start, next) {
    const seen = new Set([start]); const queue = [start];
    while (queue.length) for (const e of next(queue.shift()) || []) { const n = Array.isArray(e) ? e[0] : e; if (!seen.has(n)) { seen.add(n); queue.push(n); } }
    return [...seen];
  };

  // ------------------------------------------------------------ hex grids (axial coordinates q, r)
  // Cells are 'q,r' keys (or [q, r]). Sides and corners are numbered clockwise as seen from above; side i lies between
  // corners i and i+1 and faces neighbour DIRS[i]. Corners ('q,r,c') and edges ('q,r,s') are shared by several cells,
  // so T.hex.corner / T.hex.edge return one canonical key for each — use those keys in game state.
  const H = {};
  H.DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const cellOf = (c) => (Array.isArray(c) ? [c[0] | 0, c[1] | 0] : String(c).split(',').slice(0, 2).map((x) => x | 0));
  const parts = (k) => (Array.isArray(k) ? k.map((x) => x | 0) : String(k).split(',').map((x) => x | 0));
  const m6 = (i) => (((i | 0) % 6) + 6) % 6;
  H.key = (q, r) => (Array.isArray(q) ? `${q[0] | 0},${q[1] | 0}` : r == null ? cellOf(q).join(',') : `${q | 0},${r | 0}`);
  H.parse = cellOf;
  H.neighbor = (cell, side) => { const [q, r] = cellOf(cell); const d = H.DIRS[m6(side)]; return H.key(q + d[0], r + d[1]); };
  H.neighbors = (cell) => H.DIRS.map((_, i) => H.neighbor(cell, i));
  H.distance = (a, b) => { const [q1, r1] = cellOf(a); const [q2, r2] = cellOf(b); const dq = q1 - q2, dr = r1 - r2; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
  H.ring = (center, radius) => {
    if (radius <= 0) return [H.key(center)];
    let [q, r] = cellOf(center); q += H.DIRS[4][0] * radius; r += H.DIRS[4][1] * radius;
    const out = [];
    for (let i = 0; i < 6; i++) for (let k = 0; k < radius; k++) { out.push(H.key(q, r)); q += H.DIRS[i][0]; r += H.DIRS[i][1]; }
    return out;
  };
  // all cells within `radius` (a hexagon-shaped map), centre first
  H.area = (center, radius) => { const out = []; for (let k = 0; k <= radius; k++) out.push(...H.ring(center, k)); return out; };
  // a cols × rows rectangle of cells (offset rows for 'pointy', offset columns for 'flat')
  H.rect = (cols, rows, orient = 'pointy') => {
    const out = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push(orient === 'flat' ? H.key(x, y - Math.floor(x / 2)) : H.key(x - Math.floor(y / 2), y));
    return out;
  };
  H.line = (a, b) => {
    const [q1, r1] = cellOf(a); const [q2, r2] = cellOf(b); const n = H.distance(a, b); const out = [];
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0; const fq = q1 + (q2 - q1) * t + 1e-6, fr = r1 + (r2 - r1) * t + 2e-6, fs = -fq - fr;
      let rq = Math.round(fq), rr = Math.round(fr); const rs = Math.round(fs);
      const dq = Math.abs(rq - fq), dr = Math.abs(rr - fr), ds = Math.abs(rs - fs);
      if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
      out.push(H.key(rq, rr));
    }
    return out;
  };
  // corner c of a cell is also corner c+2 of neighbour DIRS[c-1] and corner c+4 of neighbour DIRS[c]
  H.corner = (cell, c) => {
    const [q, r] = cellOf(cell); c = m6(c);
    const a = H.DIRS[m6(c - 1)], b = H.DIRS[c];
    const reps = [[q, r, c], [q + a[0], r + a[1], m6(c + 2)], [q + b[0], r + b[1], m6(c + 4)]];
    reps.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    return reps[0].join(',');
  };
  // side s of a cell is side s+3 of neighbour DIRS[s]; the canonical key uses s in 0..2
  H.edge = (cell, s) => { const [q, r] = cellOf(cell); s = m6(s); if (s < 3) return `${q},${r},${s}`; const d = H.DIRS[s]; return `${q + d[0]},${r + d[1]},${s - 3}`; };
  H.corners = (cell) => [0, 1, 2, 3, 4, 5].map((c) => H.corner(cell, c));
  H.edges = (cell) => [0, 1, 2, 3, 4, 5].map((s) => H.edge(cell, s));
  H.cornerCells = (v) => { const [q, r, c] = parts(v); const a = H.DIRS[m6(c - 1)], b = H.DIRS[c]; return [H.key(q, r), H.key(q + a[0], r + a[1]), H.key(q + b[0], r + b[1])]; };
  H.edgeCells = (e) => { const [q, r, s] = parts(e); return [H.key(q, r), H.neighbor([q, r], s)]; };
  H.edgeCorners = (e) => { const [q, r, s] = parts(e); return [H.corner([q, r], s), H.corner([q, r], s + 1)]; };
  // the three edges that meet at a corner, and the corners one edge away
  H.cornerEdges = (v) => { const [q, r, c] = parts(v); return [H.edge([q, r], c - 1), H.edge([q, r], c), H.edge(H.neighbor([q, r], c - 1), c + 1)]; };
  H.cornerNeighbors = (v) => { const key = H.corner(parts(v).slice(0, 2), parts(v)[2]); return H.cornerEdges(v).map((e) => H.edgeCorners(e).find((x) => x !== key)); };
  // cheapest cell path; cost(cellKey, fromKey) → number, or false/null/Infinity for impassable (default: 1 everywhere)
  H.path = (from, to, cost, opts) => T.findPath(H.key(from), typeof to === 'function' ? to : H.key(to), (k) => H.neighbors(k).map((n) => {
    const c = cost ? cost(n, k) : 1; return c === false || c == null || !(c < Infinity) ? null : [n, c === true ? 1 : c];
  }).filter(Boolean), opts);
  T.hex = H;

  // ------------------------------------------------------------ helpers
  T.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  T.range = (n) => Array.from({ length: n }, (_, i) => i);
  T.groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});

  // ------------------------------------------------------------ ctx (used by the runtime)
  // fx: animation/sound cue for clients. roll: roll dice AND emit a roll fx (the 3D dice land on this result).
  T._ctx = function makeCtx(random, sink, now) {
    const fx = (e) => { if (e && typeof e === 'object' && typeof e.type === 'string') sink.push(JSON.parse(JSON.stringify(e))); };
    const rollMany = (dice, opts = {}) => {
      const out = dice.map((d) => {
        const r = T.roll(random, d.faces || 6);
        return { id: d.id, index: r.index, face: r.face };
      });
      fx({ type: 'roll', dice: out.map((r) => ({ id: r.id, value: r.index })), by: opts.by || null, zone: opts.zone || null, to: opts.to });
      return out;
    };
    const roll = (faces, opts = {}) => rollMany([{ id: opts.id || 'die', faces }], opts)[0];
    return { fx, roll, rollMany, now };
  };

  return T;
}

// The full kit: core helpers + mechanics. Host-side and sandboxed kits are built from the same functions.
export function createKit() {
  const T = createCore();
  for (const install of INSTALLERS) install(T);
  return T;
}

// Source expression evaluated inside sandboxes: the same composition as createKit(), from source text.
export const KIT_SOURCE = `((T) => {\n${INSTALLERS.map((f) => `(${f.toString()})(T);`).join('\n')}\nreturn T;\n})((${createCore.toString()})())`;

// Host-side kit (tests, tools, server-side helpers). Game modules get their own sandboxed copy.
export const T = createKit();
