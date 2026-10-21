// Spice Bazaar — a pick-and-pass card drafting game for 2–5 players.
// Three market days. Each day everyone gets a hand of spice cards, secretly picks one, then all picks are revealed at
// once and the hands are passed on (left on days 1 and 3, right on day 2). Collect sets — Saffron in threes, Pepper in
// pairs, Cinnamon in heaps, teas of different kinds — win the carpet majority each day and hoard Caravan Seals for the
// end. Most coins after three days wins.
//
// It shows the mechanics library: simultaneous secret picks (T.secret), pick and pass with alternating direction
// (T.draft), set collection (T.sets + T.score.table), majorities (T.area.majority) and the final ranking
// (T.score.result). Hidden hands use opaque card ids, so nothing about a face-down card reaches other players.

const DAYS = 3;
const HAND = { 2: 10, 3: 9, 4: 8, 5: 7 };
const COLORS = ['#c8642b', '#3f78a8', '#6e7b3a', '#8a6aa8', '#b8495a'];
const TEAS = ['mint', 'rose', 'black', 'jasmine'];
const SAFFRON = 10; // per three
const PEPPER = 5; // per pair
const CINNAMON = [0, 1, 3, 6, 10, 15];
const TEA_SET = [0, 1, 3, 6, 12]; // per set of different teas
const CARPET = [6, 3]; // most / second most carpet knots each day
const SEAL = 6; // most seals at the end +6, fewest −6 (3+ players)

const KINDS = {
  saffron: { name: 'Saffron', color: '#d9822b', icon: '✿', count: 15, text: 'Every three Saffron: 10 coins.', group: 'Threes' },
  pepper: { name: 'Pepper', color: '#9c2f25', icon: '●', count: 15, text: 'Every pair of Pepper: 5 coins.', group: 'Pairs' },
  cinnamon: { name: 'Cinnamon', color: '#8b5a2b', icon: '❦', count: 15, text: '1 · 3 · 6 · 10 · 15 coins for 1–5 Cinnamon.', group: 'Heap' },
  mint: { name: 'Mint Tea', color: '#3f8f5a', icon: '❧', count: 6, text: 'Different teas: 1 · 3 · 6 · 12 per set.', group: 'Tea' },
  rose: { name: 'Rose Tea', color: '#c45c7c', icon: '❀', count: 6, text: 'Different teas: 1 · 3 · 6 · 12 per set.', group: 'Tea' },
  black: { name: 'Black Tea', color: '#3b3330', icon: '❖', count: 6, text: 'Different teas: 1 · 3 · 6 · 12 per set.', group: 'Tea' },
  jasmine: { name: 'Jasmine Tea', color: '#b9a94a', icon: '✾', count: 6, text: 'Different teas: 1 · 3 · 6 · 12 per set.', group: 'Tea' },
  carpet1: { name: 'Silk Carpet', color: '#5a4a9c', icon: '▦', count: 6, knots: 1, text: 'Most knots today: 6. Second: 3.', group: 'Carpet' },
  carpet2: { name: 'Silk Carpet', color: '#5a4a9c', icon: '▦', count: 12, knots: 2, text: 'Most knots today: 6. Second: 3.', group: 'Carpet' },
  carpet3: { name: 'Silk Carpet', color: '#5a4a9c', icon: '▦', count: 8, knots: 3, text: 'Most knots today: 6. Second: 3.', group: 'Carpet' },
  seal: { name: 'Caravan Seal', color: '#2f6b7a', icon: '⚜', count: 13, text: 'Kept to the end. Most seals: +6. Fewest: −6.', group: 'Seal' },
};
const BACK = { title: 'BAZAAR', color: '#6b3d1f', icon: '✦' };

