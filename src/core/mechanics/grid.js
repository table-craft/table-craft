// Square grids: cell keys, neighbours, distances, lines and line of sight, connected regions, n-in-a-row, and
// polyomino shapes (rotate / flip / fit). Self-contained: injected into sandboxes via toString().

export function installGrid(T) {
  const G = {};
  const cellOf = (c) => (Array.isArray(c) ? [c[0] | 0, c[1] | 0] : String(c).split(',').slice(0, 2).map((x) => x | 0));
  G.key = (x, y) => (Array.isArray(x) ? `${x[0] | 0},${x[1] | 0}` : y == null ? cellOf(x).join(',') : `${x | 0},${y | 0}`);
  G.parse = cellOf;
  // x grows to the right, y grows down (row 0 is the top row)
  G.DIRS4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  G.DIRS8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  // dirs: 4 (orthogonal), 8 (with diagonals) or a neighbours function (e.g. T.hex.neighbors)
  G.neighbors = (cell, dirs = 4) => {
    if (typeof dirs === 'function') return dirs(cell);
    const [x, y] = cellOf(cell);
    return (dirs === 8 ? G.DIRS8 : G.DIRS4).map(([dx, dy]) => G.key(x + dx, y + dy));
  };
  G.manhattan = (a, b) => { const [x1, y1] = cellOf(a), [x2, y2] = cellOf(b); return Math.abs(x1 - x2) + Math.abs(y1 - y2); };
  G.chebyshev = (a, b) => { const [x1, y1] = cellOf(a), [x2, y2] = cellOf(b); return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)); };
  // cols × rows cells, row by row
  G.rect = (cols, rows) => { const out = []; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) out.push(G.key(x, y)); return out; };
  G.inBounds = (cell, cols, rows) => { const [x, y] = cellOf(cell); return x >= 0 && y >= 0 && x < cols && y < rows; };

  // Bresenham line, both ends included
  G.line = (a, b) => {
    let [x, y] = cellOf(a); const [x2, y2] = cellOf(b);
    const dx = Math.abs(x2 - x), dy = -Math.abs(y2 - y), sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1;
    let err = dx + dy; const out = [G.key(x, y)];
    while (x !== x2 || y !== y2) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
      out.push(G.key(x, y));
    }
    return out;
  };
  // true when no cell strictly between a and b is blocked(cell)
  G.lineOfSight = (a, b, blocked) => G.line(a, b).slice(1, -1).every((c) => !blocked(c));

  // every cell reachable from start through cells where ok(cell) is true (start always included)
  G.floodFill = (start, ok, dirs = 4) => T.reachable(G.key(start), (k) => G.neighbors(k, dirs).filter((n) => ok(n)));
  // connected groups of adjacent cells with an equal value(cell) → [{ value, cells }], in board order.
  // Every cell of `cells` lands in exactly one group; filter by value to drop empties.
  G.regions = function regions(cells, value = () => true, dirs = 4) {
    const keys = cells.map((c) => (typeof dirs === 'function' ? c : G.key(c)));
    const on = new Set(keys); const seen = new Set(); const out = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      const v = value(k); const group = [k]; seen.add(k);
      for (let i = 0; i < group.length; i++) {
        for (const n of G.neighbors(group[i], dirs)) if (on.has(n) && !seen.has(n) && value(n) === v) { seen.add(n); group.push(n); }
      }
      out.push({ value: v, cells: group });
    }
    return out;
  };
  // cheapest cell path; cost(cell, fromCell) → number, or false/null/Infinity for impassable (default 1)
  G.path = (from, to, cost, { dirs = 4, ...opts } = {}) => T.findPath(G.key(from), typeof to === 'function' ? to : G.key(to), (k) => G.neighbors(k, dirs).map((n) => {
    const c = cost ? cost(n, k) : 1; return c === false || c == null || !(c < Infinity) ? null : [n, c === true ? 1 : c];
  }).filter(Boolean), opts);

  // Straight runs of ≥ n equal values (connect four, tic-tac-toe, match-3) → [{ value, cells }], each run maximal.
  // value(cell) of null/undefined/'' never forms a run. diagonal: false for orthogonal lines only.
  G.lineRuns = function lineRuns(cells, value, n = 3, { diagonal = true } = {}) {
    const on = new Set(cells.map((c) => G.key(c))); const out = [];
    const val = (k) => (on.has(k) ? value(k) : undefined);
    const empty = (v) => v == null || v === '';
    for (const [dx, dy] of diagonal ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]]) {
      for (const k of on) {
        const v = val(k); const [x, y] = cellOf(k);
        if (empty(v) || val(G.key(x - dx, y - dy)) === v) continue; // not the start of a run
        const run = [k];
        for (let i = 1; val(G.key(x + dx * i, y + dy * i)) === v; i++) run.push(G.key(x + dx * i, y + dy * i));
        if (run.length >= n) out.push({ value: v, cells: run });
      }
    }
    return out;
  };

  // ---- polyomino shapes: lists of [x, y] offsets (or 'x,y' keys); results are normalized (min corner at 0,0)
  G.normalize = (shape) => {
    const pts = shape.map(cellOf); const mx = Math.min(...pts.map((p) => p[0])), my = Math.min(...pts.map((p) => p[1]));
    return pts.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  };
  // quarter turns clockwise (with y pointing down)
  G.rotate = (shape, times = 1) => { let s = shape.map(cellOf); for (let i = 0; i < (((times | 0) % 4) + 4) % 4; i++) s = s.map(([x, y]) => [-y, x]); return G.normalize(s); };
  G.flip = (shape) => G.normalize(shape.map(cellOf).map(([x, y]) => [-x, y]));
  // the distinct orientations (1 to 8) of a shape; flips: false for one-sided pieces
  G.orientations = (shape, flips = true) => {
    const out = []; const seen = new Set();
    for (const base of flips ? [shape, G.flip(shape)] : [shape]) {
      for (let r = 0; r < 4; r++) { const s = G.rotate(base, r); const id = JSON.stringify(s); if (!seen.has(id)) { seen.add(id); out.push(s); } }
    }
    return out;
  };
  G.place = (shape, at) => { const [ax, ay] = cellOf(at); return shape.map(cellOf).map(([x, y]) => G.key(ax + x, ay + y)); };
  G.fits = (shape, at, isFree) => G.place(shape, at).every((c) => isFree(c));
  // every legal placement over the anchor cells → [{ at, shape, cells }] (good for actions())
  G.placements = (shape, anchors, isFree, flips = true) => {
    const out = [];
    for (const s of G.orientations(shape, flips)) for (const at of anchors) { const cells = G.place(s, at); if (cells.every((c) => isFree(c))) out.push({ at: G.key(at), shape: s, cells }); }
    return out;
  };
  T.grid = G;
}
