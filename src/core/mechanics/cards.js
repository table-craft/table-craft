// Cards: face-up markets, drafting, deck-building zones and trick-taking. Cards are whatever the game stores
// (ids, objects); a `card` argument is the card itself (===) or a predicate. Self-contained (injected via toString()).

export function installCards(T) {
  const get = (x, g) => (typeof g === 'function' ? g(x) : x == null ? undefined : x[g]);
  // removes one card from arr → the card, or undefined when it is not there
  const take = (arr, card) => { const i = typeof card === 'function' ? arr.findIndex(card) : arr.indexOf(card); return i < 0 ? undefined : arr.splice(i, 1)[0]; };

  // ------------------------------------------------------------ T.market (face-up card row)
  // row: array of cards; an empty slot is null (when cards do not slide)
  const M = {};
  // fills empty slots left to right, then up to `size` cards → the new cards (fewer when deck and discard run out)
  M.refill = (row, size, deck, discard, random) => {
    const out = [];
    for (let i = 0; i < Math.max(size, row.length); i++) {
      if (row[i] != null) continue;
      const [c] = T.draw(deck, discard, random, 1);
      if (c === undefined) break;
      row[i] = c; out.push(c);
    }
    return out;
  };
  // takes the card in slot i → the card or undefined. slide: later cards move down a slot (cheaper); else a hole stays
  M.take = (row, i, slide = true) => {
    const c = row[i]; if (c == null) return undefined;
    if (slide) row.splice(i, 1); else row[i] = null;
    return c;
  };
  // cost of slot i: costs[i] from a list (last entry repeats), or i × costs for a number
  M.price = (i, costs) => (Array.isArray(costs) ? costs[Math.max(0, Math.min(i, costs.length - 1))] : (Number(costs) || 0) * i);
  // empties the row (into `discard` when given) → the removed cards
  M.clear = (row, discard) => { const out = row.filter((c) => c != null); row.length = 0; if (discard) discard.push(...out); return out; };
  T.market = M;

  // ------------------------------------------------------------ T.draft
  const D = {};
  // moves a card from one list to another (pool → picks, hand → tableau) → the card or undefined
  D.pick = (from, card, to) => { const c = take(from, card); if (c !== undefined && to) to.push(c); return c; };
  // hands: { playerId: [cards] }. Every hand moves dir seats along `order` (1 = to the next player, -1 = back).
  D.pass = (hands, order, dir = 1) => {
    const old = order.map((id) => hands[id] || []);
    order.forEach((id, i) => { hands[order[T.nextIndex(order.length, i, dir)]] = old[i]; });
    return hands;
  };
  // passing direction for round 1, 2, 3… → 1, -1, 1… (left, right, left)
  D.dir = (round) => (round % 2 ? 1 : -1);
  T.draft = D;

  // ------------------------------------------------------------ T.deckbuild (per-player zones)
  // z = { deck, hand, discard, play }; the deck's front is its top
  const B = {};
  B.create = (cards, random, handSize = 0) => { const z = { deck: random.shuffle(cards), hand: [], discard: [], play: [] }; B.draw(z, random, handSize); return z; };
  // draws into the hand, shuffling the discard back when the deck runs out → the drawn cards
  B.draw = (z, random, n = 1) => { const c = T.draw(z.deck, z.discard, random, n); z.hand.push(...c); return c; };
  B.drawTo = (z, random, size) => B.draw(z, random, Math.max(0, size - z.hand.length));
  B.play = (z, card) => D.pick(z.hand, card, z.play);
  B.discard = (z, card) => D.pick(z.hand, card, z.discard);
  // end of turn: hand and play area go to the discard, then a new hand is drawn → the new hand
  B.cleanup = (z, random, handSize) => { z.discard.push(...z.hand, ...z.play); z.hand.length = 0; z.play.length = 0; B.draw(z, random, handSize); return z.hand; };
  // to: 'discard' (default), 'hand', 'play', 'deck' (on top) or 'bottom' (of the deck)
  B.gain = (z, card, to = 'discard') => { if (to === 'deck') z.deck.unshift(card); else if (to === 'bottom') z.deck.push(card); else z[to].push(card); return card; };
  // removes a card from a zone (default the hand) → the card; put it where trashed cards go
  B.trash = (z, card, from = 'hand') => take(z[from], card);
  B.all = (z) => [...z.deck, ...z.hand, ...z.discard, ...z.play];
  T.deckbuild = B;

  // ------------------------------------------------------------ T.tricks (trick-taking)
  // trick: [{ id, card }] in play order. opts: { suit = 'suit', rank = 'rank' (getters), order (ranks low → high,
  // else rank is a number), trump (a suit or null), mustTrump (no lead suit → must trump if able) }
  const K = {};
  const suitOf = (c, o) => get(c, (o && o.suit) || 'suit');
  const rankOf = (c, o) => { const r = get(c, (o && o.rank) || 'rank'); return o && o.order ? o.order.indexOf(r) : Number(r); };
  K.lead = (trick, o) => (trick && trick.length ? suitOf(trick[0].card, o) : null);
  // the cards of `hand` that may be played now
  K.legal = (hand, trick, o = {}) => {
    if (!trick || !trick.length) return hand.slice();
    const lead = K.lead(trick, o);
    const follow = hand.filter((c) => suitOf(c, o) === lead);
    if (follow.length) return follow;
    if (o.mustTrump && o.trump != null) { const t = hand.filter((c) => suitOf(c, o) === o.trump); if (t.length) return t; }
    return hand.slice();
  };
  // the winning { id, card }: the highest trump, else the highest card of the lead suit. The winner leads next.
  K.winner = (trick, o = {}) => {
    if (!trick || !trick.length) return null;
    const lead = K.lead(trick, o);
    const trumps = o.trump != null ? trick.filter((e) => suitOf(e.card, o) === o.trump) : [];
    const pool = trumps.length ? trumps : trick.filter((e) => suitOf(e.card, o) === lead);
    return pool.reduce((best, e) => (rankOf(e.card, o) > rankOf(best.card, o) ? e : best));
  };
  T.tricks = K;
}