const P = (s, id) => s.players.find((p) => p.id === id);
const kindOf = (s, c) => s.cards[c];
const def = (s, c) => KINDS[s.cards[c]];
function log(s, t) { s.log.push(`R${s.day} · ${t}`); if (s.log.length > 60) s.log.shift(); }
const knots = (s, cards) => cards.reduce((a, c) => a + (def(s, c).knots || 0), 0);

// coins for one tableau (everything but the carpet majority, which needs every player)
function setScore(s, cards) {
  const c = T.sets.count(cards.map((x) => kindOf(s, x)));
  const teas = {}; TEAS.forEach((t) => { if (c[t]) teas[t] = c[t]; });
  return {
    saffron: T.sets.ofAKind({ saffron: c.saffron || 0 }, 3) * SAFFRON,
    pepper: T.sets.ofAKind({ pepper: c.pepper || 0 }, 2) * PEPPER,
    cinnamon: T.score.table(c.cinnamon || 0, CINNAMON),
    tea: T.sets.distinct(teas).reduce((a, n) => a + T.score.table(n, TEA_SET), 0),
  };
}
const sumParts = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// how much one more card is worth to a player right now (bots and the greedy evaluation)
function pickValue(s, p, card, handLeft) {
  const k = kindOf(s, card); const d = KINDS[k];
  const mine = p.tableau.map((x) => kindOf(s, x));
  const n = mine.filter((x) => x === k).length;
  const late = handLeft <= 2;
  if (k === 'saffron') return n % 3 === 2 ? 10 : n % 3 === 1 ? (late ? 0.5 : 4.5) : (handLeft >= 4 ? 3 : 0.5);
  if (k === 'pepper') return n % 2 === 1 ? 5 : (late && handLeft < 2 ? 0.5 : 2.5);
  if (k === 'cinnamon') return T.score.table(n + 1, CINNAMON) - T.score.table(n, CINNAMON) + (n < 4 && !late ? 0.8 : 0);
  if (TEAS.includes(k)) {
    const before = setScore(s, p.tableau).tea;
    return setScore(s, [...p.tableau, card]).tea - before + (n === 0 ? 1 : 0);
  }
  if (d.knots) return d.knots * 1.4;
  if (k === 'seal') return s.day === DAYS ? 3.5 : 2.2;
  return 0;
}

function dealDay(s, ctx) {
  const n = HAND[s.order.length];
  s.order.forEach((id) => { s.hands[id] = T.draw(s.deck, [], ctx.random, n); });
  s.picks = T.secret.create(s.order);
  log(s, `— Day ${s.day} —`);
  ctx.fx({ type: 'banner', text: `Market day ${s.day}`, sub: `Hands pass ${T.draft.dir(s.day) > 0 ? 'left ←' : 'right →'}`, color: '#d9822b', sound: 'gong' });
}

