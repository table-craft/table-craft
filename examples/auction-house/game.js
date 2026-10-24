// Auction House — an art-dealing auction game for 3–5 players.
// Four seasons. The auctioneer seat moves around the table; on your turn you put one painting from your hand up for
// auction, in the way printed on it: OPEN (bid up in turn until everyone else passes), ONCE AROUND (each player bids
// once), SEALED (everyone bids secretly at the same time) or DUTCH (the price drops until someone takes it). The buyer
// pays the auctioneer — or the bank, when the auctioneer buys their own painting. Nobody buys it: the auctioneer keeps
// it for free. A season ends when one artist's 4th painting is offered (it is not sold). The three artists offered
// most that season gain 30 / 20 / 10 to their market value, and every painting of those three artists is sold to the
// bank for the artist's total value. Most money after four seasons wins.
//
// Money is a closed purse: you see only your own; every price is public, so a sharp memory still pays off.
//
// It shows the mechanics library: open, once-around and Dutch auctions (T.auction), sealed bids (T.secret +
// T.auction.sealed), a rotating auctioneer that skips empty hands (T.turns), artist ranking (T.score.rank) and the
// final ranking (T.score.result).

const SEASONS = 4;
const ENDS_SEASON = 4; // an artist's 4th painting in a season ends it
const AWARDS = [30, 20, 10];
const START_MONEY = 100;
const SEAT_BONUS = { 3: 0, 4: 0, 5: 3 }; // with 5 the early seats auction more often in season 1: later seats start richer
const DEAL = { 3: [6, 4, 3, 0], 4: [5, 3, 2, 0], 5: [4, 3, 1, 0] };
const DUTCH = { start: 40, step: 5, floor: 5 };
const COLORS = ['#c8642b', '#3f78a8', '#6e7b3a', '#8a6aa8', '#b8495a'];
const ARTISTS = [
  { id: 'vant', name: 'Aurelio Vant', color: '#c9862b', icon: '☀', series: 'Harbor at Dusk', count: 12 },
  { id: 'solenne', name: 'Mira Solenne', color: '#2f8a8a', icon: '≈', series: 'Tidepool', count: 11 },
  { id: 'dott', name: 'Kasimir Dott', color: '#a83a3a', icon: '◆', series: 'Red Room', count: 10 },
  { id: 'reil', name: 'Yuna Reil', color: '#4a4f9c', icon: '☾', series: 'Night Garden', count: 9 },
];
const ART = Object.fromEntries(ARTISTS.map((a) => [a.id, a]));
const KINDS = {
  open: { name: 'Open', icon: '⇡', text: 'Bid up in turn; passing is final.' },
  once: { name: 'Once around', icon: '↻', text: 'Each player bids once, starting left of the auctioneer.' },
  sealed: { name: 'Sealed', icon: '✉', text: 'Everyone bids in secret at the same time.' },
  dutch: { name: 'Dutch', icon: '⇣', text: `The price falls from ${DUTCH.start} by ${DUTCH.step} until someone takes it.` },
};
const KIND_KEYS = Object.keys(KINDS);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const BACK = { title: 'AUCTION HOUSE', color: '#2b2230', icon: '⚖' };

const P = (s, id) => s.players.find((p) => p.id === id);
function log(s, t) { s.log.push(`R${s.season} · ${t}`); if (s.log.length > 60) s.log.shift(); }
const lotOf = (s, c) => s.lots[c];
const title = (s, c) => { const l = lotOf(s, c); return `${ART[l.artist].series} ${ROMAN[l.n]}`; };
// bidding order: from the auctioneer's left, the auctioneer last
const bidOrder = (s, auctioneer) => { const i = s.order.indexOf(auctioneer); return s.order.slice(i + 1).concat(s.order.slice(0, i + 1)); };

// this season's artist standing (offered paintings; ties → the artist listed first)
function standings(s, extra) {
  const rows = ARTISTS.map((a, i) => ({ id: a.id, count: s.offered[a.id] + (extra === a.id ? 1 : 0), prio: i }));
  return T.score.rank(rows, ['count', '-prio']);
}
// what a painting of this artist will probably sell for at the season's end (bots and the balance lab)
function estimate(s, artist) {
  const st = standings(s);
  const place = st.findIndex((r) => r.id === artist);
  const total = ARTISTS.reduce((a, x) => a + s.offered[x.id], 0);
  const sure = Math.min(1, 0.45 + total * 0.07);
  const award = place < 3 ? AWARDS[place] : 0;
  const v = (s.value[artist] + award) * (place < 3 ? sure : 0.25);
  return Math.round(v);
}

