// Turn structure: turn order with passing, snake / score-based orders, rounds & phases, and a stack of pending
// decisions. All state is plain data the game stores. Self-contained: injected into sandboxes via toString().

export function installTurns(T) {
  const get = (x, g) => (typeof g === 'function' ? g(x) : x == null ? undefined : x[g]);

  // ------------------------------------------------------------ T.turns
  // t = { order: [ids], start, i, passed: [ids in passing order], once }
  // once: every player takes exactly one turn per round (next() marks the current player as done).
  const U = {};
  const seat = (t, s) => (typeof s === 'number' ? T.nextIndex(t.order.length, s, 0) : Math.max(0, t.order.indexOf(s)));
  U.create = (ids, { start = 0, once = false } = {}) => {
    const t = { order: [...ids], start: 0, i: 0, passed: [], once: !!once };
    t.start = t.i = seat(t, start);
    return t;
  };
  U.done = (t) => t.order.every((id) => t.passed.includes(id));
  U.current = (t) => (U.done(t) ? null : t.order[t.i]);
  // advance to the next player who has not passed → their id, or null when everyone has passed (round over)
  U.next = (t) => {
    if (t.once && !t.passed.includes(t.order[t.i])) t.passed.push(t.order[t.i]);
    for (let k = 1; k <= t.order.length; k++) {
      const j = (t.i + k) % t.order.length;
      if (!t.passed.includes(t.order[j])) { t.i = j; return t.order[j]; }
    }
    return null;
  };
  // id passes for the rest of the round (t.passed[0] is the first passer) → true when everyone has now passed
  U.pass = (t, id = t.order[t.i]) => { if (!t.passed.includes(id)) t.passed.push(id); return U.done(t); };
  // new round from seat index or player id `start` (default: same start player; t.passed[0]: first passer starts)
  U.newRound = (t, start = t.start) => { t.start = t.i = seat(t, start); t.passed = []; return t.order[t.i]; };
  // the start player moves one seat on
  U.rotate = (t) => U.newRound(t, T.nextIndex(t.order.length, t.start));
  // draft order 1-2-3-3-2-1-1-2-…, n picks long (default: there and back once)
  U.snake = (ids, n = ids.length * 2) => Array.from({ length: n }, (_, k) => {
    const lap = Math.floor(k / ids.length), j = k % ids.length; return ids[lap % 2 ? ids.length - 1 - j : j];
  });
  // players sorted by keys (as in T.score.rank: higher first, '-key' lower first); full ties keep the given order
  U.by = (players, keys) => {
    const ks = (Array.isArray(keys) ? keys : [keys]).map((k) => (typeof k === 'string' && k[0] === '-' ? [k.slice(1), -1] : [k, 1]));
    const v = (p) => ks.map(([k, s]) => (Number(get(p, k)) || 0) * s);
    return players.map((p, i) => ({ p, i, v: v(p) })).sort((a, b) => {
      for (let j = 0; j < a.v.length; j++) if (a.v[j] !== b.v[j]) return b.v[j] - a.v[j];
      return a.i - b.i;
    }).map((r) => r.p);
  };
  T.turns = U;

  // ------------------------------------------------------------ T.flow (rounds and phases)
  // f = { phases, at, phase, round, lastRound, over }
  const F = {};
  F.create = (phases = ['main'], { rounds = null } = {}) => ({ phases: [...phases], at: 0, phase: phases[0], round: 1, lastRound: rounds || null, over: false });
  // next phase; after the last phase a new round starts → the new phase, or null once the last round is complete
  F.next = (f) => {
    if (f.over) return null;
    if (f.at + 1 < f.phases.length) { f.at += 1; f.phase = f.phases[f.at]; return f.phase; }
    if (f.lastRound != null && f.round >= f.lastRound) { f.over = true; return null; }
    f.round += 1; f.at = 0; f.phase = f.phases[0];
    return f.phase;
  };
  F.goto = (f, phase) => { const at = f.phases.indexOf(phase); if (at < 0 || f.over) return false; f.at = at; f.phase = phase; return true; };
  // the end was triggered: finish this round (plus `extra` rounds), then F.next() reports the game over
  F.endAfterRound = (f, extra = 0) => { const r = f.round + extra; f.lastRound = f.lastRound == null ? r : Math.min(f.lastRound, r); return f.lastRound; };
  F.isLastRound = (f) => f.lastRound != null && f.round >= f.lastRound;
  T.flow = F;

  // ------------------------------------------------------------ T.pending (decision stack)
  // A list of decisions { playerId, kind, options?, ...anything }. The top (last) one is resolved first: while it
  // exists only its owner acts. Use for targets, reactions/interrupts and multi-step effects.
  const P = {};
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  P.push = (stack, d) => { stack.push(d); return d; }; // on top: resolved next (interrupts)
  P.queue = (stack, d) => { stack.unshift(d); return d; }; // at the bottom: after everything already pending
  P.top = (stack) => (stack && stack.length ? stack[stack.length - 1] : null);
  P.who = (stack) => { const d = P.top(stack); return d ? d.playerId : null; };
  // pops the top decision if it belongs to playerId and choice is one of its options → the decision (with .choice) or null
  P.resolve = (stack, playerId, choice) => {
    const d = P.top(stack);
    if (!d || d.playerId !== playerId) return null;
    if (Array.isArray(d.options) && !d.options.some((o) => same(o, choice))) return null;
    stack.pop(); d.choice = choice;
    return d;
  };
  // actions() for the top decision: one { name: move, args: { choice } } per option
  P.actions = (stack, playerId, move = 'choose') => {
    const d = P.top(stack);
    if (!d || d.playerId !== playerId) return [];
    return (d.options || []).map((o) => (typeof o === 'object' && o ? { name: move, args: { choice: o } } : { name: move, args: { choice: o }, label: String(o) }));
  };
  T.pending = P;
}