function scoreDay(s, ctx) {
  const carpets = Object.fromEntries(s.players.map((p) => [p.id, knots(s, p.tableau)]));
  const award = T.area.majority(carpets, s.players.length === 2 ? [CARPET[0]] : CARPET, { tie: 'split' });
  for (const p of s.players) {
    const parts = setScore(s, p.tableau);
    parts.carpet = award[p.id] || 0;
    const got = sumParts(parts);
    p.score += got; p.last = got; p.seals += p.tableau.filter((c) => kindOf(s, c) === 'seal').length;
    const bits = Object.entries(parts).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
    log(s, `${p.name} earned ${got} coins${bits.length ? ` (${bits.join(', ')})` : ''}.`);
    // seals stay in front of the player; everything else is sold
    p.sealCards.push(...p.tableau.filter((c) => kindOf(s, c) === 'seal'));
    s.discard.push(...p.tableau.filter((c) => kindOf(s, c) !== 'seal'));
    p.tableau = [];
  }
  const best = s.players.slice().sort((a, b) => b.last - a.last)[0];
  ctx.fx({ type: 'banner', text: `Day ${s.day} is over`, sub: `${best.name} earned the most: ${best.last} coins`, color: best.color });
  if (s.day === DAYS) {
    const counts = Object.fromEntries(s.players.map((p) => [p.id, p.seals]));
    const most = T.area.majority(counts, [SEAL], { tie: 'split', min: 0 });
    // fewest: a majority over negated counts
    const fewest = s.players.length > 2 ? T.area.majority(Object.fromEntries(s.players.map((p) => [p.id, -p.seals])), [SEAL], { tie: 'split', min: -Infinity }) : {};
    for (const p of s.players) {
      const d = (most[p.id] || 0) - (fewest[p.id] || 0);
      if (!d) continue;
      p.score += d;
      log(s, `${p.name} ${d > 0 ? 'gains' : 'loses'} ${Math.abs(d)} coins for Caravan Seals (${p.seals}).`);
    }
    s.over = true;
    const r = T.score.result(s.players, { keys: ['score', 'seals'] });
    const names = r.winners.map((id) => P(s, id).name).join(' & ');
    log(s, `Game over — ${names} win${r.winners.length > 1 ? '' : 's'} with ${r.ranking[0].score} coins.`);
    ctx.fx({ type: 'banner', text: `${names} win${r.winners.length > 1 ? '' : 's'}!`, sub: `${r.ranking[0].score} coins`, sound: 'win', color: P(s, r.winners[0]).color });
    return;
  }
  s.day += 1;
  dealDay(s, ctx);
}

function revealPicks(s, ctx) {
  const picks = T.secret.reveal(s.picks);
  const ids = [];
  for (const id of s.order) {
    const p = P(s, id); const card = picks[id];
    T.draft.pick(s.hands[id], card, p.tableau);
    ids.push(card);
    log(s, `${p.name} took ${def(s, card).name}${def(s, card).knots ? ` (${def(s, card).knots} knots)` : ''}.`);
  }
  ctx.fx({ type: 'reveal', ids, title: 'picks revealed', text: s.order.map((id) => `${P(s, id).name}: ${def(s, picks[id]).name}`).join(' · ') });
  ctx.fx({ type: 'sound', name: 'flip' });
  if (s.hands[s.order[0]].length === 0) { scoreDay(s, ctx); return; }
  T.draft.pass(s.hands, s.order, T.draft.dir(s.day));
  s.picks = T.secret.create(s.order);
}

