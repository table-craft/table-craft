// Night Market — a small card game for 2–4 players.
//
// Goods come in four suits (Silk, Spice, Tea, Jade), valued 1–5. On your turn do ONE thing:
//   • Take a face-up card from the Market (it is refilled from the deck),
//   • Draw a hidden card from the deck,
//   • Sell every card of one suit from your hand (2 or more): score their values, +1 per card when you sell 3 or more.
// Sold goods go to the discard pile; when the deck runs out the discard pile is shuffled back in.
// Your hand holds at most HAND_LIMIT cards: when it is full, sell a set or toss a card.
// First to TARGET points wins; after MAX_ROUNDS rounds the highest score wins.
//
// Game modules are plain scripts: `module.exports = { ... }`; the rules kit is the global `T`.
// Rules reference: https://github.com/table-craft/table-craft/blob/main/docs/game-module.md

const TARGET = 30;
const MAX_ROUNDS = 14;
const HAND_LIMIT = 6;
const MARKET_SIZE = 3;
const SUITS = [
  { id: 'silk', name: 'Silk', color: '#a8325e', icon: '❦' },
  { id: 'spice', name: 'Spice', color: '#c8642b', icon: '✺' },
  { id: 'tea', name: 'Tea', color: '#3f7a4a', icon: '❀' },
  { id: 'jade', name: 'Jade', color: '#2f7f86', icon: '◆' },
];
const COLORS = ['#c8642b', '#3f78a8', '#6e7b3a', '#8a6aa8'];
const BACK = { title: 'NIGHT MARKET', color: '#2b2340', icon: '☾' };

// Card ids are stable ("jade-4-b"), so the same physical card animates from the deck to the market, a hand, the discard.
const suitOf = (c) => SUITS.find((x) => x.id === c.split('-')[0]);
const cardValue = (c) => Number(c.split('-')[1]);
const cardName = (c) => `${suitOf(c).name} ${cardValue(c)}`;
const cardFace = (c) => ({ title: suitOf(c).name, text: `Worth ${cardValue(c)}`, color: suitOf(c).color, icon: suitOf(c).icon, corners: { tl: String(cardValue(c)), br: String(cardValue(c)) } });
const P = (s, id) => s.players.find((p) => p.id === id);
const cur = (s) => s.players[s.turn];
const ofSuit = (p, suit) => p.hand.filter((c) => c.startsWith(`${suit}-`));
const saleValue = (cards) => cards.reduce((a, c) => a + cardValue(c), 0) + (cards.length >= 3 ? cards.length : 0);
const sellable = (p) => SUITS.filter((x) => ofSuit(p, x.id).length >= 2);
function log(s, t) { s.log.push(`R${s.round} · ${t}`); if (s.log.length > 60) s.log.shift(); }
function refill(s, random) { while (s.market.length < MARKET_SIZE) { const [c] = T.draw(s.deck, s.discard, random, 1); if (!c) break; s.market.push(c); } }

function endTurn(s, ctx) {
  const p = cur(s);
  if (p.score >= TARGET) { s.over = true; ctx.fx({ type: 'banner', text: `${p.name} wins!`, sub: `${p.score} points`, color: p.color, sound: 'win' }); return s; }
  s.turn = T.nextIndex(s.players.length, s.turn);
  if (s.turn === 0) {
    if (s.round >= MAX_ROUNDS) { s.over = true; ctx.fx({ type: 'banner', text: 'The market closes', sub: 'Highest score wins' }); return s; }
    s.round += 1; log(s, `— Round ${s.round} —`);
  }
  return s;
}
function guard(s, ctx) {
  if (s.over) return 'The game is over';
  if (cur(s).id !== ctx.playerId) return 'It is not your turn';
  return null;
}