function dealSeason(s, ctx) {
  const n = DEAL[s.order.length][s.season - 1];
  for (const id of s.order) P(s, id).hand.push(...T.draw(s.deck, [], ctx.random, n));
  ARTISTS.forEach((a) => { s.offered[a.id] = 0; });
  log(s, `— Season ${s.season} —`);
  ctx.fx({ type: 'banner', text: `Season ${s.season}`, sub: n ? `Everyone draws ${n} painting${n > 1 ? 's' : ''}` : 'No new paintings — sell what you hold', color: '#c9862b', sound: 'gong' });
}

// the next auctioneer with paintings in hand → true, or false when nobody can offer (the season ends)
function seekAuctioneer(s) {
  for (;;) {
    const cur = T.turns.current(s.turn);
    if (cur == null) return false;
    if (P(s, cur).hand.length) return true;
    T.turns.pass(s.turn, cur);
    if (T.turns.done(s.turn)) return false;
    T.turns.next(s.turn);
  }
}

function endSeason(s, ctx) {
  const st = standings(s).filter((r) => r.count > 0).slice(0, 3);
  const pay = {};
  st.forEach((r, i) => { s.value[r.id] += AWARDS[i]; pay[r.id] = s.value[r.id]; s.awards[r.id].push(AWARDS[i]); });
  log(s, `Season ${s.season} market: ${st.map((r, i) => `${ART[r.id].name} +${AWARDS[i]} (now ${s.value[r.id]})`).join(', ') || 'nothing was offered'}.`);
  for (const p of s.players) {
    const earned = p.owned.reduce((a, c) => a + (pay[lotOf(s, c).artist] || 0), 0);
    if (p.owned.length) log(s, `${p.name} sold ${p.owned.length} painting${p.owned.length > 1 ? 's' : ''} to the bank for ${earned}.`);
    p.money += earned;
    s.sold.push(...p.owned); p.owned = [];
  }
  s.sold.push(...s.unsold); s.unsold = [];
  if (st.length) ctx.fx({ type: 'banner', text: `${ART[st[0].id].name} is the season's star`, sub: st.map((r) => `${ART[r.id].name}: ${pay[r.id]}`).join(' · '), color: ART[st[0].id].color });
  if (s.season >= SEASONS) {
    s.phase = 'over';
    const r = T.score.result(s.players, { keys: ['money', 'paintingsBought'] });
    const names = r.winners.map((id) => P(s, id).name).join(' & ');
    log(s, `Game over — ${names} win${r.winners.length > 1 ? '' : 's'} with ${r.ranking[0].score}.`);
    ctx.fx({ type: 'banner', text: `${names} win${r.winners.length > 1 ? '' : 's'}!`, sub: `${r.ranking[0].score} in the purse`, sound: 'win', color: P(s, r.winners[0]).color });
    return;
  }
  // the next season starts with the player after the last auctioneer
  const next = T.nextIndex(s.order.length, s.order.indexOf(s.lastAuctioneer));
  s.season += 1;
  dealSeason(s, ctx);
  T.turns.newRound(s.turn, next);
  if (!seekAuctioneer(s)) endSeason(s, ctx);
  else s.phase = 'offer';
}

function nextLot(s, ctx) {
  s.lot = null;
  T.turns.next(s.turn);
  if (T.turns.current(s.turn) != null && seekAuctioneer(s)) { s.phase = 'offer'; return; }
  endSeason(s, ctx);
}

// the lot is over: hand over the painting and the money
function settle(s, ctx, winner, price) {
  const lot = s.lot; const auc = P(s, lot.auctioneer); const name = title(s, lot.card);
  if (!winner) {
    auc.owned.push(lot.card);
    log(s, `Nobody bid on ${name}: ${auc.name} keeps it for free.`);
  } else {
    const w = P(s, winner);
    w.money -= price; w.owned.push(lot.card); w.paintingsBought += 1;
    if (w !== auc) auc.money += price;
    log(s, `${w.name} bought ${name} for ${price}${w === auc ? ' (paid to the bank)' : ` from ${auc.name}`}.`);
    ctx.fx({ type: 'toss', zone: w === auc ? 'block' : `purse:${auc.id}`, from: w.id, n: Math.min(6, Math.max(1, Math.round(price / 10))), token: { shape: 'coin', color: '#d4a72c' } });
  }
  ctx.fx({ type: 'sound', name: 'gong' });
  nextLot(s, ctx);
}

