// Economy & action selection: worker placement, linear tracks with milestones, rondels.
// (Action points are a resource: T.pay(p, { ap: 2 }) and reset each turn.) Self-contained (injected via toString()).

export function installEconomy(T) {
  // ------------------------------------------------------------ T.workers (worker placement)
  // board = { spaceId: { cap, workers: [playerId, ...], blocked? } }; cap null = unlimited
  const W = {};
  W.board = (caps) => { const b = {}; for (const id of Object.keys(caps || {})) b[id] = { cap: caps[id] == null ? null : caps[id], workers: [] }; return b; };
  // onePerPlayer: a player may not put a second worker on the same space
  W.canPlace = (board, space, playerId, { onePerPlayer = false } = {}) => {
    const s = board[space];
    return !!s && !s.blocked && (s.cap == null || s.workers.length < s.cap) && !(onePerPlayer && s.workers.includes(playerId));
  };
  W.place = (board, space, playerId, opts) => { if (!W.canPlace(board, space, playerId, opts)) return false; board[space].workers.push(playerId); return true; };
  // the spaces this player may use right now
  W.available = (board, playerId, opts) => Object.keys(board).filter((id) => W.canPlace(board, id, playerId, opts));
  // spaces where this player has a worker
  W.spaces = (board, playerId) => Object.keys(board).filter((id) => board[id].workers.includes(playerId));
  // end of round: every worker goes home → { playerId: count }
  W.returnAll = (board) => {
    const out = {};
    for (const s of Object.values(board)) { for (const p of s.workers) out[p] = (out[p] || 0) + 1; s.workers = []; }
    return out;
  };
  T.workers = W;

  // ------------------------------------------------------------ T.track (score / fame / morale / temperature tracks)
  const R = {};
  // marks passed going from before to after, in travel order (a mark is passed when it is reached going up, or left
  // going down)
  R.crossed = (before, after, marks = []) => (after >= before
    ? marks.filter((m) => before < m && m <= after).sort((a, b) => a - b)
    : marks.filter((m) => after < m && m <= before).sort((a, b) => b - a));
  // holder[key] += delta within [min, max] → { value, moved, crossed }
  R.move = (holder, key, delta, { min = -Infinity, max = Infinity, marks = [] } = {}) => {
    const before = Number(holder[key]) || 0;
    const value = Math.max(min, Math.min(max, before + (Number(delta) || 0)));
    holder[key] = value;
    return { value, moved: value - before, crossed: R.crossed(before, value, marks) };
  };
  T.track = R;

  // ------------------------------------------------------------ T.rondel (circular action track, positions 0..size-1)
  // Moving forward is free for `free` steps; each extra step costs `cost`. Moving to a position: T.nextIndex(size, pos, steps).
  const O = {};
  O.steps = (from, to, size) => (((to - from) % size) + size) % size;
  O.cost = (from, to, size, { free = 3, cost = 1 } = {}) => Math.max(0, O.steps(from, to, size) - free) * cost;
  // every destination 1..max steps ahead that fits the budget → [{ to, steps, cost }]
  O.moves = (from, size, { free = 3, cost = 1, max = size - 1, budget = Infinity } = {}) => {
    const out = [];
    for (let s = 1; s <= Math.min(max, size - 1); s++) { const c = Math.max(0, s - free) * cost; if (c <= budget) out.push({ to: T.nextIndex(size, from, s), steps: s, cost: c }); }
    return out;
  };
  T.rondel = O;
}
