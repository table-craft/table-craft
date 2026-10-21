// Dice pools, bag pulls and exact odds for push-your-luck decisions (and bots).
// Self-contained: injected into sandboxes via toString().

export function installLuck(T) {
  // ------------------------------------------------------------ T.dice (pools of face values)
  const D = {};
  // n dice → their faces (no animation; ctx.rollMany throws them on the table)
  D.roll = (random, n, faces = 6) => Array.from({ length: n }, () => T.roll(random, faces).face);
  // re-rolls the dice at `indices` in place → values
  D.reroll = (values, indices, random, faces = 6) => { for (const i of indices) values[i] = T.roll(random, faces).face; return values; };
  D.sum = (values) => values.reduce((a, v) => a + (Number(v) || 0), 0);
  D.counts = (values) => { const out = {}; for (const v of values) out[v] = (out[v] || 0) + 1; return out; };
  // group sizes, largest first: [4, 4, 2, 4, 2] → [3, 2]
  D.groups = (values) => Object.values(D.counts(values)).sort((a, b) => b - a);
  D.ofAKind = (values) => D.groups(values)[0] || 0;
  // longest run of consecutive numbers
  D.straight = (values) => T.sets.longest(values);
  // pattern: { groups: [3, 2] } (full house), { groups: [2, 2] } (two pairs), { straight: 4 }, { sum: [min, max] }
  D.matches = (values, p = {}) => {
    if (p.groups) { const g = D.groups(values); if (![...p.groups].sort((a, b) => b - a).every((n, i) => (g[i] || 0) >= n)) return false; }
    if (p.straight && D.straight(values) < p.straight) return false;
    if (p.sum) { const s = D.sum(values); if (s < p.sum[0] || s > (p.sum[1] == null ? Infinity : p.sum[1])) return false; }
    return true;
  };
  // exact probability that n dice satisfy test(values) (every outcome enumerated: keep pools small, faces^n ≤ 1e6)
  D.odds = (n, faces, test) => {
    const fs = Array.isArray(faces) ? faces : Array.from({ length: faces || 6 }, (_, i) => i + 1);
    const total = fs.length ** n;
    if (total > 1e6) throw new Error('T.dice.odds: too many outcomes');
    let hits = 0; const v = new Array(n);
    for (let k = 0; k < total; k++) { let x = k; for (let i = 0; i < n; i++) { v[i] = fs[x % fs.length]; x = Math.floor(x / fs.length); } if (test(v.slice())) hits++; }
    return hits / total;
  };
  T.dice = D;

  // ------------------------------------------------------------ T.bag (chits / cubes by kind: { white: 4, red: 2 })
  // A deck's composition is a bag too: T.sets.count(deck).
  const B = {};
  const match = (kind) => (typeof kind === 'function' ? kind : Array.isArray(kind) ? (k) => kind.includes(k) : (k) => k === kind);
  B.total = (bag) => T.sum(bag);
  // n random pulls → the kinds drawn; without `replace` they leave the bag
  B.draw = (bag, random, n = 1, replace = false) => {
    const out = [];
    for (let j = 0; j < n; j++) {
      const t = B.total(bag); if (!(t > 0)) break;
      let r = random.int(t);
      for (const k of Object.keys(bag)) { if (r < bag[k]) { out.push(k); if (!replace) bag[k] -= 1; break; } r -= bag[k] || 0; }
    }
    return out;
  };
  // puts n of a kind back (or one of each kind in a list)
  B.put = (bag, kind, n = 1) => { for (const k of Array.isArray(kind) ? kind : [kind]) bag[k] = (bag[k] || 0) + (Array.isArray(kind) ? 1 : n); return bag; };
  // chance that the next pull is `kind` (a kind, a list of kinds or a predicate)
  B.chance = (bag, kind) => { const t = B.total(bag); if (!t) return 0; const m = match(kind); return Object.keys(bag).reduce((a, k) => a + (m(k) ? bag[k] || 0 : 0), 0) / t; };
  // exact probability that k pulls satisfy test(drawn), drawn = { kind: n } for every kind — e.g. the risk of busting.
  // Without replacement unless replace is true. Enumerates count vectors, so it stays cheap for real bags.
  B.odds = (bag, k, test, replace = false) => {
    const kinds = Object.keys(bag).filter((x) => bag[x] > 0); const N = B.total(bag);
    if (!replace) k = Math.min(k, N);
    const drawn = {}; let p = 0;
    for (const x of Object.keys(bag)) drawn[x] = 0; // kinds that ran out still read 0
    if (!N) return test({ ...drawn }) ? 1 : 0;
    const choose = (n, r) => { if (r < 0 || r > n) return 0; let c = 1; for (let i = 1; i <= r; i++) c = (c * (n - r + i)) / i; return c; };
    const walk = (i, left, w) => {
      if (i === kinds.length - 1) {
        const n = left; if (!replace && n > bag[kinds[i]]) return;
        drawn[kinds[i]] = n;
        const wi = replace ? w * (bag[kinds[i]] / N) ** n : w * choose(bag[kinds[i]], n);
        if (test({ ...drawn })) p += wi;
        return;
      }
      for (let n = 0; n <= (replace ? left : Math.min(left, bag[kinds[i]])); n++) {
        drawn[kinds[i]] = n;
        walk(i + 1, left - n, replace ? w * choose(left, n) * (bag[kinds[i]] / N) ** n : w * choose(bag[kinds[i]], n));
      }
    };
    walk(0, k, 1);
    return replace ? p : p / choose(N, k);
  };
  T.bag = B;
}