function afterBid(s, ctx) {
  const a = s.lot.auction;
  if (!T.auction.done(a)) return;
  const w = T.auction.winner(a);
  settle(s, ctx, w && w.id, w && w.price);
}

module.exports = {
  meta: {
    name: 'Auction House', minPlayers: 3, maxPlayers: 5,
    description: 'Deal in paintings across four seasons: open, once-around, sealed and Dutch auctions decide what the art market is worth.',
  },

  setup({ players, random, fx }) {
    const kinds = [];
    ARTISTS.forEach((a, ai) => { for (let i = 0; i < a.count; i++) kinds.push({ artist: a.id, n: i, kind: KIND_KEYS[(i + ai) % 4] }); });
    // ids are given after shuffling: an id never tells which painting is behind a card back
    const lots = {}; const deck = [];
    random.shuffle(kinds).forEach((l, i) => { lots[`L${i}`] = l; deck.push(`L${i}`); });
    const s = {
      lots, deck, season: 1, phase: 'offer', lot: null, lastAuctioneer: players[0].id, log: [],
      order: players.map((p) => p.id),
      turn: T.turns.create(players.map((p) => p.id)),
      offered: {}, value: Object.fromEntries(ARTISTS.map((a) => [a.id, 0])), awards: Object.fromEntries(ARTISTS.map((a) => [a.id, []])),
      shown: Object.fromEntries(ARTISTS.map((a) => [a.id, []])), unsold: [], sold: [],
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % COLORS.length], money: START_MONEY + SEAT_BONUS[players.length] * i, hand: [], owned: [], paintingsBought: 0 })),
    };
    dealSeason(s, { random, fx });
    return s;
  },

  moves: {
    offer(s, ctx) {
      if (s.phase !== 'offer') return { error: 'No painting can be offered now' };
      if (T.turns.current(s.turn) !== ctx.playerId) return { error: 'You are not the auctioneer' };
      const p = P(s, ctx.playerId); const card = ctx.args && ctx.args.card;
      if (typeof card !== 'string' || !p.hand.includes(card)) return { error: 'That painting is not in your hand' };
      const l = lotOf(s, card);
      T.draft.pick(p.hand, card);
      s.offered[l.artist] += 1; s.shown[l.artist].push(card); s.lastAuctioneer = p.id;
      if (s.offered[l.artist] >= ENDS_SEASON) {
        s.unsold.push(card);
        log(s, `${p.name} offered ${title(s, card)} — ${ART[l.artist].name}'s ${ENDS_SEASON}th painting ends the season unsold.`);
        ctx.fx({ type: 'reveal', ids: [card], by: p.id, title: 'ends the season', text: `${ART[l.artist].name}'s ${ENDS_SEASON}th painting this season` });
        endSeason(s, ctx);
        return s;
      }
      s.phase = 'auction';
      s.lot = { card, kind: l.kind, auctioneer: p.id };
      const order = bidOrder(s, p.id);
      if (l.kind === 'sealed') s.lot.bids = T.secret.create(order);
      else if (l.kind === 'dutch') s.lot.auction = T.auction.create(order, { kind: 'dutch', price: DUTCH.start, step: DUTCH.step, floor: DUTCH.floor, exclude: [p.id] });
      else s.lot.auction = T.auction.create(order, { kind: l.kind, min: 1, step: 1 });
      log(s, `${p.name} offered ${title(s, card)} by ${ART[l.artist].name} (${KINDS[l.kind].name} auction).`);
      ctx.fx({ type: 'toast', text: `${KINDS[l.kind].icon} ${KINDS[l.kind].name} auction: ${title(s, card)}`, tone: 'info', sound: false });
      return s;
    },
    // open / once-around
    bid(s, ctx) {
      if (s.phase !== 'auction' || !s.lot.auction || s.lot.kind === 'dutch') return { error: 'There is no open bidding now' };
      const p = P(s, ctx.playerId); const amount = ctx.args && ctx.args.amount;
      if (!p) return { error: 'You are not at this table' };
      if (!Number.isInteger(amount)) return { error: 'Bid a whole number' };
      if (amount > p.money) return { error: 'You do not have that much money' };
      if (!T.auction.bid(s.lot.auction, p.id, amount)) return { error: `It is not your turn, or the bid is below ${T.auction.minBid(s.lot.auction)}` };
      log(s, `${p.name} bids ${amount} on ${title(s, s.lot.card)}.`);
      afterBid(s, ctx);
      return s;
    },
    pass(s, ctx) {
      if (s.phase !== 'auction' || !s.lot.auction || s.lot.kind === 'dutch') return { error: 'There is no open bidding now' };
      const p = P(s, ctx.playerId);
      if (!p || !T.auction.pass(s.lot.auction, p.id)) return { error: 'It is not your turn to bid' };
      log(s, `${p.name} passes.`);
      afterBid(s, ctx);
      return s;
    },
    // sealed: a secret bid, 0 = no bid; may be changed until everyone is in
    seal(s, ctx) {
      if (s.phase !== 'auction' || s.lot.kind !== 'sealed') return { error: 'There is no sealed auction now' };
      const p = P(s, ctx.playerId); const amount = ctx.args && ctx.args.amount;
      if (!p) return { error: 'You are not at this table' };
      if (!Number.isInteger(amount) || amount < 0) return { error: 'Bid a whole number (0 = no bid)' };
      if (amount > p.money) return { error: 'You do not have that much money' };
      const first = T.secret.pending(s.lot.bids).includes(p.id);
      if (!T.secret.commit(s.lot.bids, p.id, amount)) return { error: 'Too late to bid' };
      if (first) log(s, `${p.name} slid a sealed envelope across the table.`);
      if (T.secret.allIn(s.lot.bids)) {
        const all = T.secret.reveal(s.lot.bids);
        const bids = Object.fromEntries(Object.entries(all).filter(([, v]) => v > 0));
        const r = T.auction.sealed(bids, { order: s.lot.bids.ids });
        ctx.fx({ type: 'banner', text: 'Envelopes open', sub: r ? `${P(s, r.id).name} bid ${r.bid}${r.tied.length > 1 ? ' (tie → closest to the auctioneer\'s left)' : ''}` : 'No bids', ms: 1800, color: '#4a4f9c' });
        settle(s, ctx, r && r.id, r && r.price);
      }
      return s;
    },
    // Dutch: at each price every bidder takes it or declines; when all decline the price drops
    take(s, ctx) {
      if (s.phase !== 'auction' || s.lot.kind !== 'dutch') return { error: 'There is no Dutch auction now' };
      const p = P(s, ctx.playerId); const a = s.lot.auction;
      if (!p) return { error: 'You are not at this table' };
      if (!a.order.includes(p.id)) return { error: 'The auctioneer cannot take their own painting' };
      if (p.money < a.price) return { error: 'You do not have that much money' };
      if (!T.auction.take(a, p.id)) return { error: 'You cannot take now' };
      afterBid(s, ctx);
      return s;
    },
    decline(s, ctx) {
      if (s.phase !== 'auction' || s.lot.kind !== 'dutch') return { error: 'There is no Dutch auction now' };
      const p = P(s, ctx.playerId); const lot = s.lot;
      const auction = lot.auction; const price = auction.price;
      if (!p || !T.auction.decline(auction, p.id)) return { error: 'You cannot decline now' };
      if (T.auction.done(auction)) { afterBid(s, ctx); return s; }
      if (auction.price !== price) log(s, `Nobody takes ${title(s, lot.card)}: the price drops to ${auction.price}.`);
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const lot = s.lot;
    const active = activeIds(s);
    const acts = me ? module.exports.actions(s, { playerId: me.id }) : [];
    const zones = [
      { id: 'deck', layout: 'stack', at: [-30, 10], label: 'Paintings' },
      { id: 'block', layout: 'row', at: [0, 10], label: 'Auction block', mat: { color: '#3a2a20' }, size: [16, 16] },
      { id: 'sold', layout: 'pile', at: [30, 10], label: 'Sold to the bank' },
    ];
    const objects = [
      { id: 'deckObj', kind: 'deck', zone: 'deck', count: s.deck.length, back: BACK, tip: `${s.deck.length} paintings not yet dealt` },
    ];
    if (s.sold.length) objects.push({ id: 'soldPile', kind: 'deck', zone: 'sold', count: s.sold.length, faceUp: true, face: face(s, s.sold[s.sold.length - 1]), tip: `${s.sold.length} paintings sold to the bank` });
    // the artist board: market value so far and this season's offered paintings
    ARTISTS.forEach((a, i) => {
      const x = -24 + i * 16;
      objects.push({ id: `artist:${a.id}`, kind: 'board', at: [x, -16], size: [14, 6], face: { title: a.name, text: `Value ${s.value[a.id]}`, color: a.color, icon: a.icon }, tip: `${a.name}: market value ${s.value[a.id]} · ${s.offered[a.id] || 0} offered this season` });
      zones.push({ id: `val:${a.id}`, layout: 'row', at: [x, -11], gap: 0.4 });
      s.awards[a.id].forEach((v, k) => objects.push({ id: `award:${a.id}:${k}`, kind: 'token', shape: 'disc', color: a.color, size: 2.2, zone: `val:${a.id}`, order: k, face: { title: String(v) }, label: String(v), tip: `Season ${k + 1}: +${v}` }));
      zones.push({ id: `off:${a.id}`, layout: 'row', at: [x, -4], gap: -2.4, slots: ENDS_SEASON, slot: 'mini', label: `${a.name.split(' ')[1]} · this season` });
      // one marker per painting offered this season (the paintings themselves hang in collections)
      for (let k = 0; k < (s.offered[a.id] || 0); k++) objects.push({ id: `mark:${a.id}:${k}`, kind: 'token', shape: 'square', color: a.color, size: 2.6, zone: `off:${a.id}`, order: k, face: { title: a.icon }, tip: `${a.name}: offered #${k + 1} this season` });
    });
    if (lot) {
      objects.push({ id: lot.card, kind: 'card', zone: 'block', size: 'large', face: face(s, lot.card), glow: '#f2c14e' });
      objects.push({ id: 'blockInfo', kind: 'text', at: [0, 20], text: blockText(s), size: 1.4, color: '#f3e7c9' });
    }
    s.unsold.forEach((c, k) => objects.push({ id: c, kind: 'card', zone: 'block', order: 1 + k, size: 'poker', face: face(s, c) }));
    for (const p of s.players) {
      const isMe = !!(me && me.id === p.id);
      zones.push({ id: `hand:${p.id}`, seat: p.id, layout: isMe ? 'fan' : 'row', at: [0, 7], gap: isMe ? 0.4 : -2.6 });
      zones.push({ id: `own:${p.id}`, seat: p.id, layout: 'row', at: [0, -4], gap: 0.5, label: `${p.name}'s collection` });
      zones.push({ id: `purse:${p.id}`, seat: p.id, layout: 'row', at: [18, 4] });
      p.hand.forEach((c, k) => objects.push({
        id: c, kind: 'card', zone: `hand:${p.id}`, order: k, enterFrom: 'deck', faceUp: isMe, face: isMe ? face(s, c) : undefined, back: BACK, size: isMe ? 'poker' : 'mini',
        click: isMe && acts.some((a) => a.name === 'offer' && a.args.card === c) ? { name: 'offer', args: { card: c } } : undefined,
        tip: isMe ? `${title(s, c)} · ${ART[lotOf(s, c).artist].name} · ${KINDS[lotOf(s, c).kind].name} auction` : undefined,
      }));
      p.owned.forEach((c, k) => objects.push({ id: c, kind: 'card', zone: `own:${p.id}`, order: k, size: 'mini', face: face(s, c) }));
      // money is a closed purse: only its owner sees the amount
      objects.push(isMe
        ? { id: `purseTok:${p.id}`, kind: 'token', shape: 'coin', color: '#d4a72c', count: Math.min(20, Math.ceil(p.money / 10)), zone: `purse:${p.id}`, label: `${p.money}`, showCount: false, tip: `Your purse: ${p.money}` }
        : { id: `purseTok:${p.id}`, kind: 'token', shape: 'cylinder', color: '#5b3a1e', size: 2.4, zone: `purse:${p.id}`, tip: `${p.name}'s purse — closed` });
    }

    const prompt = promptFor(s, me, acts);
    const myTurn = acts.some((a) => !a.free);
    const status = s.phase === 'over' ? 'Game over'
      : `Season ${s.season}/${SEASONS} · ${lot ? `${KINDS[lot.kind].name} auction` : `${P(s, T.turns.current(s.turn)).name} chooses a painting`}`;
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'night' }, table: { surface: 'felt-red' }, theme: { serif: 'Playfair Display, Georgia, serif' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: active.includes(p.id), me: !!(me && me.id === p.id),
          sub: `${p.owned.length} painting${p.owned.length === 1 ? '' : 's'}${lot && lot.auctioneer === p.id ? ' · auctioneer' : ''}` })),
        zones, objects,
      },
      hud: {
        title: 'Auction House', status, myTurn,
        players: s.players.map((p) => ({
          id: p.id, name: p.name, color: p.color, active: active.includes(p.id), me: !!(me && me.id === p.id),
          badges: [lot && lot.auctioneer === p.id ? 'Auctioneer' : null, lot && lot.kind === 'sealed' && lot.bids.choices[p.id] !== undefined ? 'Sealed bid in' : null].filter(Boolean),
          stats: [
            // only your own money is shown; at the end every purse opens
            ...(p === me || s.phase === 'over' ? [{ label: 'Money', value: p.money, color: '#b8901f', key: true }] : []),
            { label: 'Paintings', value: p.owned.length, key: true },
            { label: 'Hand', value: p.hand.length },
          ],
        })),
        prompt, promptTone: myTurn ? '' : 'wait', promptTitle: lot ? `${KINDS[lot.kind].icon} ${KINDS[lot.kind].name} auction` : s.phase === 'over' ? 'Game over' : 'Offer',
        panels: [
          { id: 'market', title: 'Art market', icon: '⚖', side: 'left', open: true, node: { type: 'col', gap: 4, children: [
            ...standings(s).map((r) => ({ type: 'text', size: 'sm', text: `${ART[r.id].icon} ${ART[r.id].name} — value ${s.value[r.id]}, offered ${r.score} this season` })),
            { type: 'text', size: 'sm', muted: true, text: `Season end: top 3 by paintings offered gain ${AWARDS.join(' / ')}. Ties: the artist listed first.` },
          ] } },
          { id: 'kinds', title: 'Auction kinds', icon: '✉', side: 'left', open: false, node: { type: 'col', gap: 4, children: KIND_KEYS.map((k) => ({ type: 'text', size: 'sm', text: `${KINDS[k].icon} ${KINDS[k].name}: ${KINDS[k].text}` })) } },
        ],
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (s.phase !== 'over') return null;
    return T.score.result(s.players, { keys: ['money', 'paintingsBought'], reason: (r) => `${r[0].name} closed the richest purse (${r[0].score})` });
  },

  // balance lab: money plus what the paintings in hand-collection should fetch
  score(s, { playerId }) {
    const p = P(s, playerId);
    let v = p.money + p.owned.reduce((a, c) => a + estimate(s, lotOf(s, c).artist), 0);
    // a bid that is leading counts as a purchase in the making
    const a = s.lot && s.lot.auction;
    if (a && a.leader != null) {
      const worth = estimate(s, lotOf(s, s.lot.card).artist);
      if (a.leader === playerId) v += worth - a.high;
      else if (playerId === s.lot.auctioneer) v += a.high;
    }
    // a sealed envelope: overbidding is a loss in the making (the balance lab may peek, players never do)
    const b = s.lot && s.lot.bids && !s.lot.bids.revealed ? s.lot.bids.choices[playerId] : undefined;
    if (b) v -= Math.max(0, b - estimate(s, lotOf(s, s.lot.card).artist) * 0.8);
    return v;
  },

  actions(s, { playerId }) {
    const p = P(s, playerId);
    if (!p || s.phase === 'over') return [];
    if (s.phase === 'offer') return T.turns.current(s.turn) === playerId ? p.hand.map((card) => ({ name: 'offer', args: { card } })) : [];
    const lot = s.lot;
    if (lot.kind === 'sealed') {
      const bids = [0, ...bidLadder(1, p.money)];
      const done = lot.bids.choices[playerId] !== undefined;
      return bids.map((amount) => ({ name: 'seal', args: { amount }, ...(done ? { free: true } : {}) }));
    }
    if (lot.kind === 'dutch') {
      if (!lot.auction.order.includes(playerId) || lot.auction.declined.includes(playerId)) return [];
      return [{ name: 'decline' }, ...(p.money >= lot.auction.price ? [{ name: 'take' }] : [])];
    }
    if (T.auction.turn(lot.auction) !== playerId) return [];
    return [{ name: 'pass' }, ...bidLadder(T.auction.minBid(lot.auction), p.money).map((amount) => ({ name: 'bid', args: { amount } }))];
  },

  bot(s, { playerId, actions, random }) {
    const p = P(s, playerId);
    const main = actions.filter((a) => !a.free);
    if (!main.length) return null;
    if (s.phase === 'offer') {
      // offer the artist you hold most of (it pushes their value), avoid ending the season early with an empty hand
      const held = T.sets.count(p.owned.map((c) => lotOf(s, c).artist));
      let best = main[0]; let bv = -Infinity;
      for (const a of main) {
        const art = lotOf(s, a.args.card).artist;
        const ends = s.offered[art] + 1 >= ENDS_SEASON;
        const v = estimate(s, art) * 0.4 + (held[art] || 0) * 6 + (ends ? (p.owned.length ? 8 : -15) : 0) + random.float() * 8;
        if (v > bv) { bv = v; best = a; }
      }
      return best;
    }
    const lot = s.lot; const art = lotOf(s, lot.card).artist;
    const own = playerId === lot.auctioneer;
    // the auctioneer pays the bank, so their own bids are worth less to them; keep some cash for later seasons
    const worth = estimate(s, art) * (own ? 0.55 : 0.8) * (0.85 + random.float() * 0.3);
    const cap = Math.min(p.money - (s.season < SEASONS ? 10 : 0), Math.floor(worth));
    if (lot.kind === 'dutch') return main.find((a) => a.name === (lot.auction.price <= cap ? 'take' : 'decline')) || main[0];
    if (lot.kind === 'sealed') {
      const bids = main.filter((a) => a.args.amount <= Math.max(0, cap)).sort((x, y) => y.args.amount - x.args.amount);
      return bids[0] || main[0];
    }
    const min = T.auction.minBid(lot.auction);
    if (min > cap) return main.find((a) => a.name === 'pass');
    if (lot.kind === 'once') return main.filter((a) => a.name === 'bid' && a.args.amount <= cap).sort((x, y) => y.args.amount - x.args.amount)[0] || main[0];
    // open: raise by a little — sometimes by a lot to scare the others off
    const raises = main.filter((a) => a.name === 'bid' && a.args.amount <= cap && a.args.amount <= min + 10);
    return raises.length ? raises[Math.min(raises.length - 1, random.int(3))] : main.find((a) => a.name === 'pass');
  },

  invariants(s) {
    const e = [];
    const total = Object.keys(s.lots).length;
    const count = s.deck.length + s.sold.length + s.unsold.length + (s.lot ? 1 : 0)
      + s.players.reduce((a, p) => a + p.hand.length + p.owned.length, 0);
    if (count !== total) e.push(`Painting count changed (${count}/${total})`);
    s.players.forEach((p) => { if (p.money < 0) e.push(`${p.name} has negative money`); });
    return e;
  },
};

