// Scoring & ending: rankings with tie-breakers, end results, scoring tables, set collection, area majorities.
// Installers are injected into sandboxes via toString(): self-contained, only `T` and JS builtins.

export function installScoring(T) {
  // a getter is a property name or a function
  const get = (x, g) => (typeof g === 'function' ? g(x) : x == null ? undefined : x[g]);

  // ------------------------------------------------------------ T.score
  const S = {};
  // keys: getters, most important first. Higher wins; '-coins' means fewer wins. Players may be objects or ids.
  // → [{ id, name?, score, place }] best first; players tied on every key share a place (1, 1, 3).
  S.rank = function rank(players, keys = ['score'], { id = 'id' } = {}) {
    const ks = (Array.isArray(keys) ? keys : [keys]).map((k) => (typeof k === 'string' && k[0] === '-' ? [k.slice(1), -1] : [k, 1]));
    const rows = (players || []).map((p, i) => ({ p, i, v: ks.map(([k, s]) => (Number(get(p, k)) || 0) * s) }));
    const cmp = (a, b) => { for (let j = 0; j < a.v.length; j++) if (a.v[j] !== b.v[j]) return b.v[j] - a.v[j]; return 0; };
    rows.sort((a, b) => cmp(a, b) || a.i - b.i);
    const out = [];
    rows.forEach((r, j) => {
      const o = typeof r.p === 'object' && r.p ? { id: r.p[id] } : { id: r.p };
      if (r.p && r.p.name != null) o.name = r.p.name;
      o.score = ks.length ? r.v[0] * ks[0][1] : 0;
      o.place = j && !cmp(r, rows[j - 1]) ? out[j - 1].place : j + 1;
      out.push(o);
    });
    return out;
  };
  // A ready endIf() result: { winners, ranking, reason }. reason: string or (ranking) → string.
  S.result = function result(players, { keys, id, reason } = {}) {
    const ranking = S.rank(players, keys, { id });
    const winners = ranking.filter((r) => r.place === 1).map((r) => r.id);
    const names = ranking.filter((r) => r.place === 1).map((r) => r.name || r.id);
    const why = typeof reason === 'function' ? reason(ranking) : reason
      || (names.length > 1 ? `Shared victory: ${names.join(', ')}` : names.length ? `${names[0]} wins with ${ranking[0].score}` : 'Game over');
    return { winners, ranking, reason: why };
  };
  // Scoring tables: table[n], capped at the last entry (T.score.table(4, [0, 1, 3, 6, 10, 15]) → 10).
  S.table = (n, table) => (table && table.length ? table[Math.max(0, Math.min(n | 0, table.length - 1))] : 0);
  T.score = S;

  // ------------------------------------------------------------ T.sets (set collection)
  // Functions below take counts ({ kind: n }) or a plain list of items (counted by value).
  const C = {};
  C.count = function count(items, kind) {
    const out = {};
    for (const x of items || []) { const k = kind == null ? x : get(x, kind); if (k != null) out[k] = (out[k] || 0) + 1; }
    return out;
  };
  const cnt = (c) => (Array.isArray(c) ? C.count(c) : c || {});
  // how many groups of n identical items (pairs: n = 2)
  C.ofAKind = (counts, n) => Object.values(cnt(counts)).reduce((a, v) => a + Math.floor(v / n), 0);
  // how many complete sets holding one of each of `kinds`
  C.complete = (counts, kinds) => { const c = cnt(counts); return kinds && kinds.length ? Math.min(...kinds.map((k) => c[k] || 0)) : 0; };
  // sizes of the sets of different kinds, largest first ({ a: 3, b: 1, c: 2 } → [3, 2, 1])
  C.distinct = (counts) => {
    const v = Object.values(cnt(counts)).filter((x) => x > 0); const out = [];
    for (let j = 0; v.some((x) => x > j); j++) out.push(v.filter((x) => x > j).length);
    return out;
  };
  // runs of consecutive numbers ([5, 3, 4, 9, 8, 4] → [[3, 4, 5], [8, 9]])
  C.runs = (values) => {
    const v = [...new Set((values || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b); const out = [];
    for (const x of v) { const last = out[out.length - 1]; if (last && x === last[last.length - 1] + 1) last.push(x); else out.push([x]); }
    return out;
  };
  C.longest = (values) => C.runs(values).reduce((m, r) => Math.max(m, r.length), 0);
  T.sets = C;

  // ------------------------------------------------------------ T.area (area control / majorities)
  // counts per region per player: { region: { playerId: n } }. Items whose region or owner is null are skipped.
  const A = {};
  A.tally = function tally(items, region = 'region', owner = 'owner', weight) {
    const out = {};
    for (const x of items || []) {
      const r = get(x, region), o = get(x, owner); if (r == null || o == null) continue;
      const w = weight == null ? 1 : Number(get(x, weight)) || 0;
      const t = out[r] || (out[r] = {});
      t[o] = (t[o] || 0) + w;
    }
    return out;
  };
  // one region's counts → [{ id, n, place }] most first, ties share a place; players below `min` are left out
  A.rank = (counts, min = 1) => {
    const rows = Object.entries(counts || {}).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]);
    const out = [];
    rows.forEach(([id, n], j) => out.push({ id, n, place: j && n === rows[j - 1][1] ? out[j - 1].place : j + 1 }));
    return out;
  };
  // the only player with the most (≥ min), or null on a tie
  A.control = (counts, min = 1) => { const r = A.rank(counts, min); return r.length && (r.length < 2 || r[1].place > 1) ? r[0].id : null; };
  // awards by place ([5, 3, 1]) for one region → { playerId: points }. Ties occupying places k..k+m-1:
  // 'split' share the sum of those awards (rounded down), 'full' each get awards[k], 'down' each get the lowest of
  // them (El Grande), 'none' get nothing. Either way the tied players use up those places.
  A.majority = function majority(counts, awards = [5, 3, 1], { tie = 'split', min = 1 } = {}) {
    const out = {}; const r = A.rank(counts, min);
    for (let j = 0; j < r.length;) {
      const group = r.filter((x) => x.place === r[j].place); const k = j, m = group.length;
      if (k >= awards.length) break;
      const slice = Array.from({ length: m }, (_, i) => awards[k + i] || 0);
      const each = m === 1 ? slice[0] : tie === 'full' ? slice[0] : tie === 'down' ? slice[m - 1] : tie === 'none' ? 0 : Math.floor(slice.reduce((a, b) => a + b, 0) / m);
      for (const g of group) out[g.id] = each;
      j += m;
    }
    return out;
  };
  // majority scoring over every region of a tally; awards: array, or (region) → array
  A.score = function score(tally, awards, opts) {
    const out = {};
    for (const reg of Object.keys(tally || {})) {
      const pts = A.majority(tally[reg], typeof awards === 'function' ? awards(reg) : awards, opts);
      for (const id of Object.keys(pts)) out[id] = (out[id] || 0) + pts[id];
    }
    return out;
  };
  T.area = A;
}
