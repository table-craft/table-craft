// tablecraft/mcp — Model Context Protocol server that lets AI assistants write, check and debug Tablecraft games.
//
//   npx tablecraft mcp            (stdio; add it to Claude Code / Claude Desktop / any MCP client)
import { McpServer } from './protocol.js';
import {
  TEMPLATES, docList, readDoc, readTemplate, readSource, readContent, json, summarizeView, auditViews,
  startMatch, getMatch, endMatch, overview, stepBots, playMove, summarize, validateModule, simulateAsync, GameModule,
  analyzeBalanceAsync, compareReports, sweepPoint, BOT_PROFILES,
} from './tools.js';
import { createRequire } from 'node:module';

const { version: VERSION } = createRequire(import.meta.url)('../../package.json');

const GAME_INPUT = {
  source: { type: 'string', description: 'The game module source (CommonJS-style script that assigns module.exports).' },
  path: { type: 'string', description: 'Path to the game module file (relative to the working directory). Used when `source` is not given.' },
  content: { type: 'object', description: 'Game data passed to setup() as options.content (cards, maps…).' },
  contentPath: { type: 'string', description: 'Path to a JSON file used as options.content.' },
};
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const INSTRUCTIONS = `Tablecraft turns one JavaScript module into a server-authoritative 3D tabletop game (cards, decks, physics dice,
tokens, hidden information, bots, a referee). Typical workflow when writing or fixing a game:
1. get_docs (topic "game-module", then "scene"/"hud" as needed) and get_template to start from a working example.
2. Write the module, then validate_game until it passes.
3. simulate_game (the referee plays many bot games) and fix every error, rejected action, stuck game and invariant violation.
4. audit_views to catch hidden-information leaks and things that make the table hard to follow.
5. analyze_balance to measure first-player/seat advantage, game length, forced decisions, comebacks and dominant
   strategies (export score() for greedy bots and lead metrics); sweep_parameter to compare candidate numbers.
6. To debug a specific situation, start_match → get_state / play_move / run_bots step by step.`;