// a short list of bids for actions(): the minimum, a few raises and everything you have
function bidLadder(min, money) {
  const out = new Set();
  for (const x of [min, min + 1, min + 2, min + 5, min + 10, min + 20, Math.floor(money / 2), money]) if (x >= min && x <= money && x >= 1) out.add(x);
  return [...out].sort((a, b) => a - b);
}

function activeIds(s) {
  if (s.phase === 'over') return [];
  if (s.phase === 'offer') return [T.turns.current(s.turn)];
  const lot = s.lot;
  if (lot.kind === 'sealed') return T.secret.pending(lot.bids);
  if (lot.kind === 'dutch') return lot.auction.order.filter((id) => !lot.auction.declined.includes(id));
  return [T.auction.turn(lot.auction)].filter(Boolean);
}

function blockText(s) {
  const lot = s.lot; const a = lot.auction;
  if (lot.kind === 'sealed') return `Sealed bids: ${lot.bids.ids.length - T.secret.pending(lot.bids).length}/${lot.bids.ids.length} in`;
  if (lot.kind === 'dutch') return `Price ${a.price}`;
  return a.leader ? `High bid ${a.high} · ${P(s, a.leader).name}` : 'No bids yet';
}

function promptFor(s, me, acts) {
  if (s.phase === 'over') {
    return { type: 'col', children: [{ type: 'text', text: '🏆 The purses open', bold: true, size: 'lg' },
      { type: 'scores', items: s.players.slice().sort((a, b) => b.money - a.money).map((p) => ({ label: p.name, value: p.money, color: p.color })) }] };
  }
  const lot = s.lot;
  const wait = (t) => ({ type: 'text', text: `⏳ ${t}`, muted: true });
  const who = activeIds(s).map((id) => P(s, id).name).join(', ');
  if (!me) return wait(lot ? `${blockText(s)} — waiting for ${who}` : `${who} is choosing a painting`);
  if (s.phase === 'offer') {
    if (!acts.length) return wait(`${who} is choosing a painting to auction`);
    return { type: 'col', children: [{ type: 'text', text: 'You are the auctioneer: click a painting in your hand to put it up.', bold: true },
      { type: 'text', text: `The ${ENDS_SEASON}th painting of an artist in a season is not sold — it ends the season.`, muted: true }] };
  }
  const name = title(s, lot.card); const money = me.money;
  if (lot.kind === 'sealed') {
    const mine = lot.bids.choices[me.id];
    return { type: 'col', children: [
      { type: 'text', text: mine === undefined ? `Sealed bid for ${name}` : `Your sealed bid: ${mine || 'no bid'}`, bold: true },
      { type: 'text', text: `You have ${money}. 0 = no bid. Ties go to the bidder closest to the auctioneer's left.`, muted: true },
      { type: 'form', fields: [{ id: 'amount', label: 'Bid', kind: 'number', min: 0, max: money }], submit: { label: mine === undefined ? 'Seal bid' : 'Change bid', move: 'seal' } },
      ...(mine !== undefined ? [wait(`waiting for ${who}`)] : []),
    ] };
  }
  if (lot.kind === 'dutch') {
    if (!acts.length) return wait(`${name} at ${lot.auction.price} — waiting for ${who}`);
    return { type: 'col', children: [
      { type: 'text', text: `${name} for ${lot.auction.price}?`, bold: true },
      { type: 'text', text: `You have ${money}. When everyone declines, the price drops by ${DUTCH.step}.`, muted: true },
      { type: 'row', children: [
        { type: 'button', label: `Take for ${lot.auction.price}`, move: { name: 'take' }, disabled: money < lot.auction.price },
        { type: 'button', label: 'Decline', variant: 'ghost', move: { name: 'decline' } }] }] };
  }
  if (!acts.length) return wait(`${blockText(s)} — ${who} to bid`);
  const min = T.auction.minBid(lot.auction);
  return { type: 'col', children: [
    { type: 'text', text: `${KINDS[lot.kind].name} auction for ${name} — ${blockText(s)}`, bold: true },
    { type: 'text', text: `You have ${money}. Minimum bid ${min}.${lot.kind === 'once' ? ' You bid only once.' : ' Passing is final.'}`, muted: true },
    ...(min <= money ? [{ type: 'row', wrap: true, children: bidLadder(min, money).slice(0, 4).map((x) => ({ type: 'button', label: `Bid ${x}`, move: { name: 'bid', args: { amount: x } } })) },
      { type: 'form', fields: [{ id: 'amount', label: 'Bid', kind: 'number', min, max: money }], submit: { label: 'Bid', move: 'bid' } }] : []),
    { type: 'button', label: 'Pass', variant: 'ghost', move: { name: 'pass' } },
  ] };
}

function face(s, c) {
  const l = lotOf(s, c); const a = ART[l.artist]; const k = KINDS[l.kind];
  return {
    title: title(s, c), subtitle: a.name, text: `${k.icon} ${k.name} auction`, color: a.color, icon: a.icon,
    corners: { tl: { text: k.icon, sub: k.name }, br: { text: a.icon } },
  };
}
