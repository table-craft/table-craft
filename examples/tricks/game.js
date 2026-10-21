// Lantern Tricks — an exact-bid trick-taking game for 3–4 players.
// Each hand the whole deck is dealt (17 cards each with 3 players, 12 with 4); the next card is turned up and its
// suit is trump. Everyone bids how many tricks they will take — the dealer bids last and may not make the bids add
// up to the number of tricks. Follow suit if you can; the highest trump, else the highest card of the suit led, wins
// and leads next. Hit your bid exactly for 10 + bid points, otherwise lose 1 point per trick you are off. Every
// player deals once; most points wins.
//
// It shows: T.flow (deal → bid → play, one round per hand), T.turns (bidding order, then one trick at a time),
// T.tricks (legal cards, trick winner), T.score.result with a tie-breaker, hidden hands (opponents get backs only),
// a face-up trick in the centre that stays visible until the next lead and then flies to the winner, the Spotlight
// (log lines carry the player's name and the card title), and a bot that bids from its high cards and trumps and
// plays to hit its bid exactly.

const SUITS = [
  { id: 'moon', name: 'Moons', icon: '☾', color: '#3d5a98' },
  { id: 'sun', name: 'Suns', icon: '☀', color: '#d4880f' },
  { id: 'star', name: 'Stars', icon: '★', color: '#8a3fa0' },
  { id: 'comet', name: 'Comets', icon: '☄', color: '#1f8a70' },
];
const RANKS = T.range(13).map((i) => i + 1); // 1 (low) … 13 (high)
const DECK = SUITS.flatMap((su) => RANKS.map((r) => `${su.id}-${r}`));
const COLORS = ['#d9534f', '#3a87c8', '#e0b030', '#4caf73'];
const BACK = { title: 'LANTERN', icon: '✺', color: '#7a2e1d' };

const suitOf = (c) => c.split('-')[0];
const rankOf = (c) => Number(c.split('-')[1]);
const SUIT = Object.fromEntries(SUITS.map((x) => [x.id, x]));
const title = (c) => `${rankOf(c)} of ${SUIT[suitOf(c)].name}`;
const opts = (s) => ({ suit: suitOf, rank: rankOf, trump: s.trump });
const P = (s, id) => s.players.find((p) => p.id === id);
const cur = (s) => (s.flow.phase === 'deal' ? s.players[s.dealer].id : T.turns.current(s.turn));
const handSize = (n) => Math.floor((DECK.length - 1) / n); // one card is always left to turn up for trump
const left = (s, i) => T.nextIndex(s.players.length, i);
const oid = (s, c) => `${c}@${s.handNo}`; // a card's object id within one deal: fresh cards fly in from the deck each hand
function log(s, t) { s.log.push(`R${s.flow.round} · ${t}`); if (s.log.length > 80) s.log.shift(); }

// cards that may be played now
const legal = (s, pid) => T.tricks.legal(s.hands[pid], s.trick.map((e) => ({ id: e.id, card: e.card })), opts(s));
// does `card` win the current trick if played now (by pid)?
const winsNow = (s, pid, card) => T.tricks.winner([...s.trick, { id: pid, card }], opts(s)).id === pid;
// the highest card of a suit that is still out (not yet played and not in `hand`)
const masterOf = (s, suit, hand) => {
  for (let r = 13; r >= 1; r--) { const c = `${suit}-${r}`; if (!s.seen.includes(c) && !hand.includes(c)) return r; }
  return 0;
};

// the bids this player may make now (the dealer's "hook": total bids must not equal the number of tricks)
function bidOptions(s, pid) {
  const size = s.hands[pid].length;
  const all = T.range(size + 1);
  if (s.players[s.dealer].id !== pid) return all;
  const others = s.players.filter((p) => p.id !== pid).reduce((a, p) => a + (s.bids[p.id] || 0), 0);
  return all.filter((n) => others + n !== size);
}

