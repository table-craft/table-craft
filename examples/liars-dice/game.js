// Liar's Dice — the classic bluffing game for 2–5 players.
// Everyone shakes five dice under a cup and looks only at their own. In turn, raise the bid — "there are at least
// five 4s on the table" (ones are wild and count as any face) — or call the last bidder a liar. Then all cups are
// lifted: if the bid holds, the caller loses a die, otherwise the bidder does. The last player with dice wins.
//
// It shows: hidden dice (only you see yours — opponents see a cup until the reveal), private 3D throws
// (ctx.rollMany with `to: [player]`, so a roll effect never shows an opponent's faces), T.dice.counts for the
// reveal, T.turns for the bidding order, T.score.result for the ranking, a form + quick buttons in the prompt, and
// a bot that bids from its own dice and exact binomial odds for everyone else's.

const START_DICE = 5;
const FACES = 6;
const WILD = 1;
const COLORS = ['#c0392b', '#2e86c1', '#d4ac0d', '#28b463', '#8e44ad'];
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const FACE_WORD = { 2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes' };
const FACE_ONE = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
const CUP = '#5b3a24';

const P = (s, id) => s.players.find((p) => p.id === id);
const alive = (s) => s.players.filter((p) => p.n > 0);
const totalDice = (s) => alive(s).reduce((a, p) => a + p.n, 0);
const current = (s) => (s.phase === 'bid' ? T.turns.current(s.turn) : s.starter);
const bidText = (b) => `${WORDS[b.q] || b.q} ${b.q === 1 ? FACE_ONE[b.face] : FACE_WORD[b.face]}`; // "four fives"
const isRaise = (b, q, face) => !b || q > b.q || (q === b.q && face > b.face);
const matches = (values, face) => values.filter((v) => v === face || v === WILD).length;
function log(s, t) { s.log.push(`R${s.round} · ${t}`); if (s.log.length > 60) s.log.shift(); }

// P(at least k successes in n tries with chance p) — the odds that the hidden dice hold enough
function atLeast(n, k, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let term = (1 - p) ** n, cdf = 0; // P(X = 0), then P(X = i) by the recurrence
  for (let i = 0; i < k; i++) { cdf += term; term *= ((n - i) / (i + 1)) * (p / (1 - p)); }
  return Math.max(0, 1 - cdf);
}
// chance that a bid is true, as seen by `viewer` who knows only their own dice
const SUCCESS = 2 / FACES; // the face itself or a wild one
const chanceTrue = (s, viewer, b) => atLeast(totalDice(s) - viewer.n, b.q - matches(viewer.dice, b.face), SUCCESS);

// every legal raise over the current bid (quantities up to the number of dice on the table)
function raises(s) {
  const out = [];
  for (let q = s.bid ? s.bid.q : 1; q <= totalDice(s); q++) for (let face = 2; face <= FACES; face++) if (isRaise(s.bid, q, face)) out.push({ q, face });
  return out;
}

function startRound(s, ctx) {
  s.round += 1;
  s.phase = 'bid'; s.bid = null; s.reveal = null;
  const order = s.players.filter((p) => p.n > 0).map((p) => p.id);
  s.turn = T.turns.create(order, { start: s.starter });
  s.log.push(`— Round ${s.round} —`);
  // each cup is shaken in private: the roll effect (and its faces) only goes to the owner of the dice
  for (const p of alive(s)) {
    const r = ctx.rollMany(T.range(p.n).map((i) => ({ id: `die:${p.id}:${i}`, faces: FACES })), { by: p.id, to: [p.id] });
    p.dice = r.map((d) => d.face);
  }
  ctx.fx({ type: 'sound', name: 'shuffle' });
  log(s, `${P(s, s.starter).name} shook the cups — ${totalDice(s)} dice on the table.`);
}

module.exports = {
  meta: { name: "Liar's Dice", minPlayers: 2, maxPlayers: 5, description: 'Bid on dice nobody can fully see — or call the bluff. Ones are wild. Last player with dice wins.' },

  setup({ players, random, fx }) {
    const first = random.int(players.length);
    const s = {
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % COLORS.length], n: START_DICE, dice: [], outOrder: 0 })),
      phase: 'roll', starter: players[first].id, turn: null, bid: null, reveal: null, round: 0, outs: 0, log: [],
    };
    s.log.push(`${s.players[first].name} starts — shake the cups!`);
    fx({ type: 'banner', text: "Liar's Dice", sub: `${s.players[first].name} starts · ones are wild`, sound: 'gong' });
    return s;
  },

  moves: {
    // shake every cup and start a round (the round's starter does it)
    roll(s, ctx) {
      if (alive(s).length < 2) return { error: 'The game is over' };
      if (s.phase !== 'roll') return { error: 'The dice are already rolled' };
      if (ctx.playerId !== s.starter) return { error: `${P(s, s.starter).name} starts this round` };
      startRound(s, ctx);
      return s;
    },
    bid(s, ctx) {
      if (s.phase !== 'bid') return { error: 'Not bidding now' };
      const p = P(s, ctx.playerId);
      if (!p || T.turns.current(s.turn) !== p.id) return { error: 'It is not your turn' };
      const q = Number(ctx.args && ctx.args.q), face = Number(ctx.args && ctx.args.face);
      if (!Number.isInteger(q) || q < 1 || q > totalDice(s)) return { error: `Bid between 1 and ${totalDice(s)} dice` };
      if (!Number.isInteger(face) || face < 2 || face > FACES) return { error: 'Bid on a face from 2 to 6 (ones are wild)' };
      if (!isRaise(s.bid, q, face)) return { error: `Raise the bid: more dice, or the same number of a higher face than ${bidText(s.bid)}` };
      s.bid = { by: p.id, q, face };
      log(s, `${p.name} bids ${bidText(s.bid)}.`);
      T.turns.next(s.turn);
      return s;
    },
    liar(s, ctx) {
      if (s.phase !== 'bid') return { error: 'Not bidding now' };
      const p = P(s, ctx.playerId);
      if (!p || T.turns.current(s.turn) !== p.id) return { error: 'It is not your turn' };
      if (!s.bid) return { error: 'There is no bid to challenge yet' };
      const bidder = P(s, s.bid.by);
      const all = alive(s).flatMap((x) => x.dice);
      const counts = T.dice.counts(all);
      const count = (counts[s.bid.face] || 0) + (counts[WILD] || 0);
      const holds = count >= s.bid.q;
      const loser = holds ? p : bidder;
      log(s, `${p.name} calls ${bidder.name} a liar!`);
      log(s, `The cups are lifted: ${count} ${count === 1 ? 'die shows' : 'dice show'} ${s.bid.face}s or 1s — ${bidder.name}'s bid ${holds ? 'holds' : 'was a bluff'}. ${loser.name} loses a die.`);
      s.reveal = { caller: p.id, bidder: bidder.id, q: s.bid.q, face: s.bid.face, count, loser: loser.id };
      s.phase = 'roll'; s.bid = null;
      loser.n -= 1;
      const r = s.reveal;
      ctx.fx({ type: 'highlight', ids: alive(s).concat(loser.n ? [] : [loser]).flatMap((x) => x.dice.map((v, i) => (v === r.face || v === WILD ? `die:${x.id}:${i}` : null))).filter(Boolean), color: '#f7dc6f', ms: 3500 });
      ctx.fx({ type: 'banner', text: holds ? 'The bid holds!' : 'Bluff!', sub: `${count} × ${r.face}s on the table · ${loser.name} loses a die`, color: loser.color, sound: 'reveal' });
      if (!loser.n) {
        s.outs += 1; loser.outOrder = s.outs;
        log(s, `${loser.name} is out of dice.`);
        ctx.fx({ type: 'toast', text: `${loser.name} is out!`, tone: 'bad' });
      }
      const left = alive(s);
      if (left.length === 1) {
        left[0].outOrder = s.players.length;
        log(s, `${left[0].name} is the last player with dice and wins!`);
        ctx.fx({ type: 'banner', text: `${left[0].name} wins!`, sub: `${left[0].n} ${left[0].n === 1 ? 'die' : 'dice'} left`, color: left[0].color, sound: 'win' });
      } else {
        // the loser starts the next round; if they are out, the next player still in the game does
        const i = s.players.indexOf(loser);
        s.starter = T.orderFrom(s.players, i, (x) => x.n <= 0)[0].id;
      }
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const over = alive(s).length < 2;
    const who = over ? null : current(s);
    const myTurn = !!(me && who === me.id);
    const lifted = !!s.reveal && s.phase === 'roll'; // cups are up between a call and the next shake
    const zones = [
      { id: 'bid', layout: 'row', at: [0, 0], size: [16, 9], mat: { color: '#2b1d14' }, label: 'Current bid', gap: 1 },
    ];
    const objects = [];
    if (s.bid || s.reveal) {
      const b = s.bid || s.reveal;
      objects.push({ id: 'bid-die', kind: 'die', faces: FACES, value: b.face - 1, color: '#f4efe4', ink: '#2b1d14', size: 3.4, zone: 'bid',
        label: `${b.q} × ${b.face}s`,
        tip: `${P(s, b.by || b.bidder).name} bid ${bidText(b)}` });
    }
    for (const p of s.players) {
      zones.push({ id: `cup:${p.id}`, seat: p.id, layout: 'row', at: [0, 1], gap: 0.6 });
      if (!p.n && !(lifted && s.reveal.loser === p.id)) continue;
      const showDice = p.dice.length && (lifted || (me && me.id === p.id));
      if (showDice) {
        // dice faces are sent only to their owner — and to everyone once the cups are lifted
        p.dice.forEach((v, i) => {
          const lost = i >= p.n;
          const hit = lifted && (v === s.reveal.face || v === WILD);
          objects.push({ id: `die:${p.id}:${i}`, kind: 'die', faces: FACES, value: v - 1, color: lost ? '#7b7d7d' : '#f4efe4', ink: p.color, size: 2.2, zone: `cup:${p.id}`, order: i,
            glow: hit ? '#f7dc6f' : false, tip: lost ? 'Lost this round' : `${v}${v === WILD ? ' (wild)' : ''}` });
        });
      } else {
        objects.push({ id: `cup-obj:${p.id}`, kind: 'token', shape: 'cylinder', color: CUP, size: 4.2, material: 'wood', zone: `cup:${p.id}`,
          label: `${p.n} ${p.n === 1 ? 'die' : 'dice'}`, tip: `${p.name}'s cup: ${p.n} hidden ${p.n === 1 ? 'die' : 'dice'}` });
      }
    }
    // prompt
    let prompt;
    if (over) {
      const w = alive(s)[0];
      prompt = { type: 'text', text: `🏆 ${w.name} is the last with dice!`, size: 'lg', bold: true };
    } else if (myTurn && s.phase === 'roll') {
      prompt = { type: 'col', children: [
        s.reveal ? { type: 'text', text: `${s.reveal.count} × ${s.reveal.face}s (ones wild) were on the table — ${P(s, s.reveal.loser).name} lost a die.`, muted: true } : null,
        { type: 'text', text: 'You start this round.', bold: true },
        { type: 'button', label: '🎲 Shake the cups', variant: 'primary', move: { name: 'roll' } },
      ].filter(Boolean) };
    } else if (myTurn) {
      const quick = raises(s).filter((r) => !s.bid || r.q <= s.bid.q + 1).slice(0, 6);
      prompt = { type: 'col', children: [
        { type: 'text', text: s.bid ? `${P(s, s.bid.by).name} bids ${bidText(s.bid)}. Raise or call the bluff.` : 'Open the bidding.', bold: true },
        { type: 'text', text: `Your dice: ${me.dice.join(' · ')} — ${totalDice(s)} dice in play, ones are wild`, muted: true },
        { type: 'row', wrap: true, children: quick.map((r) => ({ type: 'button', label: `${r.q} × ${r.face}s`, variant: 'ghost', move: { name: 'bid', args: r } })) },
        { type: 'form', fields: [
          { id: 'q', label: 'How many', kind: 'number', min: 1, max: totalDice(s) },
          { id: 'face', label: 'Face', kind: 'select', options: [2, 3, 4, 5, 6].map((f) => ({ value: String(f), label: FACE_WORD[f] })) },
        ], submit: { label: 'Bid', move: 'bid' } },
        s.bid ? { type: 'button', label: `Liar! (challenge ${P(s, s.bid.by).name})`, variant: 'danger', move: { name: 'liar' } } : null,
      ].filter(Boolean) };
    } else {
      prompt = { type: 'col', children: [
        { type: 'text', text: s.phase === 'roll' ? `⏳ ${P(s, who).name} will shake the cups` : `⏳ ${P(s, who).name} is thinking`, muted: true },
        me && me.dice.length && me.n && !lifted ? { type: 'text', text: `Your dice: ${me.dice.join(' · ')}`, muted: true } : null,
      ].filter(Boolean) };
    }
    const status = over ? 'Game over' : s.phase === 'roll' ? `Round ${s.round + 1} · ${P(s, who).name} shakes` : `Round ${s.round} · ${P(s, who).name} to bid · ${totalDice(s)} dice`;
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'tavern' }, table: { surface: 'leather', shape: 'round' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: who === p.id, me: !!(me && me.id === p.id), sub: p.n ? `${p.n} ${p.n === 1 ? 'die' : 'dice'}` : 'out' })),
        zones, objects,
      },
      hud: {
        title: "Liar's Dice", status,
        players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: who === p.id, me: !!(me && me.id === p.id), out: !p.n,
          badges: [s.bid && s.bid.by === p.id && s.phase === 'bid' ? `Bid: ${s.bid.q} × ${s.bid.face}s` : null, s.starter === p.id && s.phase === 'roll' && !over ? 'Starts' : null].filter(Boolean),
          stats: [{ label: 'Dice', value: p.n, key: true }] })),
        panels: [{ id: 'rules', title: 'How to play', icon: '🎲', side: 'right', open: false, node: { type: 'col', children: [
          { type: 'text', text: 'Raise: more dice, or the same number of a higher face.' },
          { type: 'text', text: 'Ones are wild — they count as every face.' },
          { type: 'text', text: 'Liar!: lift the cups. Bid holds → caller loses a die; otherwise the bidder does.' },
          { type: 'text', text: 'The loser starts the next round. Last player with dice wins.' },
        ] } }],
        prompt, promptTone: myTurn ? '' : 'wait', log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (alive(s).length > 1) return null;
    return T.score.result(s.players, { keys: ['n', 'outOrder'], reason: `${alive(s)[0].name} is the last player with dice` });
  },

  // balance lab: my dice against the strongest rival's
  score(s, { playerId }) {
    const me = P(s, playerId);
    if (!me.n) return -10 + me.outOrder;
    const lead = me.n - Math.max(0, ...s.players.filter((p) => p !== me).map((p) => p.n));
    const risk = s.phase === 'bid' && s.bid && s.bid.by === me.id ? 1 - chanceTrue(s, me, s.bid) : 0; // my standing bid may be called
    return lead - risk;
  },

  actions(s, { playerId }) {
    if (alive(s).length < 2) return [];
    if (s.phase === 'roll') return playerId === s.starter ? [{ name: 'roll' }] : [];
    if (T.turns.current(s.turn) !== playerId) return [];
    const out = raises(s).map((r) => ({ name: 'bid', args: r }));
    if (s.bid) out.push({ name: 'liar' });
    return out;
  },

  // The bot knows only its own dice (as a human would). It calls when the bid is less likely to be true than its
  // best raise, and otherwise makes the raise most likely to hold, favouring small raises on faces it holds.
  bot(s, { playerId, actions, random }) {
    const me = P(s, playerId);
    if (s.phase === 'roll') return actions[0];
    const bids = actions.filter((a) => a.name === 'bid');
    if (!s.bid) {
      // opening: my strongest face, as many as are likely (≥ 60%) to be there
      const face = [2, 3, 4, 5, 6].sort((a, b) => matches(me.dice, b) - matches(me.dice, a) || random.float() - 0.5)[0];
      let q = 1;
      while (q < totalDice(s) && chanceTrue(s, me, { q: q + 1, face }) >= 0.6) q++;
      return bids.find((a) => a.args.q === q && a.args.face === face) || bids[0];
    }
    let best = null, bestScore = -Infinity, bestP = 0;
    for (const a of bids) {
      const b = a.args;
      if (s.bid && b.q > s.bid.q + 2) continue; // big jumps only help the next player
      const pt = chanceTrue(s, me, b);
      const sc = pt + matches(me.dice, b.face) * 0.03 - (s.bid ? (b.q - s.bid.q) * 0.04 : 0) + random.float() * 0.06;
      if (sc > bestScore) { bestScore = sc; best = a; bestP = pt; }
    }
    if (s.bid) {
      // a bidder usually holds some of what they bid: credit them one matching die before doubting
      const credit = { ...s.bid, q: s.bid.q - 1 };
      const doubt = 1 - chanceTrue(s, me, credit);
      if (!best || doubt > bestP + (random.float() - 0.5) * 0.1) return actions.find((a) => a.name === 'liar');
    }
    return best || actions[0];
  },

  invariants(s) {
    const e = [];
    s.players.forEach((p) => {
      if (p.n < 0 || p.n > START_DICE) e.push(`${p.name} has ${p.n} dice`);
      if (s.phase === 'bid' && p.dice.length !== p.n && p.n > 0) e.push(`${p.name}'s dice do not match their count`);
      if (p.dice.some((v) => !Number.isInteger(v) || v < 1 || v > FACES)) e.push(`${p.name} has an impossible die`);
    });
    if (s.bid && (s.bid.q > totalDice(s) || s.bid.face < 2)) e.push('Impossible bid');
    return e;
  },
};
