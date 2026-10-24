// Interaction & hidden information: simultaneous secret choices, auctions, votes, trades and hidden roles.
// Self-contained: injected into sandboxes via toString().

export function installInteraction(T) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ------------------------------------------------------------ T.secret (commit, then reveal)
  // slot = { ids, choices: { playerId: choice }, revealed }
  const X = {};
  X.create = (ids) => ({ ids: [...ids], choices: {}, revealed: false });
  // a player may change their mind until the reveal → false if not a participant, already revealed or no choice
  X.commit = (slot, id, choice) => { if (slot.revealed || !slot.ids.includes(id) || choice === undefined) return false; slot.choices[id] = choice; return true; };
  X.pending = (slot) => slot.ids.filter((id) => !has(slot.choices, id));
  X.allIn = (slot) => X.pending(slot).length === 0;
  X.reveal = (slot) => { slot.revealed = true; return slot.choices; };
  // for view(): { playerId: choice } — others' choices read `mask` until revealed, null = not chosen yet
  X.view = (slot, viewerId, mask = true) => {
    const out = {};
    for (const id of slot.ids) out[id] = !has(slot.choices, id) ? null : slot.revealed || id === viewerId ? slot.choices[id] : mask;
    return out;
  };
  T.secret = X;

  // ------------------------------------------------------------ T.auction
  // a = { kind, order, i, min, step, high, leader, passed, acted, price?, floor?, closed?, declined? }
  //   'open': bid or pass in turn until everyone but the leader has passed (passing is final).
  //   'once': once around — everyone bids or passes exactly once, the highest bid wins.
  //   'dutch': the price drops (T.auction.lower) until someone takes it (T.auction.take).
  const A = {};
  A.create = (ids, { kind = 'open', min = 1, step = 1, start = 0, price = 0, floor = 0, exclude = [] } = {}) => {
    const order = [...(ids || [])];
    const i = typeof start === 'number' ? start : Math.max(0, order.indexOf(start));
    if (kind === 'dutch') {
      const eligible = order.filter((id) => !exclude.includes(id));
      return { kind, order: eligible, declined: [], price, step, floor, leader: null, high: 0, closed: eligible.length === 0 };
    }
    return { kind, order, i, min, step, high: 0, leader: null, passed: [], acted: [] };
  };
  A.done = (a) => {
    if (a.kind === 'dutch') return a.leader != null || a.closed;
    if (a.kind === 'once') return a.acted.length >= a.order.length;
    const left = a.order.filter((id) => !a.passed.includes(id));
    return left.length === 0 || (a.leader != null && left.length === 1 && left[0] === a.leader);
  };
  // whose turn it is to bid or pass (null when over; anyone may take a dutch offer)
  A.turn = (a) => (a.kind === 'dutch' || A.done(a) ? null : a.order[a.i]);
  A.minBid = (a) => (a.leader == null ? a.min : a.high + a.step);
  const advance = (a, id) => {
    if (a.kind === 'once') a.acted.push(id);
    for (let k = 1; k <= a.order.length; k++) {
      const j = (a.i + k) % a.order.length; const c = a.order[j];
      if (a.passed.includes(c) || c === a.leader || (a.kind === 'once' && a.acted.includes(c))) continue;
      a.i = j; return;
    }
  };
  A.bid = (a, id, amount) => {
    if (A.turn(a) !== id || !(amount >= A.minBid(a))) return false;
    a.high = amount; a.leader = id; advance(a, id);
    return true;
  };
  A.pass = (a, id) => { if (A.turn(a) !== id) return false; a.passed.push(id); advance(a, id); return true; };
  // the amounts this player may bid now, up to `budget` (slice it if the list is long)
  A.legalBids = (a, id, budget) => { const out = []; if (A.turn(a) !== id) return out; for (let x = A.minBid(a); x <= budget; x += a.step) out.push(x); return out; };
  // dutch: lower the price one step → the new price, or null once it would drop below the floor (no sale)
  A.lower = (a) => {
    if (A.done(a)) return null;
    a.declined = [];
    if (a.price - a.step < a.floor) { a.closed = true; return null; }
    a.price -= a.step;
    return a.price;
  };
  A.decline = (a, id) => {
    if (a.kind !== 'dutch' || A.done(a) || !a.order.includes(id)) return false;
    if (!a.declined) a.declined = [];
    if (a.declined.includes(id)) return false;
    a.declined.push(id);
    if (a.declined.length === a.order.length) A.lower(a);
    return true;
  };
  A.take = (a, id) => {
    if (a.kind !== 'dutch' || A.done(a) || !a.order.includes(id) || a.declined.includes(id)) return false;
    a.leader = id; a.high = a.price; return true;
  };
  // → { id, price } once the auction is over and someone won it, else null
  A.winner = (a) => (A.done(a) && a.leader != null ? { id: a.leader, price: a.high } : null);
  // Sealed bids { playerId: amount } → { id, bid, price, tied } or null. Ties at the top go to the first id in
  // `order`, else a random one (with `random`), else the first bid listed. price: 'first' or 'second' (Vickrey).
  A.sealed = (bids, { order, random, price = 'first' } = {}) => {
    const rows = Object.keys(bids || {}).filter((id) => Number.isFinite(bids[id])).map((id) => [id, bids[id]]);
    if (!rows.length) return null;
    const best = Math.max(...rows.map((r) => r[1]));
    const tied = rows.filter((r) => r[1] === best).map((r) => r[0]);
    let id = tied[0];
    if (tied.length > 1 && order) id = [...tied].sort((x, y) => (order.indexOf(x) + 1 || Infinity) - (order.indexOf(y) + 1 || Infinity))[0];
    else if (tied.length > 1 && random) id = random.pick(tied);
    const rest = rows.filter((r) => r[0] !== id).map((r) => r[1]);
    return { id, bid: best, price: price === 'second' ? (rest.length ? Math.max(...rest) : best) : best, tied };
  };
  T.auction = A;

  // ------------------------------------------------------------ T.vote
  // votes = { voterId: choice }; null/undefined abstains. weight: { voterId: n } or (voterId) → n.
  const V = {};
  V.tally = (votes, weight) => {
    const out = {};
    for (const id of Object.keys(votes || {})) {
      const c = votes[id]; if (c == null) continue;
      const w = weight == null ? 1 : typeof weight === 'function' ? weight(id) : weight[id];
      out[c] = (out[c] || 0) + (Number(w) || 0);
    }
    return out;
  };
  // → { winner, counts, tied }. tie: 'none' (no winner), 'random' (needs random) or a priority list of choices.
  // need: votes the winner needs (a number, or 'majority' = more than half of the votes cast).
  V.result = (votes, { weight, tie = 'none', random, need = 0 } = {}) => {
    const counts = V.tally(votes, weight); const keys = Object.keys(counts);
    const top = keys.length ? Math.max(...keys.map((k) => counts[k])) : 0;
    const tied = keys.filter((k) => counts[k] === top);
    let winner = tied.length === 1 ? tied[0] : null;
    if (tied.length > 1 && tie === 'random' && random) winner = random.pick(tied);
    if (tied.length > 1 && Array.isArray(tie)) winner = tie.find((c) => tied.includes(String(c))) ?? null;
    const req = need === 'majority' ? Math.floor(T.sum(counts) / 2) + 1 : Number(need) || 0;
    if (top < req || !keys.length) winner = null;
    return { winner: winner == null ? null : String(winner), counts, tied };
  };
  T.vote = V;

  // ------------------------------------------------------------ T.trade
  // Resource dictionaries as in T.pay. offers: a list in state of { id, from, to (null = anyone), give, get }.
  const R = {};
  // a gives `give` to b and b gives `get` to a — all or nothing → true if both could pay
  R.swap = (a, b, give, get) => {
    if (!T.canPay(a, give) || !T.canPay(b, get)) return false;
    T.pay(a, give); T.pay(b, get); T.add(b, give); T.add(a, get);
    return true;
  };
  R.offer = (offers, { from, to = null, give = {}, get = {} }) => {
    const o = { id: offers.reduce((m, x) => Math.max(m, x.id), 0) + 1, from, to, give, get };
    offers.push(o); return o;
  };
  // offers playerId may accept
  R.open = (offers, playerId) => offers.filter((o) => o.from !== playerId && (o.to == null || o.to === playerId));
  // wallet: { playerId: resources } or (playerId) → resources. → true when the swap happened (the offer is removed)
  R.accept = (offers, id, by, wallet) => {
    const o = offers.find((x) => x.id === id);
    if (!o || !R.open([o], by).length) return false;
    const w = (p) => (typeof wallet === 'function' ? wallet(p) : wallet[p]);
    if (!R.swap(w(o.from), w(by), o.give, o.get)) return false;
    offers.splice(offers.indexOf(o), 1);
    return true;
  };
  // removes an offer → it, or null (check that the canceller made it)
  R.cancel = (offers, id) => { const i = offers.findIndex((x) => x.id === id); return i < 0 ? null : offers.splice(i, 1)[0]; };
  // trade with the bank at `rate`:1 (4:1, or 2:1 at a port) n times → false if unaffordable
  R.bank = (have, give, get, rate = 4, n = 1) => { if (!T.pay(have, { [give]: rate * n })) return false; T.add(have, { [get]: n }); return true; };
  T.trade = R;

  // ------------------------------------------------------------ T.roles (hidden roles and teams)
  const H = {};
  // roles: a list, or { playerCount: list } → { roles: { playerId: role }, rest: [set-aside roles] }
  H.deal = (ids, roles, random) => {
    const list = Array.isArray(roles) ? roles : roles && roles[ids.length];
    if (!list || list.length < ids.length) throw new Error(`T.roles.deal: not enough roles for ${ids.length} players`);
    const deck = random.shuffle(list); const out = {};
    ids.forEach((id, i) => { out[id] = deck[i]; });
    return { roles: out, rest: deck.slice(ids.length) };
  };
  // ids holding a role (a role, a list of roles or a predicate)
  H.who = (roles, role) => Object.keys(roles).filter((id) => (typeof role === 'function' ? role(roles[id]) : Array.isArray(role) ? role.includes(roles[id]) : roles[id] === role));
  // What viewerId knows → { playerId: role or label }, always including themselves.
  // sees: { viewerRole: [roles they recognise] | { role: label } } — e.g. { spy: ['spy'], merlin: { spy: 'evil' } }.
  H.known = (roles, viewerId, sees = {}) => {
    const mine = roles[viewerId]; const out = {};
    if (mine === undefined) return out;
    const rule = sees[mine];
    for (const id of Object.keys(roles)) {
      if (id === viewerId) { out[id] = mine; continue; }
      if (Array.isArray(rule) && rule.includes(roles[id])) out[id] = roles[id];
      else if (rule && !Array.isArray(rule) && has(rule, roles[id])) out[id] = rule[roles[id]];
    }
    return out;
  };
  T.roles = H;
}
