import test from 'node:test';
import assert from 'node:assert/strict';
import { T, GameModule, makeRandom } from '../src/server/index.js';
import { LocalGameModule } from '../src/client/local-module.js';
import { createKit, KIT_SOURCE } from '../src/core/kit.js';

const rnd = (seed = 1) => makeRandom(seed).api;
const near = (a, b) => Math.abs(a - b) < 1e-12;

// ------------------------------------------------------------ grid
test('T.grid: keys, neighbours, distances, bounds', () => {
  const G = T.grid;
  assert.equal(G.key(2, 3), '2,3');
  assert.equal(G.key([2, 3]), '2,3');
  assert.deepEqual(G.parse('-1,4'), [-1, 4]);
  assert.deepEqual(G.neighbors('0,0'), ['1,0', '0,1', '-1,0', '0,-1']);
  assert.equal(G.neighbors('0,0', 8).length, 8);
  assert.equal(G.manhattan('0,0', '3,-2'), 5);
  assert.equal(G.chebyshev('0,0', '3,-2'), 3);
  assert.equal(G.rect(4, 3).length, 12);
  assert.equal(G.rect(4, 3)[4], '0,1');
  assert.ok(G.inBounds('3,2', 4, 3) && !G.inBounds('4,0', 4, 3) && !G.inBounds('0,-1', 4, 3));
});

test('T.grid: lines, line of sight, flood fill, regions, paths', () => {
  const G = T.grid;
  assert.deepEqual(G.line('0,0', '3,0'), ['0,0', '1,0', '2,0', '3,0']);
  assert.deepEqual(G.line('0,0', '2,2'), ['0,0', '1,1', '2,2']);
  assert.deepEqual(G.line('3,1', '0,0').at(-1), '0,0');
  assert.equal(G.line('0,0', '5,2').length, 6);
  const walls = new Set(['2,0']);
  assert.equal(G.lineOfSight('0,0', '4,0', (c) => walls.has(c)), false);
  assert.equal(G.lineOfSight('0,0', '2,0', (c) => walls.has(c)), true); // the target cell itself does not block
  // Go-like board: X stones form two groups, the rest is one empty region
  const rows = ['XX..', '...X', '...X'];
  const cells = G.rect(4, 3);
  const at = (k) => { const [x, y] = G.parse(k); return rows[y][x] === '.' ? null : rows[y][x]; };
  const regs = G.regions(cells, at);
  assert.deepEqual(regs.filter((r) => r.value === 'X').map((r) => r.cells.length).sort(), [2, 2]);
  assert.equal(regs.filter((r) => r.value === null).length, 1);
  assert.equal(regs.reduce((n, r) => n + r.cells.length, 0), 12);
  assert.equal(G.regions(cells, at, 8).filter((r) => r.value === 'X').length, 2);
  assert.equal(G.floodFill('0,1', (k) => G.inBounds(k, 4, 3) && at(k) === null).length, 8);
  const p = G.path('0,0', '3,0', (k) => G.inBounds(k, 4, 3) && !walls.has(k));
  assert.equal(p.cost, 5);
  assert.ok(!p.path.includes('2,0'));
  assert.equal(G.path('0,0', '3,0', (k) => G.inBounds(k, 4, 1) && !walls.has(k)), null);
  // regions with another neighbour function (hex)
  assert.equal(G.regions(T.hex.area('0,0', 1), () => 1, T.hex.neighbors).length, 1);
});

test('T.grid.lineRuns: connect four, tic-tac-toe and match-3', () => {
  const G = T.grid;
  const board = (rows) => ({ cells: G.rect(rows[0].length, rows.length), at: (k) => { const [x, y] = G.parse(k); const c = rows[y][x]; return c === '.' ? null : c; } });
  const c4 = board(['.......', '...R...', '..RY...', '.RYY...', 'RYYYR..']);
  const r4 = G.lineRuns(c4.cells, c4.at, 4);
  assert.equal(r4.length, 1);
  assert.equal(r4[0].value, 'R');
  assert.deepEqual([...r4[0].cells].sort(), ['0,4', '1,3', '2,2', '3,1']);
  assert.equal(G.lineRuns(c4.cells, c4.at, 3).filter((r) => r.value === 'Y').length, 3); // row, column and diagonal YYY
  const ttt = board(['XOX', 'OXO', 'OXX']);
  assert.deepEqual(G.lineRuns(ttt.cells, ttt.at, 3).map((r) => r.value), ['X']);
  const m3 = board(['ABBBA', 'ACCAA', 'ABCCC']);
  const runs = G.lineRuns(m3.cells, m3.at, 3, { diagonal: false });
  assert.deepEqual(runs.map((r) => `${r.value}${r.cells.length}`).sort(), ['A3', 'B3', 'C3']);
  // runs are maximal: five in a row is one run of 5, not three runs of 3
  const five = board(['XXXXX']);
  assert.deepEqual(G.lineRuns(five.cells, five.at, 3).map((r) => r.cells.length), [5]);
});