function scoreHand(s, ctx) {
  const row = { hand: s.flow.round, trump: s.trump, results: {} };
  for (const p of s.players) {
    const bid = s.bids[p.id], won = s.won[p.id];
    const pts = bid === won ? 10 + bid : -Math.abs(bid - won);
    p.score += pts; if (bid === won) p.exact += 1;
    row.results[p.id] = { bid, won, pts };
    log(s, `${p.name} bid ${bid}, took ${won}: ${pts > 0 ? '+' : ''}${pts}.`);
  }
  s.history.push(row);
  const exact = s.players.filter((p) => s.bids[p.id] === s.won[p.id]).map((p) => p.name);
  ctx.fx({ type: 'banner', text: `Hand ${s.flow.round} scored`, sub: exact.length ? `Exact: ${exact.join(', ')}` : 'Nobody hit their bid', sound: 'chime' });
  s.dealer = left(s, s.dealer);
  if (!T.flow.next(s.flow)) { // every player has dealt: game over
    const best = Math.max(...s.players.map((p) => p.score));
    log(s, `Game over — ${s.players.filter((p) => p.score === best).map((p) => p.name).join(' & ')} with ${best} points.`);
  } else s.log.push(`— Hand ${s.flow.round} · ${s.players[s.dealer].name} deals —`);
}

