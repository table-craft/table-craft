import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameModule, Match, T, makeRandom, simulate, validate, checkScene, botDelay, visibleFx, configure } from '../src/server/index.js';
import { LocalGameModule } from '../src/client/local-module.js';

const source = fs.readFileSync(new URL('../examples/treasure-road/game.js', import.meta.url), 'utf8');
const players = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Bo' }];

test('kit: draw reshuffles the discard pile, lose never goes negative', () => {
  const rnd = makeRandom(1).api;
  const deck = ['x']; const discard = ['y', 'z'];
  assert.equal(T.draw(deck, discard, rnd, 3).length, 3);
  assert.equal(discard.length, 0);
  const have = { gold: 1 };
  assert.equal(T.lose(have, 'gold', 3), 1);
  assert.equal(have.gold, 0);
  assert.equal(T.pay({ gold: 1 }, { gold: 2 }), false);
});

test('random: same seed → same sequence; state continues the stream', () => {
  const a = makeRandom(42); const b = makeRandom(42);
  const xs = [a.api.float(), a.api.int(10)];
  assert.deepEqual(xs, [b.api.float(), b.api.int(10)]);
  const c = makeRandom(a.state());
  assert.equal(c.api.float(), a.api.float());
});

test('server and browser runtimes produce identical games', () => {
  for (const M of [GameModule, LocalGameModule]) assert.ok(new M(source).has('actions'));
  const run = (M) => {
    const mod = new M(source);
    let { state, rng } = mod.setup(players, 7, {}, 1000);
    for (let i = 0; i < 30 && !mod.endIf(state); i++) {
      const p = players.find((x) => (mod.actions(state, x) || []).length);
      const act = mod.actions(state, p)[0];
      ({ state, rng } = mod.move(state, act.name, { playerId: p.id, player: p, args: act.args, now: 1000 + i }, rng));
    }
    return JSON.stringify(state);
  };
  assert.equal(run(GameModule), run(LocalGameModule));
});

test('move errors and roll fx', () => {
  const mod = new GameModule(source);
  const { state, rng } = mod.setup(players, 3, {}, 0);
  assert.match(mod.move(state, 'roll', { playerId: 'b', player: players[1] }, rng).error, /not your turn/);
  assert.match(mod.move(state, 'nope', { playerId: 'a', player: players[0] }, rng).error, /Unknown move/);
  const r = mod.move(state, 'roll', { playerId: 'a', player: players[0] }, rng);
  assert.equal(r.fx[0].type, 'roll');
  assert.equal(r.fx[0].dice[0].id, 'die');
});

test('the vm sandbox does not leak host realm functions', () => {
  const escape = `module.exports = { setup: () => ({}), view: () => ({ type: 'col' }), moves: {
    probe() { try { return { out: T.roll.constructor('return typeof process')() }; } catch (e) { return { out: 'blocked' }; } } } };`;
  const mod = new GameModule(escape);
  const r = mod.move({}, 'probe', { playerId: 'a', player: players[0] }, 1);
  assert.equal(r.state.out, 'blocked');
});

test('referee: the example game is clean', () => {
  const rep = simulate(source, { games: 12 });
  assert.ok(rep.ok, JSON.stringify(rep));
  assert.equal(rep.finished, rep.games);
  assert.ok(validate(source).tabletop);
});

test('validate: setup always gets options.content (defaults to {})', () => {
  const src = `module.exports = { meta: { minPlayers: 2, maxPlayers: 2 }, setup: ({ options }) => ({ n: Object.keys(options.content).length, v: options.variant }),
    view: (s) => ({ type: 'col', children: [] }), moves: {} };`;
  assert.doesNotThrow(() => validate(src));
  assert.doesNotThrow(() => validate(src, { content: { a: 1 }, variant: 'x' }));
});

test('scene checks catch duplicates and unknown zones', () => {
  const errs = checkScene({ type: 'tabletop', scene: { zones: [{ id: 'z' }], objects: [{ id: 'x', kind: 'card', zone: 'z' }, { id: 'x', kind: 'card', zone: 'nope' }] } });
  assert.ok(errs.some((e) => e.includes('duplicate')));
  assert.ok(errs.some((e) => e.includes('unknown zone')));
});

test('match: lobby → bots play to the end; locale switch', () => {
  const m = new Match(new GameModule(source), { seed: 5 });
  m.join('me', { name: 'Me' });
  m.addBot(); m.addBot();
  assert.equal(m.players.length, 3);
  m.start();
  let guard = 0;
  while (m.status === 'playing' && guard++ < 500) {
    if (!m.nextBot()) { const a = m.mod.actions(m.state, m.player('me')).find((x) => !x.free); m.move('me', a.name, a.args); }
  }
  assert.equal(m.status, 'finished');
  assert.ok(m.result.winners.length);
  assert.throws(() => m.move('me', 'roll'), /not running/);
  configure({ locale: 'tr' });
  assert.throws(() => m.move('me', 'roll'), /Oyun aktif değil/);
  configure({ locale: 'en' });
});

test('pacing: fx stretch the bot delay; private fx are filtered', () => {
  assert.ok(botDelay('normal', [{ type: 'roll' }]) > botDelay('normal', []));
  assert.ok(botDelay('fast', []) < botDelay('slow', []));
  assert.deepEqual(visibleFx([{ type: 'toast', to: ['a'] }, { type: 'sound' }], 'b').map((e) => e.type), ['sound']);
});