module.exports = {
  meta: {
    name: 'Spice Bazaar', minPlayers: 2, maxPlayers: 5,
    description: 'Pick a spice, pass the rest. Draft sets over three market days — threes of Saffron, pairs of Pepper, teas, carpets and seals.',
  },

  setup({ players, random, fx }) {
    // ids are given after shuffling, so an id says nothing about the card behind it
    const kinds = [];
    for (const [k, d] of Object.entries(KINDS)) for (let i = 0; i < d.count; i++) kinds.push(k);
    const shuffled = random.shuffle(kinds);
    const cards = {}; const deck = [];
    shuffled.forEach((k, i) => { cards[`c${i}`] = k; deck.push(`c${i}`); });
    const s = {
      cards, deck, discard: [], hands: {}, picks: null, day: 1, over: false, log: [],
      order: players.map((p) => p.id),
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % COLORS.length], score: 0, last: 0, seals: 0, tableau: [], sealCards: [] })),
    };
    dealDay(s, { random, fx });
    return s;
  },

  moves: {
    pick(s, ctx) {
      if (s.over) return { error: 'The game is over' };
      const hand = s.hands[ctx.playerId];
      if (!hand) return { error: 'You are not at this table' };
      const card = ctx.args && ctx.args.card;
      if (typeof card !== 'string' || !hand.includes(card)) return { error: 'That card is not in your hand' };
      if (!T.secret.commit(s.picks, ctx.playerId, card)) return { error: 'Too late to pick' };
      if (T.secret.allIn(s.picks)) revealPicks(s, ctx);
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const mine = T.secret.view(s.picks, playerId, 'hidden');
    const waiting = !s.over && me && mine[me.id] === null;
    const zones = [
      { id: 'deck', layout: 'stack', at: [-7, 0], label: 'Spice sacks' },
      { id: 'discard', layout: 'pile', at: [7, 0], label: 'Sold' },
    ];
    const objects = [
      { id: 'deckObj', kind: 'deck', zone: 'deck', count: s.deck.length, back: BACK, tip: `${s.deck.length} cards left for later days` },
    ];
    s.discard.slice(-4).forEach((c) => objects.push({ id: c, kind: 'card', zone: 'discard', face: face(s, c), size: 'mini' }));
    for (const p of s.players) {
      const isMe = !!(me && me.id === p.id);
      zones.push({ id: `hand:${p.id}`, seat: p.id, layout: isMe ? 'fan' : 'row', at: [0, 7], gap: isMe ? 0.4 : -2.6 });
      zones.push({ id: `tab:${p.id}`, seat: p.id, layout: 'grid', cols: 6, at: [0, -4], gap: 0.5, label: `${p.name}'s stall` });
      zones.push({ id: `seal:${p.id}`, seat: p.id, layout: 'pile', at: [-20, 2], label: 'Seals' });
      const chosen = mine[p.id];
      (s.hands[p.id] || []).forEach((c, i) => {
        const picked = isMe && chosen === c;
        objects.push({
          id: c, kind: 'card', zone: `hand:${p.id}`, order: i, faceUp: isMe, face: isMe ? face(s, c) : undefined, back: BACK, enterFrom: 'deck',
          glow: picked ? '#f2c14e' : undefined, label: picked ? 'Your pick' : undefined, size: isMe ? 'poker' : 'mini',
          click: isMe && !s.over && !picked ? { name: 'pick', args: { card: c } } : undefined,
          tip: isMe ? `${def(s, c).name} — worth about ${pickValue(s, p, c, s.hands[p.id].length).toFixed(1)} now` : undefined,
        });
      });
      p.tableau.forEach((c, i) => objects.push({ id: c, kind: 'card', zone: `tab:${p.id}`, order: i, face: face(s, c), size: 'mini' }));
      p.sealCards.forEach((c, i) => objects.push({ id: c, kind: 'card', zone: `seal:${p.id}`, order: i, face: face(s, c), size: 'mini' }));
    }
    const status = s.over ? 'Game over' : `Day ${s.day}/${DAYS} · ${T.secret.pending(s.picks).length} still choosing`;
    const prompt = s.over
      ? { type: 'col', children: [{ type: 'text', text: '🏆 Final coins', bold: true, size: 'lg' }, { type: 'scores', items: s.players.slice().sort((a, b) => b.score - a.score).map((p) => ({ label: p.name, value: p.score, color: p.color })) }] }
      : !me ? { type: 'text', text: `Day ${s.day}: players are choosing spices.`, muted: true }
        : waiting
          ? { type: 'col', children: [
            { type: 'text', text: 'Pick one card from your hand.', bold: true },
            { type: 'text', text: `Everyone picks at the same time; the rest of your hand goes ${T.draft.dir(s.day) > 0 ? 'to the left' : 'to the right'}.`, muted: true }] }
          : { type: 'col', children: [
            { type: 'text', text: `You picked ${def(s, mine[me.id]).name}.`, bold: true },
            { type: 'text', text: `Waiting for ${T.secret.pending(s.picks).map((id) => P(s, id).name).join(', ')}… (click another card to change your mind)`, muted: true }] };
    const rules = { type: 'col', gap: 4, children: [
      { type: 'text', text: '✿ Saffron — every 3: 10', size: 'sm' },
      { type: 'text', text: '● Pepper — every pair: 5', size: 'sm' },
      { type: 'text', text: '❦ Cinnamon — 1/3/6/10/15', size: 'sm' },
      { type: 'text', text: '❧ Teas — set of different kinds: 1/3/6/12', size: 'sm' },
      { type: 'text', text: '▦ Carpets — most knots each day 6, second 3', size: 'sm' },
      { type: 'text', text: '⚜ Seals — kept; at the end most +6, fewest −6', size: 'sm' },
    ] };
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'tavern' }, table: { surface: 'leather' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: !s.over && mine[p.id] === null, me: !!(me && me.id === p.id), sub: `${p.score} coins${!s.over && mine[p.id] !== null ? ' · picked ✓' : ''}` })),
        zones, objects,
      },
      hud: {
        title: 'Spice Bazaar', status, myTurn: !!waiting,
        players: s.players.map((p) => ({
          id: p.id, name: p.name, color: p.color, active: !s.over && mine[p.id] === null, me: !!(me && me.id === p.id),
          badges: !s.over && mine[p.id] !== null ? ['Picked'] : [],
          stats: [
            { label: 'Coins', value: p.score, color: '#b8901f', key: true },
            { label: 'Knots', value: knots(s, p.tableau), key: true },
            { label: 'Seals', value: p.seals + p.tableau.filter((c) => kindOf(s, c) === 'seal').length },
            { label: 'Hand', value: (s.hands[p.id] || []).length },
          ],
        })),
        prompt, promptTone: waiting ? '' : 'wait', promptTitle: s.over ? 'Game over' : `Day ${s.day}`,
        panels: [{ id: 'rules', title: 'Scoring', icon: '✦', side: 'left', open: false, node: rules }],
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.over) return null;
    return T.score.result(s.players, { keys: ['score', 'seals'], reason: (r) => `${r[0].name} sold the finest spices (${r[0].score} coins)` });
  },

  // balance lab: banked coins + what the current stall (and my secret pick) is worth now
  score(s, { playerId }) {
    const p = P(s, playerId);
    const pick = s.picks && !s.picks.revealed ? s.picks.choices[playerId] : undefined;
    const cards = pick ? [...p.tableau, pick] : p.tableau;
    const sealsNow = p.seals + cards.filter((c) => kindOf(s, c) === 'seal').length;
    return p.score + sumParts(setScore(s, cards)) + knots(s, cards) * 1.2 + sealsNow * 1.5;
  },

  actions(s, { playerId }) {
    if (s.over || !s.hands[playerId]) return [];
    const chosen = s.picks.choices[playerId];
    // changing your mind is allowed but does not move the game on
    return s.hands[playerId].filter((c) => c !== chosen).map((c) => ({ name: 'pick', args: { card: c }, ...(chosen !== undefined ? { free: true } : {}) }));
  },

  bot(s, { playerId, actions, random }) {
    const p = P(s, playerId);
    const main = actions.filter((a) => !a.free);
    if (!main.length) return null;
    const left = s.hands[playerId].length;
    let best = main[0]; let bv = -Infinity;
    for (const a of main) { const v = pickValue(s, p, a.args.card, left) + random.float() * 0.6; if (v > bv) { bv = v; best = a; } }
    return best;
  },

  invariants(s) {
    const e = [];
    const held = Object.values(s.hands).reduce((a, h) => a + h.length, 0) + s.players.reduce((a, p) => a + p.tableau.length + p.sealCards.length, 0);
    if (held + s.deck.length + s.discard.length !== Object.keys(s.cards).length) e.push('Card count changed');
    const sizes = new Set(Object.values(s.hands).map((h) => h.length));
    if (sizes.size > 1) e.push('Hands have different sizes');
    s.players.forEach((p) => { if (p.sealCards.length !== p.seals) e.push(`${p.name}: seal count mismatch`); });
    return e;
  },
};

function face(s, c) {
  const d = def(s, c);
  return {
    title: d.name, subtitle: d.group, text: d.text, color: d.color, icon: d.icon,
    corners: d.knots ? { tl: { text: String(d.knots), sub: 'knots' } } : undefined,
  };
}