export function createTablecraftMcp() {
  const s = new McpServer({ name: 'tablecraft', version: VERSION, instructions: INSTRUCTIONS });

  // ---------------------------------------------------------------- docs & templates
  const topics = docList().map((d) => d.slug);
  s.tool('get_docs', {
    title: 'Read Tablecraft docs',
    description: `Returns a Tablecraft documentation page as markdown. Without a topic returns the index with a cheat sheet. Start with "game-module" before writing a game; "scene" covers zones/objects/faces, "hud" the 2D overlay, "fx" effects, "rules-kit" the global T helpers, "testing" bots and the referee, "following-the-game" Spotlight/log conventions. Topics: ${topics.join(', ')}.`,
    inputSchema: { properties: { topic: { type: 'string', enum: topics, description: 'Documentation page.' } } },
    annotations: READ_ONLY,
  }, ({ topic }) => readDoc(topic || 'index'));

  s.tool('get_template', {
    title: 'Get a starter game',
    description: `Returns the source of a complete, referee-clean example game to start from. ${Object.entries(TEMPLATES).map(([k, t]) => `"${k}": ${t.about}`).join(' ')}`,
    inputSchema: { properties: { name: { type: 'string', enum: Object.keys(TEMPLATES), default: 'coin-flip-duel' } } },
    annotations: READ_ONLY,
  }, ({ name = 'coin-flip-duel' }) => readTemplate(name));

  for (const d of docList()) {
    s.resource(`tablecraft://docs/${d.slug}`, { name: `docs/${d.slug}`, title: d.title, description: `Tablecraft docs: ${d.title}` }, () => readDoc(d.slug));
  }
  for (const [k, t] of Object.entries(TEMPLATES)) {
    s.resource(`tablecraft://examples/${k}`, { name: `examples/${k}`, title: `Example game: ${k}`, description: t.about, mimeType: 'text/javascript' }, () => readTemplate(k));
  }

  // ---------------------------------------------------------------- checks
  s.tool('validate_game', {
    title: 'Validate a game module',
    description: 'Loads the module in the sandboxed runtime, runs setup() for a typical player count, renders every player\'s view and checks the scene (duplicate ids, unknown zones, bad enterFrom/anchor). If actions() is exported, also runs a short referee pass. Use after every edit; returns the first problem with a readable message.',
    inputSchema: { properties: { ...GAME_INPUT, requireActions: { type: 'boolean', description: 'Fail when actions() is not exported (bots and the referee need it).' } } },
    annotations: READ_ONLY,
  }, (a) => {
    const source = readSource(a);
    try {
      const info = validateModule(new GameModule(source), { content: readContent(a), requireActions: !!a.requireActions, games: 6, timeLimitMs: 20000 });
      return { text: `✓ valid — ${info.meta.name || 'game'} (${info.tabletop ? '3D tabletop' : '2D view'}, ${info.players} test players${info.referee ? `, referee ${info.referee.finished}/${info.referee.games} games finished` : ''})`, data: { ok: true, ...info } };
    } catch (e) {
      return { text: `✗ ${e.message}`, data: { ok: false, error: e.message }, isError: true };
    }
  });

  s.tool('simulate_game', {
    title: 'Run the referee',
    description: 'The referee plays many complete games with bots and reports module errors, moves that actions() offered but move() rejected, stuck states (nobody can move but the game has not ended), invariant violations and broken views — each with game, move, player, phase and args so you can reproduce it. Needs actions(). Fix the rules or actions() until ok is true; never hide legal moves just to pass.',
    inputSchema: {
      properties: {
        ...GAME_INPUT,
        games: { type: 'integer', minimum: 1, maximum: 500, default: 60 },
        players: { type: 'integer', minimum: 1, description: 'Fixed player count (default: cycles minPlayers…maxPlayers).' },
        botMode: { type: 'string', enum: ['mixed', 'module', 'random'], default: 'mixed', description: '"module" uses your bot(), "random" picks any action (widest coverage), "mixed" alternates.' },
        seed: { type: 'integer', default: 1 },
        variant: { type: 'string' },
      },
    },
    annotations: READ_ONLY,
  }, async (a) => {
    const source = readSource(a);
    const rep = await simulateAsync(source, { games: a.games || 60, players: a.players, botMode: a.botMode || 'mixed', seed: a.seed || 1, variant: a.variant, content: readContent(a), timeLimitMs: 60000 });
    const data = { ok: rep.ok, games: rep.games, finished: rep.finished, stuck: rep.stuck, capped: rep.capped, avgMoves: rep.avgMoves, errors: rep.errors, rejected: rep.rejected, stuckAt: rep.stuckAt, invariants: rep.invariants, views: rep.views, winsBySeat: rep.winsBySeat, byPlayers: rep.byPlayers, timedOut: rep.timedOut };
    return { text: `${rep.ok ? '✓ referee clean' : '✗ referee found problems'}\n${rep.summary || summarize(rep)}`, data, isError: false };
  });

  s.tool('audit_views', {
    title: 'Audit views for leaks and readability',
    description: 'Plays a few bot games and inspects every player\'s view after every move. Errors: face data sent for face-down cards (a hidden-information leak), scene errors, rejected actions, stuck states. Warnings: an opponent\'s hand shown face-up, missing hud.log. Info: centre zones without a label, log lines that name no player (the Spotlight cannot attribute those moves), no active player. Needs actions().',
    inputSchema: { properties: { ...GAME_INPUT, games: { type: 'integer', minimum: 1, maximum: 20, default: 3 }, players: { type: 'integer', minimum: 1 }, seed: { type: 'integer', default: 1 } } },
    annotations: READ_ONLY,
  }, (a) => {
    const r = auditViews(readSource(a), { games: a.games || 3, players: a.players, seed: a.seed || 1, content: readContent(a) });
    const icon = { error: '✗', warn: '!', info: '·' };
    const lines = r.findings.map((f) => `${icon[f.severity]} [${f.severity}] ${f.message}${f.count > 1 ? ` (×${f.count})` : ''}${f.first?.game != null ? ` — first at game ${f.first.game}, move ${f.first.move}${f.first.viewer ? `, viewer ${f.first.viewer}` : ''}` : ''}`);
    const errors = r.findings.filter((f) => f.severity === 'error').length;
    return { text: `${errors ? '✗' : '✓'} ${r.views} views checked in ${r.games} games — ${r.findings.length ? `${r.findings.length} finding(s)` : 'no findings'}\n${lines.join('\n')}`, data: r };
  });

  // ---------------------------------------------------------------- balance lab
  const pctx = (x) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`);
  const balanceText = (r) => [
    `${r.finished}/${r.games} games finished · length avg ${r.length.avgMoves} (median ${r.length.medianMoves}, p90 ${r.length.p90Moves})`,
    `first-player advantage ${r.firstPlayerAdvantage == null ? '—' : `${r.firstPlayerAdvantage > 0 ? '+' : ''}${pctx(r.firstPlayerAdvantage)} (±${pctx(r.firstPlayerAdvantageSE)})`} · ties ${pctx(r.tieRate)}`,
    `decisions: ${r.decisions.avgChoices} options on average, ${pctx(r.decisions.forcedRate)} forced`,
    r.leadChanges != null ? `tension: ${r.leadChanges} lead changes per game, comebacks ${pctx(r.comebackRate)}` : 'tension: — (export score() to measure lead changes and comebacks)',
    r.strategies ? `bot profiles: ${Object.entries(r.strategies).map(([k, v]) => `${k} ${pctx(v)}`).join(', ')}` : '',
    ...Object.entries(r.byPlayers).map(([n, b]) => `${n} players: seats ${Object.values(b.seatWinRate).map(pctx).join(' / ')}, avg ${b.avgMoves} moves`),
    ...(r.warnings.length ? ['', ...r.warnings.map((w) => `${w.severity === 'warn' ? '!' : '·'} [${w.severity}] ${w.message}`)] : ['', 'no balance warnings']),
  ].filter((x) => x !== '').join('\n');
  const BALANCE_OPTS = {
    games: { type: 'integer', minimum: 10, maximum: 2000, default: 200 },
    players: { type: 'integer', minimum: 1, description: 'Fixed player count (default: cycles minPlayers…maxPlayers).' },
    botMix: { type: 'array', items: { type: 'string', enum: BOT_PROFILES }, default: ['module'], description: 'Bot profiles assigned round-robin to seats (rotating each game): "module" = your bot(), "random", "greedy" = one-move lookahead on score(). Use two profiles to detect dominant strategies.' },
    seed: { type: 'integer', default: 1 },
    variant: { type: 'string' },
    options: { type: 'object', description: 'Extra setup options.' },
  };

  s.tool('analyze_balance', {
    title: 'Measure balance',
    description: 'The balance lab plays many complete games with bot profiles and measures what the referee does not: win rate by seat and first-player advantage (with a standard error so small samples do not cry wolf), game length distribution, how often a player has only one option, tie rate, lead changes and comebacks (needs a score() export), and win rates per bot profile. Warnings flag first-player advantage, seat imbalance, forced decisions, long-tailed games and dominant strategies. Run after the referee is clean; compare runs before/after a rule change.',
    inputSchema: { properties: { ...GAME_INPUT, ...BALANCE_OPTS } },
    annotations: READ_ONLY,
  }, async (a) => {
    const r = await analyzeBalanceAsync(readSource(a), { games: a.games || 200, players: a.players, botMix: a.botMix || ['module'], seed: a.seed || 1, variant: a.variant, options: a.options || {}, content: readContent(a), timeLimitMs: 90000 });
    return { text: balanceText(r), data: r };
  });

  s.tool('sweep_parameter', {
    title: 'Sweep a parameter',
    description: 'Runs the balance lab once per candidate value of one number in the game data or setup options (path like "content.cards.0.count" or "options.target"), everything else equal, and returns a comparison table plus the metric deltas between the first and last value. Use it to choose costs, counts and targets with evidence.',
    inputSchema: { properties: { ...GAME_INPUT, ...BALANCE_OPTS, path: { type: 'string', description: 'Dotted path starting with "content." or "options.".' }, values: { type: 'array', minItems: 2, maxItems: 8, description: 'Candidate values.' } }, required: ['path', 'values'] },
    annotations: READ_ONLY,
  }, async (a) => {
    const source = readSource(a);
    const base = { games: a.games || 200, players: a.players, botMix: a.botMix || ['module'], seed: a.seed || 1, variant: a.variant, options: a.options || {}, content: readContent(a), timeLimitMs: 90000 };
    const runs = [];
    for (const value of a.values) runs.push({ value, report: await analyzeBalanceAsync(source, sweepPoint(base, a.path, value)) });
    const rows = runs.map(({ value, report: r }) => `| ${JSON.stringify(value)} | ${pctx(r.firstPlayerAdvantage)} | ${r.length.avgMoves} | ${r.length.p90Moves} | ${pctx(r.decisions.forcedRate)} | ${pctx(r.tieRate)} | ${pctx(r.comebackRate)} | ${r.warnings.filter((w) => w.severity === 'warn').map((w) => w.code).join(', ') || '—'} |`);
    const deltas = compareReports(runs[0].report, runs[runs.length - 1].report).filter((d) => d.delta);
    return {
      text: [`Sweep ${a.path}`, '', '| value | first-player adv. | avg moves | p90 | forced | ties | comebacks | warnings |', '|---|---|---|---|---|---|---|---|', ...rows,
        '', `Changes from ${JSON.stringify(a.values[0])} to ${JSON.stringify(a.values[a.values.length - 1])}: ${deltas.map((d) => `${d.metric} ${d.before} → ${d.after}`).join('; ') || 'none'}`].join('\n'),
      data: { path: a.path, runs, deltas },
    };
  });

  // ---------------------------------------------------------------- step-through matches
  s.tool('start_match', {
    title: 'Start a debug match',
    description: 'Starts an in-memory match you can drive move by move (players get ids p1, p2, …). Returns a match id plus every player\'s legal actions. Use get_state to see a player\'s table, play_move to act as any player and run_bots to fast-forward.',
    inputSchema: { properties: { ...GAME_INPUT, players: { description: 'Player count or list of names.', oneOf: [{ type: 'integer', minimum: 1 }, { type: 'array', items: { type: 'string' } }], default: 2 }, seed: { type: 'integer', default: 7 }, variant: { type: 'string' } } },
  }, (a) => {
    const id = startMatch(readSource(a), { players: a.players || 2, seed: a.seed ?? 7, content: readContent(a), variant: a.variant });
    const o = overview(id);
    return { text: `Match ${id} started.\n${json(o)}`, data: o };
  });

  s.tool('get_state', {
    title: 'Inspect a debug match',
    description: 'Without playerId: status, result, every player\'s legal actions and the last log lines. With playerId: a text rendering of exactly what that player sees (zones, objects, face-down cards, clickable objects, HUD prompt, log) — use it to check hidden information and what a move changed. Set raw=true to also get the full view JSON.',
    inputSchema: { properties: { matchId: { type: 'string' }, playerId: { type: 'string' }, raw: { type: 'boolean' } }, required: ['matchId'] },
    annotations: READ_ONLY,
  }, ({ matchId, playerId, raw }) => {
    if (!playerId) { const o = overview(matchId); return { text: json(o), data: o }; }
    const { m } = getMatch(matchId);
    const { view, error } = m.view(playerId);
    if (error) return { text: `view() threw for ${playerId}: ${error}`, isError: true };
    const sum = summarizeView(view);
    return { text: `${sum.text}${raw ? `\n\n${json(view)}` : ''}`, data: raw ? { view } : undefined };
  });

  s.tool('play_move', {
    title: 'Play a move in a debug match',
    description: 'Applies a move as the given player (the same path a real client takes). Returns the fx it produced and the updated actions, or the move\'s error message when it is rejected.',
    inputSchema: { properties: { matchId: { type: 'string' }, playerId: { type: 'string' }, name: { type: 'string' }, args: { type: 'object' } }, required: ['matchId', 'playerId', 'name'] },
  }, ({ matchId, playerId, name, args }) => {
    try {
      const fx = playMove(matchId, playerId, name, args || {});
      const o = overview(matchId);
      return { text: `✓ ${playerId} ${name}\nfx: ${fx.map((e) => e.type + (e.text ? ` "${e.text}"` : '')).join(', ') || 'none'}\n${json(o)}`, data: { ok: true, fx, ...o } };
    } catch (e) {
      return { text: `✗ rejected: ${e.message}`, data: { ok: false, error: e.message }, isError: true };
    }
  });

  s.tool('run_bots', {
    title: 'Fast-forward a debug match',
    description: 'Lets bots play for every player (and lets sand timers expire) for up to `moves` moves. Stops early when the game ends, when nobody can move (stuck — a bug), or when `untilPlayer` has a legal move so you can take over.',
    inputSchema: { properties: { matchId: { type: 'string' }, moves: { type: 'integer', minimum: 1, maximum: 2000, default: 20 }, untilPlayer: { type: 'string' } }, required: ['matchId'] },
  }, ({ matchId, moves = 20, untilPlayer }) => {
    const played = []; let stop = '';
    for (let i = 0; i < moves; i++) {
      let r;
      try { r = stepBots(matchId, { stopFor: untilPlayer }); } catch (e) { stop = `module error: ${e.message}`; break; }
      if (!r) { stop = 'game over'; break; }
      if (r.stop) { stop = `${untilPlayer} can move`; break; }
      if (r.stuck) { stop = 'STUCK: nobody can move and the game has not ended'; break; }
      played.push(`${r.player} ${r.name}${r.args && Object.keys(r.args).length ? ` ${JSON.stringify(r.args)}` : ''}${r.timer ? ' (timer)' : ''}`);
    }
    const o = overview(matchId);
    return { text: `${played.length} move(s)${stop ? ` — stopped: ${stop}` : ''}\n${played.join('\n')}\n${json(o)}`, data: { played, stop, ...o } };
  });

  s.tool('end_match', {
    title: 'End a debug match',
    description: 'Frees a debug match.',
    inputSchema: { properties: { matchId: { type: 'string' } }, required: ['matchId'] },
    annotations: { idempotentHint: true },
  }, ({ matchId }) => (endMatch(matchId) ? `Match ${matchId} ended.` : `No match ${matchId}.`));

  // ---------------------------------------------------------------- prompts
  s.prompt('new_game', {
    title: 'Write a new Tablecraft game',
    description: 'Guided workflow: from a game idea to a referee-clean, followable Tablecraft module.',
    arguments: [
      { name: 'idea', description: 'The game: theme, core mechanic, how you win.', required: true },
      { name: 'players', description: 'Player count, e.g. "2-4".' },
      { name: 'file', description: 'Where to save the module, e.g. games/my-game.js.' },
    ],
  }, ({ idea, players, file }) => `Write a Tablecraft game module for this idea:

${idea}
${players ? `\nPlayers: ${players}` : ''}

Work in this order:
1. Read the docs with get_docs: "game-module" first, then "scene" and "hud". Get the "treasure-road" template as a reference.
2. Write the complete module${file ? ` to ${file}` : ''}: plain-JSON state, all randomness via ctx.random/ctx.roll, every move validates turn/phase/ownership/args and returns { error } instead of throwing, per-player view() that never contains another player's secrets, stable object ids, labelled centre zones, one hud.log line per action naming the player (and the card's title).
3. Export actions() (every legal move with concrete args), bot() and invariants().
4. Run validate_game, then simulate_game with at least 100 games, then audit_views. Fix every finding at its root cause and re-run until all three are clean.
5. Summarise the rules you implemented and anything you assumed.`);

  s.prompt('fix_referee_report', {
    title: 'Fix a referee report',
    description: 'Turn a failing simulate_game / audit_views report into fixes.',
    arguments: [
      { name: 'report', description: 'The referee or audit output.', required: true },
      { name: 'file', description: 'Path of the game module.' },
    ],
  }, ({ report, file }) => `The Tablecraft referee reported problems${file ? ` in ${file}` : ''}:

${report}

For each problem: reproduce it (start_match with the same seed/player count, then run_bots / play_move to the reported move and get_state), find the root cause in the rules, actions() or view(), and fix it. Never hide a legal move from actions() to make the referee pass, and never weaken invariants(). Re-run simulate_game and audit_views until both are clean, then list what you changed.`);

  return s;
}

export function startStdio() {
  createTablecraftMcp().listen();
}
