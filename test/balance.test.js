import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeBalance, analyzeBalanceAsync, sweepParameter, compareReports, audit } from '../src/server/index.js';
import { LocalGameModule } from '../src/client/local-module.js';
import { analyzeBalance as coreAnalyze } from '../src/core/balance.js';

const read = (f) => fs.readFileSync(new URL(`../examples/${f}/game.js`, import.meta.url), 'utf8');
const duel = read('coin-flip-duel');
const road = read('treasure-road');

// race to `target` (setup option): +1 or +3 per turn; the module's bot always takes +1, so greedy (score-driven) wins
const RACE = `module.exports = {
  meta: { name: 'Race', minPlayers: 2, maxPlayers: 2 },
  setup: ({ players, options }) => ({ ids: players.map((p) => p.id), pos: [0, 0], turn: 0, target: options.target || 12, log: [] }),
  moves: {
    step(s, ctx) {
      const i = s.ids.indexOf(ctx.playerId);
      if (i !== s.turn) return { error: 'Not your turn' };
      s.pos[i] += ctx.args.n === 3 ? 3 : 1;
      s.turn = 1 - s.turn;
      return s;
    },
  },
  view: (s) => ({ type: 'tabletop', scene: { objects: [] }, hud: { log: s.log } }),
  endIf: (s) => { const w = s.pos.findIndex((p) => p >= s.target); return w >= 0 ? { winners: [s.ids[w]] } : null; },
  actions: (s, { playerId }) => (s.ids[s.turn] === playerId ? [{ name: 'step', args: { n: 1 } }, { name: 'step', args: { n: 3 } }] : []),
  bot: (s, { actions }) => actions[0],
  score: (s, { playerId }) => { const i = s.ids.indexOf(playerId); return s.pos[i] - s.pos[1 - i]; },
};`;

test('balance report: contract fields, determinism, first-player advantage', () => {
  const a = analyzeBalance(duel, { games: 200, players: 2 });
  const b = analyzeBalance(duel, { games: 200, players: 2 });
  assert.deepEqual(a, b, 'same seed → same report');
  for (const k of ['games', 'finished', 'timedOut', 'length', 'seatWinRate', 'firstPlayerAdvantage', 'tieRate', 'decisions', 'leadChanges', 'comebackRate', 'strategies', 'byPlayers', 'warnings']) assert.ok(k in a, `missing ${k}`);
  for (const k of ['avgMoves', 'medianMoves', 'p10Moves', 'p90Moves']) assert.ok(k in a.length);
  assert.equal(a.finished, 200);
  assert.ok(a.firstPlayerAdvantage > 0.08, `alternating race favours the first roller (${a.firstPlayerAdvantage})`);
  assert.ok(a.warnings.some((w) => w.code === 'first_player_advantage' && w.severity === 'warn'));
  assert.equal(a.decisions.forcedRate, 1); // rolling is the only move
  assert.ok(a.warnings.some((w) => w.code === 'forced_decisions'));
  assert.ok(a.leadChanges != null && a.comebackRate != null, 'score() enables tension metrics');
  assert.ok(Math.abs(a.seatWinRate[0] + a.seatWinRate[1] - 1) < 1e-9);
});

test('treasure road: every player count, seat rates per count', () => {
  const r = analyzeBalance(road, { games: 80 });
  assert.equal(r.finished, r.games);
  assert.deepEqual(Object.keys(r.byPlayers).sort(), ['1', '2', '3', '4']);
  assert.equal(r.byPlayers[1].firstPlayerAdvantage, null); // solo has no seat order
  for (const [n, b] of Object.entries(r.byPlayers)) assert.equal(Object.keys(b.seatWinRate).length, Number(n));
});

test('greedy bot uses score() and exposes a dominant strategy', () => {
  const r = analyzeBalance(RACE, { games: 200, botMix: ['module', 'greedy'] });
  assert.ok(r.strategies.greedy > 0.9, JSON.stringify(r.strategies));
  assert.ok(r.warnings.some((w) => w.code === 'dominant_strategy'));
  assert.ok(!r.warnings.some((w) => w.code === 'seat_imbalance'), 'seat warnings are skipped with mixed profiles');
  assert.throws(() => analyzeBalance(RACE, { botMix: ['clever'] }), /Unknown bot profile/);
});

test('sweep: changing a setup option moves the metrics; compareReports shows the deltas', () => {
  const runs = sweepParameter(RACE, { path: 'options.target', values: [6, 30], games: 60 });
  assert.equal(runs.length, 2);
  assert.ok(runs[1].report.length.avgMoves > runs[0].report.length.avgMoves * 3);
  const deltas = compareReports(runs[0].report, runs[1].report);
  const len = deltas.find((d) => d.metric === 'length.avgMoves');
  assert.ok(len.delta > 0 && len.before === runs[0].report.length.avgMoves);
  assert.ok(deltas.some((d) => d.metric === 'seatWinRate.0'));
  assert.throws(() => sweepParameter(RACE, { path: 'target', values: [1] }), /content\.|options\./);
});

test('isomorphic: browser runtime and worker thread give the same report', async () => {
  const server = analyzeBalance(road, { games: 40, players: 3 });
  assert.deepEqual(coreAnalyze(new LocalGameModule(road), { games: 40, players: 3 }), server);
  assert.deepEqual(await analyzeBalanceAsync(road, { games: 40, players: 3 }), server);
});

test('audit export: loaded module or source', () => {
  const r = audit(road, { games: 1 });
  assert.equal(r.findings.filter((f) => f.severity === 'error').length, 0);
  assert.ok(r.views > 0);
});

test('MCP: analyze_balance and sweep_parameter', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client = new Client({ name: 'balance-test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/cli.js', 'mcp'], cwd: new URL('..', import.meta.url).pathname, stderr: 'ignore' }));
  try {
    const r = await client.callTool({ name: 'analyze_balance', arguments: { path: 'examples/coin-flip-duel/game.js', games: 100, players: 2 } });
    assert.equal(r.isError, false);
    assert.equal(r.structuredContent.finished, 100);
    assert.match(r.content[0].text, /first-player advantage/);
    const s = await client.callTool({ name: 'sweep_parameter', arguments: { source: RACE, path: 'options.target', values: [6, 20], games: 40 } });
    assert.equal(s.structuredContent.runs.length, 2);
    assert.match(s.content[0].text, /\| 6 \|/);
    assert.match((await client.callTool({ name: 'get_docs', arguments: { topic: 'balance' } })).content[0].text, /# Balance lab/);
  } finally { await client.close(); }
});