module.exports = {
  meta: { name: 'Lantern Tricks', minPlayers: 3, maxPlayers: 4, description: 'Bid exactly how many tricks you will take — no more, no less. Trump is turned up each hand.' },

  setup({ players, fx }) {
    const s = {
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % 4], score: 0, exact: 0 })),
      flow: T.flow.create(['deal', 'bid', 'play'], { rounds: players.length }), // every player deals once
      dealer: 0, handNo: 0, turn: null, hands: {}, bids: {}, won: {}, taken: {}, trick: [], last: null,
      trump: null, trumpCard: null, aside: [], seen: [], history: [], log: [],
    };
    s.players.forEach((p) => { s.hands[p.id] = []; s.bids[p.id] = null; s.won[p.id] = 0; s.taken[p.id] = []; });
    s.log.push(`— Hand 1 · ${s.players[0].name} deals —`);
    fx({ type: 'banner', text: 'Lantern Tricks', sub: 'Bid exactly — no more, no less', sound: 'gong' });
    return s;
  },

  moves: {
    deal(s, ctx) {
      if (s.flow.over) return { error: 'The game is over' };
      if (s.flow.phase !== 'deal') return { error: 'The cards are already dealt' };
      const dealer = s.players[s.dealer];
      if (ctx.playerId !== dealer.id) return { error: `${dealer.name} deals this hand` };
      const n = s.players.length, size = handSize(n);
      s.handNo = s.flow.round;
      const deck = ctx.random.shuffle(DECK.slice());
      s.players.forEach((p, i) => {
        s.hands[p.id] = deck.slice(i * size, (i + 1) * size).sort((a, b) => SUITS.findIndex((x) => x.id === suitOf(a)) - SUITS.findIndex((x) => x.id === suitOf(b)) || rankOf(a) - rankOf(b));
        s.bids[p.id] = null; s.won[p.id] = 0; s.taken[p.id] = [];
      });
      s.trumpCard = deck[n * size]; s.aside = deck.slice(n * size + 1);
      s.trump = suitOf(s.trumpCard); s.trick = []; s.last = null; s.seen = [s.trumpCard];
      log(s, `${dealer.name} dealt ${size} cards each and turned up ${title(s.trumpCard)}: ${SUIT[s.trump].name} are trump.`);
      ctx.fx({ type: 'sound', name: 'deal' });
      ctx.fx({ type: 'banner', text: `${SUIT[s.trump].icon} ${SUIT[s.trump].name} are trump`, sub: `Hand ${s.flow.round} of ${n} · ${size} tricks`, color: SUIT[s.trump].color });
      T.flow.next(s.flow); // → bid
      s.turn = T.turns.create(s.players.map((p) => p.id), { start: left(s, s.dealer), once: true });
      return s;
    },
    bid(s, ctx) {
      if (s.flow.phase !== 'bid') return { error: 'Not bidding now' };
      const p = P(s, ctx.playerId);
      if (!p || T.turns.current(s.turn) !== p.id) return { error: 'It is not your turn to bid' };
      const n = Number(ctx.args && ctx.args.n);
      const size = s.hands[p.id].length;
      if (!Number.isInteger(n) || n < 0 || n > size) return { error: `Bid from 0 to ${size} tricks` };
      if (!bidOptions(s, p.id).includes(n)) return { error: `As dealer you may not bid ${n}: the bids would add up to ${size}` };
      s.bids[p.id] = n;
      log(s, `${p.name} bids ${n} ${n === 1 ? 'trick' : 'tricks'}.`);
      if (!T.turns.next(s.turn)) {
        T.flow.next(s.flow); // → play
        s.turn = T.turns.create(s.players.map((x) => x.id), { start: left(s, s.dealer), once: true });
        const total = Object.values(s.bids).reduce((a, b) => a + b, 0);
        ctx.fx({ type: 'toast', text: `Bids total ${total} for ${size} tricks — ${total > size ? 'someone will fall short' : 'someone will take extra'}`, tone: 'info' });
      }
      return s;
    },
    play(s, ctx) {
      if (s.flow.phase !== 'play') return { error: 'Not playing tricks now' };
      const p = P(s, ctx.playerId);
      if (!p || T.turns.current(s.turn) !== p.id) return { error: 'It is not your turn' };
      const card = ctx.args && ctx.args.card;
      if (typeof card !== 'string' || !s.hands[p.id].includes(card)) return { error: 'That card is not in your hand' };
      if (!legal(s, p.id).includes(card)) return { error: `You must follow suit (${SUIT[suitOf(s.trick[0].card)].name})` };
      if (!s.trick.length && s.last) { s.taken[s.last.winner].push(...s.last.plays.map((e) => e.card)); s.last = null; } // the old trick goes to its winner
      s.hands[p.id] = s.hands[p.id].filter((c) => c !== card);
      s.trick.push({ id: p.id, card }); s.seen.push(card);
      const lead = s.trick.length === 1;
      log(s, `${p.name} ${lead ? 'led' : 'played'} ${title(card)}${!lead && suitOf(card) === s.trump && suitOf(s.trick[0].card) !== s.trump ? ' — trump!' : ''}.`);
      if (T.turns.next(s.turn)) return s;
      // trick complete
      const w = T.tricks.winner(s.trick, opts(s));
      const wp = P(s, w.id);
      s.won[w.id] += 1;
      s.last = { plays: s.trick, winner: w.id };
      s.trick = [];
      log(s, `${wp.name} wins the trick with ${title(w.card)} (${s.won[w.id]}/${s.bids[w.id]}).`);
      ctx.fx({ type: 'highlight', ids: [oid(s, w.card)], color: wp.color, ms: 1800 });
      if (!s.hands[w.id].length) scoreHand(s, ctx);
      else s.turn = T.turns.create(s.players.map((x) => x.id), { start: w.id, once: true });
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const over = s.flow.over;
    const who = over ? null : cur(s);
    const myTurn = !!(me && who === me.id);
    const phase = s.flow.phase;
    const playable = new Set(myTurn && phase === 'play' ? legal(s, me.id) : []);
    const zones = [
      { id: 'deck', layout: 'stack', at: [-24, 0], label: 'Deck' },
      { id: 'trump', layout: 'row', at: [-15, 0], label: 'Trump', slots: 1, slot: 'poker' },
      { id: 'trick', layout: 'row', at: [4, 0], label: 'Trick', gap: 1.2, slots: s.players.length, slot: 'poker' },
    ];
    const dealt = phase !== 'deal' || s.trumpCard; // after hand 1 the last hand's trump stays until the next deal
    const objects = [
      { id: 'deckObj', kind: 'deck', zone: 'deck', count: phase === 'deal' && !s.trumpCard ? DECK.length : s.aside.length, back: BACK, showEmpty: false, tip: 'Cards set aside this hand' },
    ];
    if (dealt && s.trumpCard) {
      const su = SUIT[s.trump];
      objects.push({ id: `trump:${oid(s, s.trumpCard)}`, kind: 'card', zone: 'trump', face: face(s.trumpCard), back: BACK, enterFrom: 'deck', glow: su.color, tip: `${su.name} are trump` });
    }
    const shown = s.trick.length ? s.trick : s.last ? s.last.plays : [];
    shown.forEach((e, i) => {
      const win = !s.trick.length && s.last && s.last.winner === e.id;
      objects.push({ id: oid(s, e.card), kind: 'card', zone: 'trick', order: i, face: face(e.card), back: BACK, glow: win ? P(s, e.id).color : false,
        tip: `${P(s, e.id).name}: ${title(e.card)}${win ? ' — won the trick' : ''}` });
    });
    for (const p of s.players) {
      const mine = !!(me && me.id === p.id);
      zones.push({ id: `hand:${p.id}`, seat: p.id, layout: 'fan', at: [0, 7] });
      zones.push({ id: `won:${p.id}`, seat: p.id, layout: 'stack', at: [20, 0] });
      s.hands[p.id].forEach((c, i) => {
        const ok = playable.has(c);
        objects.push({
          id: oid(s, c), kind: 'card', zone: `hand:${p.id}`, order: i, enterFrom: 'deck', faceUp: mine, back: BACK,
          face: mine ? face(c) : undefined, // hidden information: opponents only ever get the card back
          click: mine && ok ? { name: 'play', args: { card: c } } : undefined, glow: mine && ok ? 'soft' : false,
          disabled: mine && myTurn && phase === 'play' && !ok,
        });
      });
      // won tricks: face down in front of the winner (the cards keep their ids, so they fly there)
      s.taken[p.id].forEach((c, i) => objects.push({ id: oid(s, c), kind: 'card', zone: `won:${p.id}`, order: i, faceUp: false, back: BACK, rot: (i % 2) * 8 }));
    }
    // prompt
    let prompt;
    if (over) {
      const best = Math.max(...s.players.map((p) => p.score));
      prompt = { type: 'text', text: `🏆 ${s.players.filter((p) => p.score === best).map((p) => p.name).join(' & ')} — ${best} points`, size: 'lg', bold: true };
    } else if (myTurn && phase === 'deal') {
      prompt = { type: 'col', children: [{ type: 'text', text: `Hand ${s.flow.round}: you deal.`, bold: true }, { type: 'button', label: '🂠 Deal the cards', variant: 'primary', move: { name: 'deal' } }] };
    } else if (myTurn && phase === 'bid') {
      const okBids = bidOptions(s, me.id);
      const size = s.hands[me.id].length;
      const trumps = s.hands[me.id].filter((c) => suitOf(c) === s.trump).length;
      prompt = { type: 'col', children: [
        { type: 'text', text: `How many of the ${size} tricks will you take?`, bold: true },
        { type: 'text', text: `${SUIT[s.trump].icon} ${SUIT[s.trump].name} are trump — you hold ${trumps}.${s.players[s.dealer].id === me.id ? ' As dealer, your bid may not make the total equal the tricks.' : ''}`, muted: true },
        { type: 'grid', cols: 6, cells: T.range(size + 1).map((n) => ({ label: String(n), move: { name: 'bid', args: { n } }, disabled: !okBids.includes(n), faded: !okBids.includes(n) })) },
      ] };
    } else if (myTurn && phase === 'play') {
      prompt = { type: 'col', children: [
        { type: 'text', text: s.trick.length ? `Follow ${SUIT[suitOf(s.trick[0].card)].name} if you can — click a glowing card.` : 'Your lead — click a card.', bold: true },
        { type: 'text', text: `Bid ${s.bids[me.id]} · taken ${s.won[me.id]}`, muted: true },
      ] };
    } else {
      prompt = { type: 'text', text: `⏳ ${P(s, who).name} is ${phase === 'deal' ? 'dealing' : phase === 'bid' ? 'bidding' : 'playing'}`, muted: true };
    }
    const status = over ? 'Game over' : `Hand ${s.flow.round}/${s.players.length}${s.trump && phase !== 'deal' ? ` · ${SUIT[s.trump].icon} trump` : ''} · ${P(s, who).name} ${phase === 'deal' ? 'deals' : phase === 'bid' ? 'bids' : 'plays'}`;
    const scoreboard = { type: 'col', children: [
      { type: 'scores', items: s.players.map((p) => ({ label: p.name, value: p.score, color: p.color })) },
      ...s.history.slice().reverse().map((h) => ({ type: 'text', size: 'sm', muted: true,
        text: `Hand ${h.hand} ${SUIT[h.trump].icon}: ${s.players.map((p) => `${p.name} ${h.results[p.id].won}/${h.results[p.id].bid} (${h.results[p.id].pts > 0 ? '+' : ''}${h.results[p.id].pts})`).join(' · ')}` })),
      { type: 'divider' },
      { type: 'text', size: 'sm', text: 'Exact bid: 10 + bid. Missed: −1 per trick off.' },
    ] };
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'night' }, table: { surface: 'felt-red' },
        seats: s.players.map((p, i) => ({ id: p.id, name: p.name, color: p.color, active: who === p.id, me: !!(me && me.id === p.id),
          sub: `${p.score} pts${phase !== 'deal' && s.bids[p.id] != null ? ` · ${s.won[p.id]}/${s.bids[p.id]} tricks` : ''}${i === s.dealer && !over ? ' · dealer' : ''}` })),
        zones, objects,
      },
      hud: {
        title: 'Lantern Tricks', status,
        players: s.players.map((p, i) => ({ id: p.id, name: p.name, color: p.color, active: who === p.id, me: !!(me && me.id === p.id),
          badges: i === s.dealer && !over ? ['Dealer'] : [],
          stats: [{ label: 'Points', value: p.score, key: true }, { label: 'Bid', value: s.bids[p.id] == null ? '—' : s.bids[p.id], key: true }, { label: 'Tricks', value: s.won[p.id], key: true }, { label: 'Exact', value: p.exact }] })),
        panels: [{ id: 'scores', title: 'Scoreboard', icon: '🏮', side: 'right', open: s.history.length > 0 && phase === 'deal', node: scoreboard }],
        prompt, promptTone: myTurn ? '' : 'wait', log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.flow.over) return null;
    return T.score.result(s.players, { keys: ['score', 'exact'] });
  },

  // balance lab: points so far plus how well the current hand is going (bid against the tricks this hand looks
  // good for, from the player's own cards)
  score(s, { playerId }) {
    const p = P(s, playerId);
    const bid = s.bids[p.id];
    if (s.flow.over || s.flow.phase === 'deal' || bid == null) return p.score;
    const hand = s.hands[p.id], size = handSize(s.players.length);
    const projected = s.won[p.id] + (hand.length ? expectedTricks(s, hand) * (hand.length / size) : 0);
    if (s.won[p.id] > bid || s.won[p.id] + hand.length < bid) return p.score - Math.abs(projected - bid); // already missed
    return p.score + 10 + bid - 3 * Math.abs(projected - bid);
  },

  actions(s, { playerId }) {
    if (s.flow.over || cur(s) !== playerId) return [];
    if (s.flow.phase === 'deal') return [{ name: 'deal' }];
    if (s.flow.phase === 'bid') return bidOptions(s, playerId).map((n) => ({ name: 'bid', args: { n } }));
    return legal(s, playerId).map((card) => ({ name: 'play', args: { card } }));
  },

  // Bids: expected tricks from high cards and trumps. Play: while short of the bid, win as cheaply as possible;
  // once the bid is reached, duck — play the highest card that still loses. Uses only its own hand and played cards.
  bot(s, { playerId, actions, random }) {
    const ph = s.flow.phase;
    if (ph === 'deal') return actions[0];
    const hand = s.hands[playerId];
    if (ph === 'bid') {
      const est = expectedTricks(s, hand);
      const okBids = actions.map((a) => a.args.n);
      const target = Math.round(est + (random.float() - 0.5) * 0.6);
      const n = okBids.slice().sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
      return actions.find((a) => a.args.n === n);
    }
    const cards = actions.map((a) => a.args.card);
    const need = s.bids[playerId] - s.won[playerId];
    const byRank = (a, b) => rankOf(a) - rankOf(b) + (suitOf(a) === s.trump ? 20 : 0) - (suitOf(b) === s.trump ? 20 : 0); // trumps count as higher
    const play = (c) => actions.find((a) => a.args.card === c);
    const lastToPlay = s.trick.length === s.players.length - 1;
    if (!s.trick.length) {
      // leading
      if (need > 0) {
        const masters = cards.filter((c) => suitOf(c) !== s.trump && rankOf(c) >= masterOf(s, suitOf(c), hand));
        if (masters.length) return play(masters.sort(byRank).pop());
        const trumps = cards.filter((c) => suitOf(c) === s.trump);
        if (trumps.length && need >= trumps.length) return play(trumps.sort(byRank).pop());
        return play(cards.slice().sort(byRank)[0]);
      }
      // duck: lead a low card of a non-trump suit
      const plain = cards.filter((c) => suitOf(c) !== s.trump);
      return play((plain.length ? plain : cards).slice().sort(byRank)[0]);
    }
    const winners = cards.filter((c) => winsNow(s, playerId, c)).sort(byRank);
    const losers = cards.filter((c) => !winsNow(s, playerId, c)).sort(byRank);
    if (need > 0 && winners.length) {
      // last to play: the cheapest winner is enough; otherwise a card that is likely to hold
      if (lastToPlay) return play(winners[0]);
      const safe = winners.filter((c) => suitOf(c) === s.trump || rankOf(c) >= masterOf(s, suitOf(c), hand));
      return play((safe.length ? safe : winners)[safe.length ? 0 : winners.length - 1]);
    }
    if (need > 0) return play(losers[0]); // cannot win: throw the cheapest card
    if (losers.length) return play(losers[losers.length - 1]); // duck with the highest card that still loses
    return play(winners[winners.length - 1]); // forced to win: at least get rid of the biggest card
  },

  invariants(s) {
    const e = [];
    if (s.flow.phase === 'deal' && !s.trumpCard) return e;
    const all = [...Object.values(s.hands).flat(), ...Object.values(s.taken).flat(), ...s.trick.map((x) => x.card), ...(s.last ? s.last.plays.map((x) => x.card) : []), s.trumpCard, ...s.aside];
    if (all.length !== DECK.length || new Set(all).size !== DECK.length) e.push(`Card count is ${all.length} (${new Set(all).size} distinct), expected ${DECK.length}`);
    const sizes = s.players.map((p) => s.hands[p.id].length + (s.trick.some((x) => x.id === p.id) ? 1 : 0));
    if (new Set(sizes).size > 1) e.push('Hands are uneven');
    return e;
  },
};