module.exports = {
  meta: { name: 'Night Market', minPlayers: 2, maxPlayers: 4, description: `Collect goods and sell sets. First to ${TARGET} points.` },

  setup({ players, random, fx }) {
    const deck = [];
    for (const x of SUITS) for (let v = 1; v <= 5; v++) for (const copy of ['a', 'b']) deck.push(`${x.id}-${v}-${copy}`);
    const s = {
      deck: random.shuffle(deck), discard: [], market: [],
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % COLORS.length], score: 0, hand: [] })),
      turn: 0, round: 1, over: false, log: [],
    };
    for (const p of s.players) p.hand = T.draw(s.deck, s.discard, random, 3);
    refill(s, random);
    log(s, '— Round 1 —');
    fx({ type: 'banner', text: 'Night Market', sub: `${s.players[0].name} opens the market` });
    return s;
  },

  moves: {
    take(s, ctx) {
      const err = guard(s, ctx); if (err) return { error: err };
      const p = cur(s); const card = ctx.args.card;
      if (!s.market.includes(card)) return { error: 'That card is not in the market' };
      if (p.hand.length >= HAND_LIMIT) return { error: 'Your hand is full: sell a set or toss a card' };
      s.market = s.market.filter((c) => c !== card); p.hand.push(card);
      log(s, `${p.name} took ${cardName(card)} from the Market.`);
      refill(s, ctx.random);
      return endTurn(s, ctx);
    },
    draw(s, ctx) {
      const err = guard(s, ctx); if (err) return { error: err };
      const p = cur(s);
      if (p.hand.length >= HAND_LIMIT) return { error: 'Your hand is full: sell a set or toss a card' };
      const [card] = T.draw(s.deck, s.discard, ctx.random, 1);
      if (!card) return { error: 'There are no cards left to draw' };
      p.hand.push(card);
      log(s, `${p.name} drew a card.`); // never name a hidden card in the log
      return endTurn(s, ctx);
    },
    sell(s, ctx) {
      const err = guard(s, ctx); if (err) return { error: err };
      const p = cur(s); const suit = SUITS.find((x) => x.id === ctx.args.suit);
      if (!suit) return { error: 'Unknown suit' };
      const cards = ofSuit(p, suit.id);
      if (cards.length < 2) return { error: `You need at least 2 ${suit.name} cards to sell` };
      const pts = saleValue(cards);
      p.hand = p.hand.filter((c) => !cards.includes(c)); s.discard.push(...cards); p.score += pts;
      log(s, `${p.name} sold ${cards.length} ${suit.name} (${cards.map(cardValue).join('+')}) for ${pts} points.`);
      ctx.fx({ type: 'toast', text: `${p.name} +${pts}`, tone: 'good' });
      return endTurn(s, ctx);
    },
    toss(s, ctx) {
      const err = guard(s, ctx); if (err) return { error: err };
      const p = cur(s); const card = ctx.args.card;
      if (p.hand.length < HAND_LIMIT) return { error: 'You can only toss a card when your hand is full' };
      if (!p.hand.includes(card)) return { error: 'That card is not in your hand' };
      p.hand = p.hand.filter((c) => c !== card); s.discard.push(card);
      log(s, `${p.name} tossed ${cardName(card)}.`);
      return endTurn(s, ctx);
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const myTurn = !!me && cur(s) === me && !s.over;
    const full = !!me && me.hand.length >= HAND_LIMIT;
    const zones = [
      { id: 'deck', layout: 'stack', at: [-14, 0], label: 'Deck' },
      { id: 'market', layout: 'row', at: [0, 0], slots: MARKET_SIZE, gap: 1, label: 'Market' },
      { id: 'discard', layout: 'pile', at: [14, 0], label: 'Discard' },
    ];
    const objects = [
      { id: 'deckObj', kind: 'deck', zone: 'deck', count: s.deck.length, back: BACK, tip: `Deck: ${s.deck.length} cards`, click: myTurn && !full && s.deck.length + s.discard.length ? { name: 'draw' } : undefined },
      ...s.discard.slice(-3).map((c) => ({ id: c, kind: 'card', zone: 'discard', face: cardFace(c), back: BACK })),
      ...s.market.map((c, i) => ({ id: c, kind: 'card', zone: 'market', order: i, enterFrom: 'deck', face: cardFace(c), back: BACK, click: myTurn && !full ? { name: 'take', args: { card: c } } : undefined })),
    ];
    for (const p of s.players) {
      const mine = p === me;
      zones.push({ id: `hand:${p.id}`, seat: p.id, layout: mine ? 'fan' : 'row', at: [0, 4], gap: 0.5 });
      p.hand.forEach((c) => {
        let click;
        if (mine && myTurn && ofSuit(p, suitOf(c).id).length >= 2) click = { name: 'sell', args: { suit: suitOf(c).id } };
        else if (mine && myTurn && full) click = { name: 'toss', args: { card: c } };
        // hidden information: an opponent's card face never enters this view
        objects.push({ id: c, kind: 'card', zone: `hand:${p.id}`, enterFrom: 'deck', faceUp: mine, face: mine ? cardFace(c) : undefined, back: BACK, click });
      });
    }
    let prompt;
    if (s.over) prompt = { type: 'text', text: 'The market is closed.', size: 'lg', bold: true };
    else if (!myTurn) prompt = { type: 'text', text: `⏳ ${cur(s).name} is trading`, muted: true };
    else {
      prompt = { type: 'col', children: [
        { type: 'text', text: full ? 'Your hand is full: sell a set or click a card to toss it.' : 'Take a Market card, draw from the deck, or sell a set.', bold: true },
        { type: 'row', wrap: true, children: [
          { type: 'button', label: 'Draw a card', move: { name: 'draw' }, disabled: full },
          ...sellable(me).map((x) => ({ type: 'button', variant: 'ghost', label: `Sell ${ofSuit(me, x.id).length} ${x.name} (+${saleValue(ofSuit(me, x.id))})`, move: { name: 'sell', args: { suit: x.id } } })),
        ] },
      ] };
    }
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'night' }, table: { surface: 'felt-blue' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !s.over, me: p === me, sub: `${p.score} pts` })),
        zones, objects,
      },
      hud: {
        title: 'Night Market',
        status: s.over ? 'Game over' : `Round ${s.round}/${MAX_ROUNDS} · ${cur(s).name}`,
        players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !s.over, me: p === me, stats: [{ label: 'Points', value: p.score, key: true }, { label: 'Hand', value: p.hand.length }] })),
        prompt, promptTone: myTurn ? '' : 'wait',
        panels: [{ id: 'rules', title: 'Rules', side: 'left', open: false, node: { type: 'text', size: 'sm', text: `One action per turn: take a Market card, draw, or sell all cards of one suit (2+). Sets of 3+ score +1 per card. Hand limit ${HAND_LIMIT}. First to ${TARGET} points, or best after ${MAX_ROUNDS} rounds.` } }],
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.over) return null;
    const top = Math.max(...s.players.map((p) => p.score));
    const winners = s.players.filter((p) => p.score === top);
    const ranking = s.players.slice().sort((a, b) => b.score - a.score).map((p, i) => ({ id: p.id, name: p.name, score: p.score, place: i + 1 }));
    return { winners: winners.map((p) => p.id), reason: `${winners.map((p) => p.name).join(' & ')} ${winners.length > 1 ? 'share' : 'wins with'} ${top} points`, ranking };
  },

  // Balance lab: points ahead of the best rival, plus a little credit for sets in hand.
  score(s, { playerId }) {
    const me = P(s, playerId);
    const rival = Math.max(...s.players.filter((p) => p !== me).map((p) => p.score));
    return me.score - rival + sellable(me).reduce((a, x) => a + saleValue(ofSuit(me, x.id)), 0) * 0.3;
  },

  // Every legal move right now: bots, the "Add bot" button and the referee all use this.
  actions(s, { playerId }) {
    if (s.over || cur(s).id !== playerId) return [];
    const p = cur(s); const out = sellable(p).map((x) => ({ name: 'sell', args: { suit: x.id } }));
    if (p.hand.length >= HAND_LIMIT) p.hand.forEach((c) => out.push({ name: 'toss', args: { card: c } }));
    else {
      s.market.forEach((c) => out.push({ name: 'take', args: { card: c } }));
      if (s.deck.length + s.discard.length) out.push({ name: 'draw' });
    }
    return out;
  },

  // A simple heuristic: sell big sets, collect suits you already hold, toss your loneliest low card.
  bot(s, { actions }) {
    const p = cur(s); const held = (c) => ofSuit(p, suitOf(c).id).length;
    const sells = actions.filter((a) => a.name === 'sell').sort((a, b) => saleValue(ofSuit(p, b.args.suit)) - saleValue(ofSuit(p, a.args.suit)));
    if (sells.length && (saleValue(ofSuit(p, sells[0].args.suit)) >= 8 || p.hand.length >= HAND_LIMIT)) return sells[0];
    const takes = actions.filter((a) => a.name === 'take').sort((a, b) => held(b.args.card) * 10 + cardValue(b.args.card) - (held(a.args.card) * 10 + cardValue(a.args.card)));
    if (takes.length && held(takes[0].args.card) > 0) return takes[0];
    const tosses = actions.filter((a) => a.name === 'toss').sort((a, b) => held(a.args.card) * 10 + cardValue(a.args.card) - (held(b.args.card) * 10 + cardValue(b.args.card)));
    return actions.find((a) => a.name === 'draw') || takes[0] || tosses[0] || sells[0];
  },

  invariants(s) {
    const e = [];
    const total = s.deck.length + s.discard.length + s.market.length + s.players.reduce((a, p) => a + p.hand.length, 0);
    if (total !== SUITS.length * 10) e.push(`Card count changed: ${total}`);
    if (new Set([...s.deck, ...s.discard, ...s.market, ...s.players.flatMap((p) => p.hand)]).size !== total) e.push('A card is in two places');
    s.players.forEach((p) => { if (p.hand.length > HAND_LIMIT) e.push(`${p.name} holds too many cards`); if (p.score < 0) e.push('Negative score'); });
    return e;
  },
};
