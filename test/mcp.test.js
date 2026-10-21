// The MCP server, driven by the official MCP SDK client over stdio (protocol conformance + tool behaviour).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const text = (r) => r.content.map((c) => c.text).join('\n');

const LEAKY = `module.exports = {
  meta: { name: 'Leaky', minPlayers: 2, maxPlayers: 2 },
  setup: ({ players }) => ({ players: players.map((p) => p.id), turn: 0, n: 0, log: [] }),
  moves: { pass(s, ctx) { if (s.players[s.turn] !== ctx.playerId) return { error: 'no' }; s.turn = 1 - s.turn; s.n++; s.log.push('pass'); return s; } },
  view: (s, { playerId }) => ({ type: 'tabletop', scene: {
    zones: [{ id: 'hand', seat: s.players[0], layout: 'fan' }],
    objects: [{ id: 'secret', kind: 'card', zone: 'hand', faceUp: playerId === s.players[0], face: { title: 'Ace' } }],
  }, hud: { log: s.log } }),
  endIf: (s) => (s.n >= 4 ? { winners: [s.players[0]] } : null),
  actions: (s, { playerId }) => (s.players[s.turn] === playerId ? [{ name: 'pass' }] : []),
};`;

test('MCP server: tools, resources, prompts over stdio', async () => {
  const client = new Client({ name: 'tablecraft-test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['src/cli.js', 'mcp'], cwd: root, stderr: 'ignore' }));
  try {
    assert.equal(client.getServerVersion().name, 'tablecraft');
    assert.match(client.getInstructions(), /simulate_game/);

    const { tools } = await client.listTools();
    for (const t of ['get_docs', 'get_template', 'validate_game', 'simulate_game', 'audit_views', 'start_match', 'get_state', 'play_move', 'run_bots', 'end_match']) {
      assert.ok(tools.find((x) => x.name === t), `missing tool ${t}`);
    }

    assert.match(text(await client.callTool({ name: 'get_docs', arguments: { topic: 'game-module' } })), /# Game module/);
    const tpl = text(await client.callTool({ name: 'get_template', arguments: { name: 'coin-flip-duel' } }));
    assert.match(tpl, /module\.exports/);

    const v = await client.callTool({ name: 'validate_game', arguments: { path: 'examples/treasure-road/game.js' } });
    assert.equal(v.isError, false);
    assert.equal(v.structuredContent.ok, true);
    const bad = await client.callTool({ name: 'validate_game', arguments: { source: 'module.exports = {}' } });
    assert.equal(bad.isError, true);

    const sim = await client.callTool({ name: 'simulate_game', arguments: { source: tpl, games: 40 } });
    assert.equal(sim.structuredContent.ok, true, text(sim));
    assert.equal(sim.structuredContent.finished, 40);

    const audit = await client.callTool({ name: 'audit_views', arguments: { source: LEAKY, games: 1 } });
    assert.ok(audit.structuredContent.findings.some((f) => f.code === 'leak_face_down'), text(audit));
    const clean = await client.callTool({ name: 'audit_views', arguments: { path: 'examples/treasure-road/game.js', games: 2 } });
    assert.equal(clean.structuredContent.findings.filter((f) => f.severity === 'error').length, 0, text(clean));

    // step through a match
    const start = await client.callTool({ name: 'start_match', arguments: { path: 'examples/coin-flip-duel/game.js', players: ['Ada', 'Bo'] } });
    const id = start.structuredContent.match;
    assert.deepEqual(start.structuredContent.players[0].actions, [{ name: 'roll' }]);
    const view = text(await client.callTool({ name: 'get_state', arguments: { matchId: id, playerId: 'p1' } }));
    assert.match(view, /die: die/);
    assert.match(view, /click→roll/);
    const wrong = await client.callTool({ name: 'play_move', arguments: { matchId: id, playerId: 'p2', name: 'roll' } });
    assert.equal(wrong.isError, true);
    assert.match(text(wrong), /Not your turn/);
    const ok = await client.callTool({ name: 'play_move', arguments: { matchId: id, playerId: 'p1', name: 'roll' } });
    assert.equal(ok.structuredContent.fx[0].type, 'roll');
    const ff = await client.callTool({ name: 'run_bots', arguments: { matchId: id, moves: 200 } });
    assert.equal(ff.structuredContent.status, 'finished');
    assert.ok((await client.callTool({ name: 'end_match', arguments: { matchId: id } })).content[0].text.includes('ended'));

    const { resources } = await client.listResources();
    assert.ok(resources.find((r) => r.uri === 'tablecraft://docs/scene'));
    const res = await client.readResource({ uri: 'tablecraft://examples/treasure-road' });
    assert.match(res.contents[0].text, /Treasure Road/);

    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name).sort(), ['fix_referee_report', 'new_game']);
    const p = await client.getPrompt({ name: 'new_game', arguments: { idea: 'A pirate trading game' } });
    assert.match(p.messages[0].content.text, /pirate trading/);
  } finally {
    await client.close();
  }
});
