// Deterministic replays: record a match, replay it, the states must be identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameModule, Match } from '../src/server/index.js';
import { LocalGameModule } from '../src/client/local-module.js';
import { replayMatch, describeMove } from '../src/core/replay.js';
import { createReplay } from '../src/client/replay.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// plays a match with bots on a controlled clock; returns what a host would have recorded
function record(source, { seed, players = 2, steps = 400, timeoutEvery = 0 }) {
  let now = 1_700_000_000_000;
  const m = new Match(new GameModule(source), { seed, clock: () => now });
  for (let i = 0; i < players; i++) m.join(`p${i + 1}`, { name: `P${i + 1}` });
  const startedAt = now;
  m.start();
  for (let i = 0; i < steps && m.status === 'playing'; i++) {
    now += 1500;
    const d = m.deadline();
    if (timeoutEvery && d && i % timeoutEvery === timeoutEvery - 1) { now = Math.max(now, d.at); m.applyDeadline(); continue; }
    const p = m.players.find((x) => (m.mod.actions(m.state, x) || []).some((a) => !a.free));
    if (!p) { if (d) { now = Math.max(now, d.at); m.applyDeadline(); continue; } break; }
    const other = m.players.find((x) => x !== p);
    if (i === 1 && other) { try { m.move(other.id, 'roll', {}); } catch { /* recorded as a rejected move */ } }
    const a = m.mod.actions(m.state, p).find((x) => !x.free);
    m.move(p.id, a.name, a.args || {});
  }
  return { seed, players: m.players, moves: m.moves, startedAt, final: m.state, status: m.status, result: m.result };
}

for (const game of ['examples/treasure-road/game.js', 'examples/coin-flip-duel/game.js']) {
  test(`replay reproduces every state: ${game}`, () => {
    const src = read(game);
    const rec = record(src, { seed: 42, players: 2, timeoutEvery: game.includes('treasure') ? 7 : 0 });
    assert.ok(rec.moves.some((m) => m.error), 'the recording contains a rejected move');
    if (game.includes('treasure')) assert.ok(rec.moves.some((m) => m.name === 'endTurn' && m.args?.timeout), 'the recording contains a sand-timer move');
    for (const M of [GameModule, LocalGameModule]) {
      const r = replayMatch(new M(src), { seed: rec.seed, players: rec.players, moves: rec.moves, startedAt: rec.startedAt });
      assert.equal(r.ok, true, r.error);
      assert.equal(r.frames.length, rec.moves.length + 1);
      assert.deepEqual(r.frames.at(-1).state, rec.final);
      assert.ok(r.frames.filter((f) => f.rejected).length === rec.moves.filter((m) => m.error).length);
      if (rec.status === 'finished') assert.deepEqual(r.frames.at(-1).result, rec.result);
    }
  });
}

test('replay detects divergence (different seed)', () => {
  const src = read('examples/treasure-road/game.js');
  const rec = record(src, { seed: 3 });
  const r = replayMatch(new GameModule(src), { seed: 4, players: rec.players, moves: rec.moves, startedAt: rec.startedAt });
  assert.notDeepEqual(r.frames.at(-1).state, rec.final);
});

test('createReplay: snapshots, stepping, viewers and fx', () => {
  const src = read('examples/treasure-road/game.js');
  const rec = record(src, { seed: 9 });
  const rp = createReplay({ source: src, seed: rec.seed, players: rec.players, moves: rec.moves, startedAt: rec.startedAt, viewer: 'p1' });
  let snap = rp.getSnapshot();
  assert.equal(snap.index, 0);
  assert.equal(snap.view.type, 'tabletop');
  assert.ok(snap.fx.list.some((e) => e.type === 'banner'), 'setup fx are shown on the first frame');
  const roll = rec.moves.findIndex((m) => m.name === 'roll' && !m.error);
  rp.seek(roll); rp.step(1);
  snap = rp.getSnapshot();
  assert.equal(snap.index, roll + 1);
  assert.equal(snap.fx.list[0].type, 'roll');
  assert.match(snap.frame.label, /roll/);
  rp.step(-1);
  assert.equal(rp.getSnapshot().fx, null, 'stepping back plays no fx');
  // hidden information follows the viewer
  rp.seek(rp.length - 1);
  const handOf = (v, owner) => v.scene.objects.filter((o) => o.zone === `hand:${owner}`);
  rp.setViewer('p2');
  assert.ok(handOf(rp.getSnapshot().view, 'p1').every((o) => o.face === undefined));
  rp.setViewer('spectator');
  assert.equal(rp.getSnapshot().you, null);
  assert.ok(rp.timeline.some((t) => t.rejected));
  assert.equal(describeMove({ playerId: 'p1', name: 'play', args: { card: 'x' } }, rec.players), 'P1 · play {"card":"x"}');
  rp.dispose();
});