test('T.grid shapes: rotation, flips, unique orientations and fitting', () => {
  const G = T.grid;
  const L = [[0, 0], [0, 1], [0, 2], [1, 2]];
  const count = (s, f) => G.orientations(s, f).length;
  assert.equal(count(L), 8);
  assert.equal(count(L, false), 4);
  assert.equal(count([[0, 0], [1, 0], [0, 1], [1, 1]]), 1); // O
  assert.equal(count([[0, 0], [1, 0], [2, 0], [3, 0]]), 2); // I
  assert.equal(count([[0, 0], [1, 0], [2, 0], [1, 1]]), 4); // T
  assert.equal(count([[1, 0], [2, 0], [0, 1], [1, 1]]), 4); // S + Z
  assert.equal(count([[1, 0], [2, 0], [0, 1], [1, 1]], false), 2); // S only
  assert.equal(count([[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]), 1); // plus
  assert.deepEqual(G.rotate(L, 4), G.normalize(L));
  assert.deepEqual(G.rotate(L, -1), G.rotate(L, 3));
  assert.deepEqual(G.flip(G.flip(L)), G.normalize(L));
  assert.deepEqual(G.rotate([[0, 0], [1, 0]], 1), [[0, 0], [0, 1]]); // a horizontal domino turns vertical
  assert.deepEqual(G.normalize(['2,2', '3,2']), [[0, 0], [1, 0]]);
  const taken = new Set(['1,1']);
  const free = (k) => G.inBounds(k, 3, 3) && !taken.has(k);
  assert.deepEqual(G.place([[0, 0], [1, 0]], '1,2'), ['1,2', '2,2']);
  assert.equal(G.fits([[0, 0], [1, 0]], '0,0', free), true);
  assert.equal(G.fits([[0, 0], [0, 1]], '1,0', free), false);
  const pl = G.placements([[0, 0], [1, 0]], G.rect(3, 3), free);
  // dominoes on a 3×3 board minus the centre: 8 border dominoes
  assert.equal(pl.length, 8);
  assert.ok(pl.every((p) => p.cells.every(free)));
});

// ------------------------------------------------------------ turns, flow, pending
test('T.turns: passing, first passer starts, once-around rounds, rotation', () => {
  const t = T.turns.create(['a', 'b', 'c', 'd'], { start: 'b' });
  assert.equal(T.turns.current(t), 'b');
  assert.equal(T.turns.next(t), 'c');
  assert.equal(T.turns.pass(t), false); // c passes first
  assert.equal(T.turns.next(t), 'd');
  T.turns.pass(t, 'a');
  assert.equal(T.turns.next(t), 'b'); // a is skipped
  assert.equal(T.turns.next(t), 'd');
  T.turns.pass(t, 'd');
  assert.equal(T.turns.next(t), 'b'); // only b is left: b keeps playing
  assert.equal(T.turns.pass(t, 'b'), true);
  assert.equal(T.turns.next(t), null);
  assert.equal(T.turns.current(t), null);
  assert.equal(T.turns.newRound(t, t.passed[0]), 'c');
  assert.deepEqual(t.passed, []);
  assert.equal(T.turns.rotate(t), 'd');
  assert.equal(T.turns.rotate(t), 'a'); // wraps around

  const once = T.turns.create(['a', 'b', 'c'], { once: true, start: 2 });
  assert.deepEqual([T.turns.current(once), T.turns.next(once), T.turns.next(once), T.turns.next(once)], ['c', 'a', 'b', null]);
  assert.equal(T.turns.newRound(once), 'c');
});

test('T.turns: snake draft order and score-based order with tie-breaks', () => {
  assert.deepEqual(T.turns.snake(['a', 'b', 'c']), ['a', 'b', 'c', 'c', 'b', 'a']);
  assert.deepEqual(T.turns.snake(['a', 'b'], 5), ['a', 'b', 'b', 'a', 'a']);
  const ps = [{ id: 'a', vp: 3, gold: 1 }, { id: 'b', vp: 1, gold: 9 }, { id: 'c', vp: 3, gold: 4 }, { id: 'd', vp: 1, gold: 9 }];
  // last place goes first (catch-up): fewest VP, then fewest gold, full ties keep seat order
  assert.deepEqual(T.turns.by(ps, ['-vp', '-gold']).map((p) => p.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(T.turns.by(ps, [(p) => p.vp, 'gold']).map((p) => p.id), ['c', 'a', 'b', 'd']);
});

test('T.flow: phases, rounds, finishing the round after the end trigger', () => {
  const f = T.flow.create(['income', 'actions', 'cleanup']);
  assert.equal(f.phase, 'income');
  assert.equal(T.flow.next(f), 'actions');
  T.flow.endAfterRound(f); // someone reached 30 VP: finish this round
  assert.equal(T.flow.isLastRound(f), true);
  assert.equal(T.flow.next(f), 'cleanup');
  assert.equal(T.flow.next(f), null);
  assert.equal(f.over, true);
  assert.equal(T.flow.next(f), null);

  const g = T.flow.create(['day', 'night'], { rounds: 3 });
  const seen = [];
  for (let p = g.phase; p; p = T.flow.next(g)) seen.push(`${g.round}${p[0]}`);
  assert.deepEqual(seen, ['1d', '1n', '2d', '2n', '3d', '3n']);
  const h = T.flow.create(['main'], { rounds: 10 });
  T.flow.endAfterRound(h, 1); // "one more round"
  assert.equal(h.lastRound, 2);
  T.flow.endAfterRound(h, 5); // a later trigger never extends the game
  assert.equal(h.lastRound, 2);
  assert.equal(T.flow.goto(h, 'nope'), false);
});

test('T.pending: interrupts resolve first, only the owner acts, choices are checked', () => {
  const s = { pending: [] };
  T.pending.push(s.pending, { playerId: 'a', kind: 'target', options: ['b', 'c'] });
  T.pending.push(s.pending, { playerId: 'b', kind: 'react', options: [{ card: 'shield' }, 'none'] }); // interrupt
  T.pending.queue(s.pending, { playerId: 'a', kind: 'draw' });
  assert.equal(T.pending.who(s.pending), 'b');
  assert.deepEqual(T.pending.actions(s.pending, 'a'), []);
  assert.deepEqual(T.pending.actions(s.pending, 'b', 'respond').map((x) => x.args.choice), [{ card: 'shield' }, 'none']);
  assert.equal(T.pending.resolve(s.pending, 'a', 'b'), null); // not a's turn to decide
  assert.equal(T.pending.resolve(s.pending, 'b', { card: 'sword' }), null); // not an option
  assert.deepEqual(T.pending.resolve(s.pending, 'b', { card: 'shield' }).choice, { card: 'shield' });
  assert.equal(T.pending.resolve(s.pending, 'a', 'c').kind, 'target');
  assert.equal(T.pending.resolve(s.pending, 'a').kind, 'draw'); // no options: anything resolves it
  assert.equal(T.pending.top(s.pending), null);
});

// ------------------------------------------------------------ cards
test('T.market: refill from the deck, take with and without sliding, prices, clear', () => {
  const r = rnd(3);
  const deck = ['a', 'b', 'c', 'd', 'e']; const discard = []; const row = [];
  assert.deepEqual(T.market.refill(row, 4, deck, discard, r), ['a', 'b', 'c', 'd']);
  assert.equal(T.market.take(row, 1), 'b');
  assert.deepEqual(row, ['a', 'c', 'd']); // cheaper slots filled by sliding
  T.market.refill(row, 4, deck, discard, r);
  assert.deepEqual(row, ['a', 'c', 'd', 'e']);
  assert.equal(T.market.take(row, 0, false), 'a');
  assert.deepEqual(row, [null, 'c', 'd', 'e']);
  assert.equal(T.market.take(row, 0), undefined);
  discard.push('x');
  assert.deepEqual(T.market.refill(row, 4, deck, discard, r), ['x']); // the hole is refilled from the reshuffled discard
  assert.deepEqual(T.market.refill(row, 6, deck, discard, r), []); // everything ran out
  const noReshuffleDeck = ['y']; const noReshuffleDiscard = ['z']; const noReshuffleRow = [];
  assert.deepEqual(T.market.refill(noReshuffleRow, 2, noReshuffleDeck, noReshuffleDiscard, r, { reshuffle: false }), ['y']);
  assert.deepEqual(noReshuffleRow, ['y']);
  assert.deepEqual(noReshuffleDeck, []);
  assert.deepEqual(noReshuffleDiscard, ['z']); // remaining discard is left alone when reshuffling is disabled
  assert.equal(T.market.price(0, [1, 2, 3]), 1);
  assert.equal(T.market.price(5, [1, 2, 3]), 3);
  assert.equal(T.market.price(3, 1), 3);
  const trash = [];
  assert.deepEqual(T.market.clear(row, trash), ['x', 'c', 'd', 'e']);
  assert.deepEqual([row.length, trash.length], [0, 4]);
});

test('T.draft: pick-and-pass alternating direction, pool drafting, snake order', () => {
  const order = ['a', 'b', 'c'];
  const hands = { a: [1, 2, 3], b: [4, 5, 6], c: [7, 8, 9] };
  const picks = { a: [], b: [], c: [] };
  // round 1: everyone picks secretly, then hands go left
  const sel = T.secret.create(order);
  T.secret.commit(sel, 'a', 2); T.secret.commit(sel, 'b', 6); T.secret.commit(sel, 'c', 7);
  assert.ok(T.secret.allIn(sel));
  for (const [id, card] of Object.entries(T.secret.reveal(sel))) assert.equal(T.draft.pick(hands[id], card, picks[id]), card);
  T.draft.pass(hands, order, T.draft.dir(1));
  assert.deepEqual(hands, { a: [8, 9], b: [1, 3], c: [4, 5] });
  T.draft.pass(hands, order, T.draft.dir(2));
  assert.deepEqual(hands, { a: [1, 3], b: [4, 5], c: [8, 9] });
  assert.equal(T.draft.pick(hands.a, 99, picks.a), undefined);
  // pool draft in snake order, picking with a predicate
  const pool = [{ id: 'x', v: 1 }, { id: 'y', v: 5 }, { id: 'z', v: 3 }];
  const got = T.turns.snake(['a', 'b'], 3).map(() => T.draft.pick(pool, (c) => c.v === Math.max(...pool.map((p) => p.v)), []).id);
  assert.deepEqual(got, ['y', 'z', 'x']);
});

test('T.deckbuild: draw, play, cleanup with reshuffle, gain and trash', () => {
  const r = rnd(9);
  const z = T.deckbuild.create(['c1', 'c2', 'c3', 'c4', 'c5', 'e1', 'e2'], r, 5);
  assert.equal(z.hand.length, 5);
  assert.equal(z.deck.length, 2);
  const c = z.hand[0];
  assert.equal(T.deckbuild.play(z, c), c);
  assert.deepEqual(z.play, [c]);
  T.deckbuild.gain(z, 'gold');
  T.deckbuild.gain(z, 'top', 'deck');
  assert.equal(z.deck[0], 'top');
  assert.equal(T.deckbuild.trash(z, z.hand[0]) !== undefined, true);
  assert.equal(T.deckbuild.trash(z, 'nope'), undefined);
  const before = T.deckbuild.all(z).length;
  const hand = T.deckbuild.cleanup(z, r, 5); // 3 in deck → the discard is reshuffled for the other 2
  assert.equal(hand.length, 5);
  assert.equal(hand[0], 'top');
  assert.deepEqual([z.play.length, T.deckbuild.all(z).length], [0, before]);
  assert.deepEqual(T.deckbuild.drawTo(z, r, 5), []);
  assert.equal(T.deckbuild.drawTo(z, r, 6).length, 1);
  const tiny = T.deckbuild.create(['x'], r, 3); // fewer cards than the hand size
  assert.deepEqual(tiny.hand, ['x']);
});

test('T.tricks: follow suit, trumps, must-trump and rank orders', () => {
  const C = (s) => ({ suit: s[0], rank: s.slice(1) });
  const order = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
  const o = { order, trump: 'H' };
  const hand = ['S7', 'SA', 'H8', 'C9'].map(C);
  assert.equal(T.tricks.legal(hand, [], o).length, 4);
  const trick = [{ id: 'a', card: C('SK') }];
  assert.deepEqual(T.tricks.legal(hand, trick, o).map((c) => c.suit + c.rank), ['S7', 'SA']);
  const noSpades = ['H8', 'C9'].map(C);
  assert.equal(T.tricks.legal(noSpades, trick, o).length, 2);
  assert.deepEqual(T.tricks.legal(noSpades, trick, { ...o, mustTrump: true }).map((c) => c.suit), ['H']);
  const t2 = [{ id: 'a', card: C('S10') }, { id: 'b', card: C('SA') }, { id: 'c', card: C('C9') }];
  assert.equal(T.tricks.winner(t2, o).id, 'b'); // A beats 10 in this order
  t2.push({ id: 'd', card: C('H7') });
  assert.equal(T.tricks.winner(t2, o).id, 'd'); // lowest trump wins
  assert.equal(T.tricks.winner(t2, { order }).id, 'b'); // no trump suit
  // string cards with numeric ranks and custom getters
  const s = { suit: (c) => c[0], rank: (c) => Number(c.slice(1)) };
  assert.equal(T.tricks.winner([{ id: 'x', card: 'B3' }, { id: 'y', card: 'B12' }, { id: 'z', card: 'R13' }], s).id, 'y');
  assert.equal(T.tricks.winner([], o), null);
});

// ------------------------------------------------------------ dice & bags
test('T.dice: pools, patterns, rerolls and exact odds', () => {
  const r = rnd(5);
  const pool = T.dice.roll(r, 5);
  assert.equal(pool.length, 5);
  assert.ok(pool.every((v) => v >= 1 && v <= 6));
  const kept = pool.slice();
  T.dice.reroll(pool, [1, 3], r);
  assert.deepEqual([pool[0], pool[2], pool[4]], [kept[0], kept[2], kept[4]]);
  const v = [3, 3, 5, 3, 5];
  assert.equal(T.dice.sum(v), 19);
  assert.deepEqual(T.dice.counts(v), { 3: 3, 5: 2 });
  assert.deepEqual(T.dice.groups(v), [3, 2]);
  assert.equal(T.dice.ofAKind(v), 3);
  assert.ok(T.dice.matches(v, { groups: [3, 2] })); // full house
  assert.ok(T.dice.matches(v, { groups: [2, 2] }));
  assert.ok(!T.dice.matches(v, { groups: [4] }));
  assert.ok(!T.dice.matches([2, 2, 3, 3, 4], { groups: [3, 2] }));
  assert.equal(T.dice.straight([2, 3, 4, 6, 5]), 5);
  assert.ok(T.dice.matches([1, 2, 3, 4, 6], { straight: 4 }));
  assert.ok(!T.dice.matches([1, 2, 3, 4, 6], { straight: 5 }));
  assert.ok(T.dice.matches([6, 6], { sum: [12] }));
  // exact odds
  assert.ok(near(T.dice.odds(2, 6, (d) => d[0] + d[1] === 7), 1 / 6));
  assert.ok(near(T.dice.odds(5, 6, (d) => T.dice.ofAKind(d) === 5), 6 / 7776)); // yahtzee
  assert.ok(near(T.dice.odds(3, ['hit', 'hit', 'miss'], (d) => d.includes('miss')), 1 - 8 / 27));
  assert.throws(() => T.dice.odds(9, 6, () => true));
});

test('T.bag: pulls with and without replacement, chances and exact bust odds', () => {
  const r = rnd(11);
  const bag = { white: 4, orange: 6 };
  const got = T.bag.draw(bag, r, 3);
  assert.equal(got.length, 3);
  assert.equal(T.bag.total(bag), 7);
  T.bag.put(bag, got);
  assert.deepEqual(bag, { white: 4, orange: 6 });
  assert.equal(T.bag.draw(bag, r, 4, true).length, 4);
  assert.equal(T.bag.total(bag), 10);
  assert.equal(T.bag.draw({ x: 1 }, r, 3).length, 1); // the bag runs out
  assert.ok(near(T.bag.chance(bag, 'white'), 0.4));
  assert.ok(near(T.bag.chance(bag, ['white', 'orange']), 1));
  assert.equal(T.bag.chance({}, 'white'), 0);
  // hypergeometric: both of 2 draws white = 4/10 · 3/9
  assert.ok(near(T.bag.odds(bag, 2, (d) => d.white === 2), 2 / 15));
  // with replacement: 0.4²
  assert.ok(near(T.bag.odds(bag, 2, (d) => d.white === 2, true), 0.16));
  // Quacks-style bust: white chips worth 1/2/3, already at 5, bust above 7 — draw 2 more
  const q = { w1: 4, w2: 2, w3: 1, g: 5 };
  const val = { w1: 1, w2: 2, w3: 3, g: 0 };
  const bust = T.bag.odds(q, 2, (d) => 5 + Object.keys(d).reduce((a, k) => a + d[k] * val[k], 0) > 7);
  // brute force over ordered pairs of chips
  const chips = Object.entries(q).flatMap(([k, n]) => Array(n).fill(val[k]));
  let hits = 0, all = 0;
  for (let i = 0; i < chips.length; i++) for (let j = 0; j < chips.length; j++) if (i !== j) { all++; if (5 + chips[i] + chips[j] > 7) hits++; }
  assert.ok(near(bust, hits / all));
  assert.ok(near(T.bag.odds(q, 99, (d) => d.g === 5), 1)); // drawing everything
  assert.ok(near(T.bag.odds(T.sets.count(['a', 'a', 'b']), 1, (d) => d.a === 1), 2 / 3)); // a deck as a bag
});

// ------------------------------------------------------------ economy
test('T.workers: capacity, one per player, blocked spaces, return home', () => {
  const b = T.workers.board({ forest: 1, mine: 2, market: null });
  assert.ok(T.workers.place(b, 'forest', 'a'));
  assert.ok(!T.workers.place(b, 'forest', 'b')); // full
  assert.ok(T.workers.place(b, 'mine', 'a'));
  assert.ok(!T.workers.place(b, 'mine', 'a', { onePerPlayer: true }));
  assert.ok(T.workers.place(b, 'mine', 'a'));
  for (let i = 0; i < 10; i++) T.workers.place(b, 'market', 'b');
  b.mine.blocked = true;
  assert.deepEqual(T.workers.available(b, 'c'), ['market']);
  assert.deepEqual(T.workers.spaces(b, 'a'), ['forest', 'mine']);
  assert.ok(!T.workers.place(b, 'nowhere', 'a'));
  assert.deepEqual(T.workers.returnAll(b), { a: 3, b: 10 });
  assert.equal(b.market.workers.length, 0);
  // action points are a resource
  const p = { ap: 3 };
  assert.ok(T.pay(p, { ap: 2 }));
  assert.ok(!T.pay(p, { ap: 2 }));
});

test('T.track and T.rondel', () => {
  const p = { fame: 8 };
  assert.deepEqual(T.track.move(p, 'fame', 5, { max: 10, marks: [5, 10] }), { value: 10, moved: 2, crossed: [10] });
  assert.deepEqual(T.track.move(p, 'fame', -7, { min: 0, marks: [5, 10] }), { value: 3, moved: -7, crossed: [10, 5] });
  assert.deepEqual(T.track.crossed(3, 3, [3]), []);
  assert.deepEqual(T.track.move({}, 'x', 2).value, 2);
  assert.equal(T.rondel.steps(6, 1, 8), 3);
  assert.equal(T.rondel.cost(0, 5, 8), 2);
  assert.equal(T.rondel.cost(0, 5, 8, { free: 3, cost: 2 }), 4);
  const ms = T.rondel.moves(6, 8, { budget: 1 });
  assert.deepEqual(ms.map((m) => m.to), [7, 0, 1, 2]);
  assert.deepEqual(ms.at(-1), { to: 2, steps: 4, cost: 1 });
  assert.equal(T.rondel.moves(0, 8).length, 7);
});

// ------------------------------------------------------------ interaction
test('T.secret: commit, change of mind, hidden view, reveal', () => {
  const s = T.secret.create(['a', 'b', 'c']);
  assert.ok(T.secret.commit(s, 'a', 'rock'));
  assert.ok(T.secret.commit(s, 'a', 'paper'));
  assert.ok(!T.secret.commit(s, 'zed', 'rock'));
  assert.ok(!T.secret.commit(s, 'b', undefined));
  assert.deepEqual(T.secret.pending(s), ['b', 'c']);
  assert.deepEqual(T.secret.view(s, 'b'), { a: true, b: null, c: null });
  assert.deepEqual(T.secret.view(s, 'a', '?'), { a: 'paper', b: null, c: null });
  T.secret.commit(s, 'b', 0); T.secret.commit(s, 'c', false); // falsy choices count
  assert.ok(T.secret.allIn(s));
  assert.deepEqual(T.secret.reveal(s), { a: 'paper', b: 0, c: false });
  assert.deepEqual(T.secret.view(s, 'b'), { a: 'paper', b: 0, c: false });
  assert.ok(!T.secret.commit(s, 'a', 'rock'));
});

test('T.auction: open ascending, once around, dutch, sealed and legal bids', () => {
  const a = T.auction.create(['a', 'b', 'c'], { min: 2 });
  assert.equal(T.auction.turn(a), 'a');
  assert.deepEqual(T.auction.legalBids(a, 'a', 4), [2, 3, 4]);
  assert.deepEqual(T.auction.legalBids(a, 'b', 4), []);
  assert.ok(!T.auction.bid(a, 'a', 1));
  assert.ok(!T.auction.bid(a, 'b', 5)); // not b's turn
  assert.ok(T.auction.bid(a, 'a', 2));
  assert.ok(T.auction.bid(a, 'b', 4));
  assert.ok(T.auction.pass(a, 'c'));
  assert.equal(T.auction.turn(a), 'a');
  assert.equal(T.auction.minBid(a), 5);
  assert.ok(T.auction.bid(a, 'a', 6));
  assert.equal(T.auction.turn(a), 'b'); // c passed for good
  assert.ok(T.auction.pass(a, 'b'));
  assert.ok(T.auction.done(a));
  assert.deepEqual(T.auction.winner(a), { id: 'a', price: 6 });
  assert.equal(T.auction.turn(a), null);

  const none = T.auction.create(['a', 'b']);
  T.auction.pass(none, 'a');
  assert.ok(!T.auction.done(none)); // the last player may still bid
  T.auction.pass(none, 'b');
  assert.ok(T.auction.done(none));
  assert.equal(T.auction.winner(none), null);

  const once = T.auction.create(['a', 'b', 'c'], { kind: 'once', start: 'b' });
  T.auction.bid(once, 'b', 3); T.auction.pass(once, 'c');
  assert.ok(!T.auction.done(once));
  assert.ok(!T.auction.bid(once, 'a', 3));
  T.auction.bid(once, 'a', 5);
  assert.deepEqual(T.auction.winner(once), { id: 'a', price: 5 });

  const d = T.auction.create(['a', 'b'], { kind: 'dutch', price: 10, step: 3, floor: 2 });
  assert.equal(T.auction.lower(d), 7);
  assert.equal(T.auction.lower(d), 4);
  assert.equal(T.auction.lower(d), null); // 1 is below the floor: no sale
  assert.ok(T.auction.done(d));
  assert.ok(!T.auction.take(d, 'a'));
  const d2 = T.auction.create(['b'], { kind: 'dutch', price: 10, step: 3 });
  T.auction.lower(d2);
  assert.ok(T.auction.take(d2, 'b'));
  assert.deepEqual(T.auction.winner(d2), { id: 'b', price: 7 });

  assert.deepEqual(T.auction.sealed({ a: 5, b: 9, c: 9, d: 2 }, { order: ['c', 'b'] }), { id: 'c', bid: 9, price: 9, tied: ['b', 'c'] });
  assert.equal(T.auction.sealed({ a: 5, b: 9, c: 9 }).id, 'b');
  assert.equal(T.auction.sealed({ a: 5, b: 8 }, { price: 'second' }).price, 5);
  assert.equal(T.auction.sealed({ a: 5 }, { price: 'second' }).price, 5);
  assert.equal(T.auction.sealed({}), null);
  const ids = new Set(Array.from({ length: 20 }, (_, i) => T.auction.sealed({ a: 1, b: 1 }, { random: rnd(i) }).id));
  assert.deepEqual([...ids].sort(), ['a', 'b']);
});

test('T.auction: Dutch declines lower once per price and only eligible bidders may respond', () => {
  const a = T.auction.create(['auctioneer', 'a', 'b'], { kind: 'dutch', price: 12, step: 3, floor: 4, exclude: ['auctioneer'] });
  assert.deepEqual(a.order, ['a', 'b']);
  assert.deepEqual(a.declined, []);
  assert.ok(!T.auction.take(a, 'auctioneer'));
  assert.ok(!T.auction.take(a, 'outsider'));
  assert.ok(!T.auction.decline(a, 'auctioneer'));
  assert.ok(!T.auction.decline(a, 'outsider'));

  assert.ok(T.auction.decline(a, 'a'));
  assert.equal(a.price, 12);
  assert.deepEqual(a.declined, ['a']);
  assert.ok(!T.auction.decline(a, 'a'));
  assert.ok(!T.auction.take(a, 'a')); // declined at this price
  assert.ok(T.auction.decline(a, 'b'));
  assert.equal(a.price, 9); // the last eligible decline lowers exactly one step
  assert.deepEqual(a.declined, []);

  assert.ok(T.auction.decline(a, 'a'));
  assert.equal(T.auction.lower(a), 6); // manual lowering also clears responses
  assert.deepEqual(a.declined, []);
  assert.ok(T.auction.take(a, 'a')); // a may take after the price changes
  assert.deepEqual(T.auction.winner(a), { id: 'a', price: 6 });
  assert.ok(!T.auction.decline(a, 'b'));

  const floor = T.auction.create(['a', 'b'], { kind: 'dutch', price: 6, step: 3, floor: 4 });
  assert.ok(T.auction.decline(floor, 'a'));
  assert.ok(T.auction.decline(floor, 'b'));
  assert.ok(floor.closed);
  assert.equal(floor.price, 6);
  assert.deepEqual(floor.declined, []);
  assert.ok(T.auction.done(floor));
  assert.ok(!T.auction.decline(floor, 'a'));

  const empty = T.auction.create(['auctioneer'], { kind: 'dutch', exclude: ['auctioneer'] });
  assert.ok(T.auction.done(empty)); // no eligible bidder means there is no auction to wait on
  assert.equal(T.auction.winner(empty), null);
  assert.equal(T.auction.lower(empty), null);
  assert.ok(!T.auction.decline(empty, 'auctioneer'));
});

test('T.vote: plurality, ties, weights and majorities', () => {
  const v = { a: 'yes', b: 'no', c: 'yes', d: null };
  assert.deepEqual(T.vote.tally(v), { yes: 2, no: 1 });
  assert.equal(T.vote.result(v).winner, 'yes');
  assert.equal(T.vote.result(v, { need: 'majority' }).winner, 'yes');
  assert.equal(T.vote.result({ a: 'x', b: 'y', c: 'z' }, { need: 'majority' }).winner, null);
  const tie = { a: 'x', b: 'y' };
  assert.equal(T.vote.result(tie).winner, null);
  assert.deepEqual(T.vote.result(tie).tied, ['x', 'y']);
  assert.equal(T.vote.result(tie, { tie: ['y', 'x'] }).winner, 'y');
  assert.ok(['x', 'y'].includes(T.vote.result(tie, { tie: 'random', random: rnd(2) }).winner));
  assert.equal(T.vote.result(tie, { weight: { a: 1, b: 3 } }).winner, 'y');
  assert.equal(T.vote.result({}).winner, null);
});

test('T.trade: offers, acceptance, cancellation and bank rates', () => {
  const res = { a: { wood: 3, ore: 0 }, b: { wood: 0, ore: 2 }, c: { ore: 5 } };
  const offers = [];
  const o1 = T.trade.offer(offers, { from: 'a', to: 'b', give: { wood: 2 }, get: { ore: 1 } });
  const o2 = T.trade.offer(offers, { from: 'a', give: { wood: 1 }, get: { ore: 3 } });
  assert.deepEqual([o1.id, o2.id], [1, 2]);
  assert.deepEqual(T.trade.open(offers, 'c').map((o) => o.id), [2]);
  assert.deepEqual(T.trade.open(offers, 'a'), []);
  assert.ok(!T.trade.accept(offers, 1, 'c', res)); // addressed to b
  assert.ok(!T.trade.accept(offers, 2, 'b', res)); // b cannot pay 3 ore
  assert.ok(T.trade.accept(offers, 1, 'b', (id) => res[id]));
  assert.deepEqual(res.a, { wood: 1, ore: 1 });
  assert.deepEqual(res.b, { wood: 2, ore: 1 });
  assert.deepEqual(offers.map((o) => o.id), [2]);
  assert.equal(T.trade.offer(offers, { from: 'b', give: {}, get: {} }).id, 3);
  assert.equal(T.trade.cancel(offers, 2).id, 2);
  assert.equal(T.trade.cancel(offers, 2), null);
  assert.ok(!T.trade.swap(res.a, res.c, { wood: 5 }, {}));
  assert.deepEqual(res.a, { wood: 1, ore: 1 }); // nothing changed
  const bank = { wood: 9 };
  assert.ok(T.trade.bank(bank, 'wood', 'ore', 4, 2));
  assert.deepEqual(bank, { wood: 1, ore: 2 });
  assert.ok(!T.trade.bank(bank, 'wood', 'ore', 2));
});

test('T.roles: balanced deals and private knowledge', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const table = { 5: ['merlin', 'loyal', 'loyal', 'spy', 'assassin'], 6: ['merlin', 'loyal', 'loyal', 'loyal', 'spy', 'assassin'] };
  const { roles, rest } = T.roles.deal(ids, table, rnd(4));
  assert.deepEqual(Object.values(roles).sort(), [...table[5]].sort());
  assert.deepEqual(rest, []);
  assert.deepEqual(T.roles.deal(ids, table, rnd(4)).roles, roles); // deterministic
  assert.equal(T.roles.deal(['a', 'b'], ['wolf', 'seer', 'villager'], rnd(1)).rest.length, 1);
  assert.throws(() => T.roles.deal(ids, ['x'], rnd(1)));
  const fixed = { a: 'merlin', b: 'loyal', c: 'spy', d: 'assassin', e: 'loyal' };
  const sees = { spy: ['spy', 'assassin'], assassin: ['spy', 'assassin'], merlin: { spy: 'evil', assassin: 'evil' } };
  assert.deepEqual(T.roles.known(fixed, 'c', sees), { c: 'spy', d: 'assassin' });
  assert.deepEqual(T.roles.known(fixed, 'a', sees), { a: 'merlin', c: 'evil', d: 'evil' });
  assert.deepEqual(T.roles.known(fixed, 'b', sees), { b: 'loyal' });
  assert.deepEqual(T.roles.known(fixed, 'zed', sees), {});
  assert.deepEqual(T.roles.who(fixed, ['spy', 'assassin']), ['c', 'd']);
  assert.deepEqual(T.roles.who(fixed, 'loyal'), ['b', 'e']);
});

// ------------------------------------------------------------ scoring
test('T.score: ranking with tie-breakers, shared places, endIf results, tables', () => {
  const ps = [
    { id: 'a', name: 'Ada', vp: 10, coins: 2, seat: 0 },
    { id: 'b', name: 'Bo', vp: 12, coins: 0, seat: 1 },
    { id: 'c', name: 'Cy', vp: 10, coins: 2, seat: 2 },
    { id: 'd', name: 'Di', vp: 10, coins: 5, seat: 3 },
  ];
  assert.deepEqual(T.score.rank(ps, ['vp', 'coins']).map((r) => `${r.id}${r.place}`), ['b1', 'd2', 'a3', 'c3']);
  assert.deepEqual(T.score.rank(ps, ['vp', 'coins', '-seat']).map((r) => `${r.id}${r.place}`), ['b1', 'd2', 'a3', 'c4']);
  assert.deepEqual(T.score.rank(ps, ['vp'])[1], { id: 'a', name: 'Ada', score: 10, place: 2 });
  assert.deepEqual(T.score.rank(['x', 'y'], [(id) => (id === 'y' ? 3 : 1)]).map((r) => r.id), ['y', 'x']);
  const res = T.score.result(ps, { keys: ['vp'] });
  assert.deepEqual(res.winners, ['b']);
  assert.equal(res.reason, 'Bo wins with 12');
  const tied = T.score.result([{ id: 'a', score: 3 }, { id: 'b', score: 3 }]);
  assert.deepEqual(tied.winners, ['a', 'b']);
  assert.match(tied.reason, /Shared/);
  assert.equal(T.score.result(ps, { keys: ['vp'], reason: (r) => `${r.length} players` }).reason, '4 players');
  assert.equal(T.score.table(4, [0, 1, 3, 6, 10, 15]), 10);
  assert.equal(T.score.table(9, [0, 1, 3, 6, 10, 15]), 15);
  assert.equal(T.score.table(-1, [0, 1]), 0);
});

test('T.sets: kinds, n-of-a-kind, complete and distinct sets, runs', () => {
  const tableau = ['gear', 'gear', 'tablet', 'compass', 'gear', 'tablet'];
  const c = T.sets.count(tableau);
  assert.deepEqual(c, { gear: 3, tablet: 2, compass: 1 });
  assert.equal(T.sets.count([{ k: 'a' }, { k: 'a' }], 'k').a, 2);
  assert.equal(T.sets.ofAKind(c, 2), 2);
  assert.equal(T.sets.ofAKind(c, 2, 'gear'), 1);
  assert.equal(T.sets.ofAKind(c, 2, ['gear', 'tablet']), 2);
  assert.equal(T.sets.ofAKind(tableau, 3, 'gear'), 1);
  assert.equal(T.sets.ofAKind(tableau, 2, ['gear', 'tablet']), 2);
  assert.equal(T.sets.complete(c, ['gear', 'tablet', 'compass']), 1);
  assert.equal(T.sets.complete(c, ['gear', 'wheel']), 0);
  // 7 Wonders science: squares + 7 per complete set
  const science = Object.values(c).reduce((a, n) => a + n * n, 0) + 7 * T.sets.complete(c, ['gear', 'tablet', 'compass']);
  assert.equal(science, 21);
  assert.deepEqual(T.sets.distinct(c), [3, 2, 1]);
  assert.deepEqual(T.sets.distinct(tableau), [3, 2, 1]);
  assert.deepEqual(T.sets.distinct({}), []);
  assert.deepEqual(T.sets.runs([5, 3, 4, 9, 8, 4]), [[3, 4, 5], [8, 9]]);
  assert.equal(T.sets.longest([10, 12, 11, 1]), 3);
  assert.equal(T.sets.longest([]), 0);
  // Sushi Go dumplings
  assert.equal(T.score.table(T.sets.count(['dumpling', 'dumpling', 'dumpling']).dumpling, [0, 1, 3, 6, 10, 15]), 6);
});

test('T.area: tallies, control, majorities with every tie rule', () => {
  const pieces = [
    { region: 'north', owner: 'a' }, { region: 'north', owner: 'a' }, { region: 'north', owner: 'b' },
    { region: 'south', owner: 'b' }, { region: 'south', owner: 'c' }, { region: 'south', owner: 'a', strength: 0 },
    { region: null, owner: 'a' },
  ];
  const t = T.area.tally(pieces);
  assert.deepEqual(t, { north: { a: 2, b: 1 }, south: { b: 1, c: 1, a: 1 } });
  assert.deepEqual(T.area.tally(pieces, 'region', 'owner', (p) => (p.strength == null ? 1 : p.strength)).south, { b: 1, c: 1, a: 0 });
  assert.equal(T.area.control(t.north), 'a');
  assert.equal(T.area.control(t.south), null);
  assert.equal(T.area.control({ a: 1 }, 2), null);
  const counts = { a: 4, b: 4, c: 2, d: 1 };
  assert.deepEqual(T.area.rank(counts).map((r) => r.place), [1, 1, 3, 4]);
  assert.deepEqual(T.area.majority(counts, [5, 3, 1]), { a: 4, b: 4, c: 1 });
  assert.deepEqual(T.area.majority(counts, [5, 3, 1], { tie: 'full' }), { a: 5, b: 5, c: 1 });
  assert.deepEqual(T.area.majority(counts, [5, 3, 1], { tie: 'down' }), { a: 3, b: 3, c: 1 });
  assert.deepEqual(T.area.majority(counts, [5, 3, 1], { tie: 'none' }), { a: 0, b: 0, c: 1 });
  const fewestCounts = { a: 0, b: 0, c: 1, d: 2 };
  assert.deepEqual(T.area.majority(fewestCounts, [6, 4, 2, 0], { fewest: true }), { a: 5, b: 5, c: 2, d: 0 });
  assert.deepEqual(T.area.majority(fewestCounts, [6, 4, 2, 0], { fewest: true, tie: 'full' }), { a: 6, b: 6, c: 2, d: 0 });
  assert.deepEqual(T.area.majority(fewestCounts, [6, 4, 2, 0], { fewest: true, tie: 'down' }), { a: 4, b: 4, c: 2, d: 0 });
  assert.deepEqual(T.area.majority(fewestCounts, [6, 4, 2, 0], { fewest: true, tie: 'none' }), { a: 0, b: 0, c: 2, d: 0 });
  assert.deepEqual(T.area.majority(fewestCounts, [6, 4], { fewest: true, min: 1 }), { c: 6, d: 4 });
  assert.deepEqual(T.area.majority({ a: 3, b: 3, c: 3 }, [6, 2]), { a: 2, b: 2, c: 2 }); // (6+2+0)/3 rounded down
  assert.deepEqual(T.area.majority({ a: 1, b: 0 }, [5, 3]), { a: 5 }); // 0 pieces never score
  assert.deepEqual(T.area.score(t, [5, 3]), { a: 5 + 2, b: 3 + 2, c: 2 });
  assert.deepEqual(T.area.score(t, (r) => (r === 'north' ? [10] : [1]), { tie: 'none' }), { a: 10, b: 0, c: 0 });
  assert.deepEqual(T.area.score({ south: fewestCounts }, [6, 4, 2, 0], { fewest: true }), { a: 5, b: 5, c: 2, d: 0 });
});

// ------------------------------------------------------------ sandbox parity
// The same probe runs on the host kit and inside both sandboxes: results must be identical.
function probe(T, random) {
  const ns = ['grid', 'turns', 'flow', 'pending', 'secret', 'auction', 'draft', 'market', 'deckbuild', 'workers', 'area', 'sets', 'tricks', 'dice', 'bag', 'score', 'vote', 'roles', 'trade', 'rondel', 'track'];
  const out = { api: {}, realm: Object.getPrototypeOf(T.grid.key) === Function.prototype };
  for (const n of ns) out.api[n] = Object.keys(T[n]).sort();
  out.grid = [T.grid.orientations([[0, 0], [0, 1], [1, 1]]).length, T.grid.lineRuns(T.grid.rect(3, 1), () => 'x', 3).length, T.grid.line('0,0', '4,3')];
  const t = T.turns.create(['a', 'b', 'c']); T.turns.pass(t, 'b'); T.turns.next(t); out.turns = [t, T.turns.snake(['a', 'b', 'c'], 7)];
  const f = T.flow.create(['x', 'y'], { rounds: 2 }); T.flow.next(f); T.flow.next(f); out.flow = f;
  const pend = []; T.pending.push(pend, { playerId: 'a', options: [1, 2] }); out.pending = T.pending.actions(pend, 'a');
  const sec = T.secret.create(['a', 'b']); T.secret.commit(sec, 'a', 3); out.secret = T.secret.view(sec, 'b');
  const au = T.auction.create(['a', 'b']); T.auction.bid(au, 'a', 2); T.auction.pass(au, 'b');
  const dutch = T.auction.create(['auctioneer', 'a', 'b'], { kind: 'dutch', price: 8, step: 2, exclude: ['auctioneer'] });
  T.auction.decline(dutch, 'a'); T.auction.decline(dutch, 'b');
  out.auction = [T.auction.winner(au), T.auction.sealed({ a: 1, b: 1 }, { random }), dutch];
  const hands = { a: [1], b: [2] }; T.draft.pass(hands, ['a', 'b']); out.draft = hands;
  const deck = random.shuffle(T.range(20)); const row = []; T.market.refill(row, 4, deck, [], random); T.market.take(row, 1); out.market = row;
  const z = T.deckbuild.create(T.range(10), random, 5); T.deckbuild.cleanup(z, random, 5); out.deckbuild = z;
  const b = T.workers.board({ s: 1 }); T.workers.place(b, 's', 'a'); out.workers = T.workers.available(b, 'b');
  out.area = [T.area.majority({ a: 2, b: 2, c: 1 }, [5, 3, 1]), T.area.majority({ a: 3, b: 1, c: 0 }, [5, 3], { fewest: true })];
  out.sets = [T.sets.distinct(['a', 'a', 'b']), T.sets.runs([1, 2, 4])];
  out.tricks = T.tricks.winner([{ id: 'a', card: { suit: 'S', rank: 3 } }, { id: 'b', card: { suit: 'S', rank: 9 } }]);
  out.dice = [T.dice.roll(random, 6), T.dice.odds(3, 6, (d) => d[0] === d[1])];
  const bag = { w: 3, r: 2 }; out.bag = [T.bag.draw(bag, random, 2), bag, T.bag.odds({ w: 3, r: 2 }, 2, (d) => d.w === 1)];
  out.score = T.score.result([{ id: 'a', score: 2 }, { id: 'b', score: 5 }]);
  out.vote = T.vote.result({ a: 'x', b: 'y' }, { tie: 'random', random });
  out.roles = T.roles.deal(['a', 'b', 'c'], ['spy', 'x', 'x', 'y'], random);
  const w = { a: { g: 2 }, b: { s: 1 } }; const offers = []; T.trade.offer(offers, { from: 'a', give: { g: 1 }, get: { s: 1 } }); T.trade.accept(offers, 1, 'b', w); out.trade = w;
  out.rondel = T.rondel.moves(5, 8, { budget: 0 });
  out.track = T.track.move({ v: 4 }, 'v', 3, { marks: [5, 7] });
  return out;
}

test('mechanics: the sandboxed kit matches the host kit (vm and browser runtimes)', () => {
  const source = `const probe = ${probe.toString()};
module.exports = {
  meta: { name: 'Probe', minPlayers: 1, maxPlayers: 2 },
  setup(ctx) { return { probe: probe(T, ctx.random) }; },
  moves: { again(s, ctx) { s.probe = probe(T, ctx.random); return s; } },
  view() { return { type: 'ui' }; },
};`;
  const players = [{ id: 'a', name: 'A' }];
  const host = probe(createKit(), makeRandom(42).api);
  assert.equal(host.realm, true);
  assert.equal(host.api.grid.length > 10, true);
  assert.deepEqual(probe(T, makeRandom(42).api), host);
  for (const M of [GameModule, LocalGameModule]) {
    const mod = new M(source);
    const { state, rng } = mod.setup(players, 42, {}, 0);
    assert.deepEqual(state.probe, JSON.parse(JSON.stringify(host)), M.name);
    const next = mod.move(state, 'again', { playerId: 'a', player: players[0], args: {}, now: 1 }, rng);
    const r = makeRandom(42); probe(T, r.api);
    assert.deepEqual(next.state.probe, JSON.parse(JSON.stringify(probe(T, makeRandom(r.state()).api))), M.name);
  }
  // every namespace on the host kit is in the sandbox source too
  for (const k of Object.keys(T)) assert.ok(KIT_SOURCE.includes(`T.${k} =`) || KIT_SOURCE.includes(`T.${k}=`), k);
});