function face(c) {
  const su = SUIT[suitOf(c)], r = rankOf(c);
  return { title: title(c), subtitle: su.name, icon: su.icon, color: su.color, corners: { tl: { text: String(r), icon: su.icon, color: su.color }, br: { text: String(r), icon: su.icon, color: su.color } } };
}

// expected tricks for a bot's bid: high cards and trumps, with a bonus for long trumps and short side suits
function expectedTricks(s, hand) {
  const n = s.players.length;
  const trumps = hand.filter((c) => suitOf(c) === s.trump);
  let est = 0;
  for (const c of hand) {
    const r = rankOf(c);
    if (suitOf(c) === s.trump) est += r >= 12 ? 0.95 : r >= 9 ? 0.7 : r >= 6 ? 0.45 : 0.3;
    else {
      const len = hand.filter((x) => suitOf(x) === suitOf(c)).length;
      const crowd = len > 13 / n + 1 ? 0.75 : 1; // long side suits get trumped before the high cards cash
      est += (r === 13 ? 0.9 : r === 12 ? 0.6 : r === 11 ? 0.3 : 0) * crowd;
    }
  }
  const voids = SUITS.filter((x) => x.id !== s.trump && !hand.some((c) => suitOf(c) === x.id)).length;
  est += Math.min(trumps.length, voids) * 0.5;
  // calibrated against simulated hands: with big hands, middling cards win more tricks than the count above suggests
  return n === 3 ? est * 1.5 : est * 1.33 - 0.6;
}
