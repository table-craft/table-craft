#!/usr/bin/env node
// tablecraft CLI
//   tablecraft mcp                         MCP server on stdio (for Claude Code, Claude Desktop, any MCP client)
//   tablecraft validate <game.js>          setup + views + scene checks (+ a short referee pass)
//   tablecraft simulate <game.js> [--games 200] [--players 3] [--bot mixed|module|random] [--seed 1]
//   tablecraft audit <game.js> [--games 3]  hidden-information and readability audit
//   tablecraft balance <game.js> [--games 200] [--players 2] [--bots module,greedy] [--sweep content.cards.0.n=1,2,3]
//   common: [--content data.json] [--locale tr]
import { readSource, readContent, auditViews, validateModule, GameModule } from './mcp/tools.js';
import { simulate, summarize, configure, analyzeBalance, sweepParameter, compareReports } from './server/index.js';

const [cmd, file, ...rest] = process.argv.slice(2);
const opt = (name, def) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : def; };
const num = (name, def) => (opt(name) != null ? Number(opt(name)) : def);
if (opt('locale')) configure({ locale: opt('locale') });

async function main() {
  if (cmd === 'mcp') { (await import('./mcp/index.js')).startStdio(); return; }
  if (!['validate', 'simulate', 'audit', 'balance'].includes(cmd) || !file) {
    console.log('Usage: tablecraft mcp | validate <game.js> | simulate <game.js> [--games N] [--players N] [--bot mode] | audit <game.js>\n       | balance <game.js> [--games N] [--players N] [--bots module,greedy] [--sweep path=v1,v2]\n       [--content data.json] [--locale tr]');
    process.exit(cmd ? 1 : 0);
  }
  const source = readSource({ path: file });
  const content = readContent({ contentPath: opt('content') });
  if (cmd === 'validate') {
    const info = validateModule(new GameModule(source), { content });
    console.log(`✓ valid — ${info.meta.name || 'game'}${info.referee ? ` · referee ${info.referee.finished}/${info.referee.games}` : ''}`);
  } else if (cmd === 'simulate') {
    const rep = simulate(source, { games: num('games', 100), players: num('players'), botMode: opt('bot', 'mixed'), seed: num('seed', 1), content });
    console.log(summarize(rep));
    process.exit(rep.ok ? 0 : 1);
  } else if (cmd === 'balance') {
    const opts = { games: num('games', 200), players: num('players'), botMix: (opt('bots') || 'module').split(','), seed: num('seed', 1), content };
    const sweep = opt('sweep');
    if (sweep) {
      const [path, list] = sweep.split('=');
      const values = list.split(',').map((v) => { try { return JSON.parse(v); } catch { return v; } });
      const runs = sweepParameter(source, { ...opts, path, values });
      console.log(`Sweep ${path}\n`);
      console.log(table(['value', 'first-player adv.', 'avg moves', 'p90 moves', 'forced', 'ties', 'comebacks', 'warnings'],
        runs.map(({ value, report: r }) => [JSON.stringify(value), pct(r.firstPlayerAdvantage), r.length.avgMoves, r.length.p90Moves, pct(r.decisions.forcedRate), pct(r.tieRate), pct(r.comebackRate), r.warnings.filter((w) => w.severity === 'warn').length])));
      if (runs.length > 1) for (const d of compareReports(runs[0].report, runs[runs.length - 1].report).filter((x) => x.delta)) console.log(`  ${d.metric}: ${d.before} → ${d.after} (${d.delta > 0 ? '+' : ''}${d.delta})`);
      return;
    }
    printBalance(analyzeBalance(source, opts));
  } else {
    const r = auditViews(source, { games: num('games', 3), players: num('players'), content });
    for (const f of r.findings) console.log(`[${f.severity}] ${f.message}${f.count > 1 ? ` (×${f.count})` : ''}`);
    console.log(`${r.views} views · ${r.findings.length} finding(s)`);
    process.exit(r.findings.some((f) => f.severity === 'error') ? 1 : 0);
  }
}
const pct = (x) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`);
function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ');
  return [line(head), w.map((x) => '─'.repeat(x)).join('  '), ...rows.map(line)].join('\n');
}
function printBalance(r) {
  console.log(`${r.finished}/${r.games} games finished${r.timedOut ? ' (time limit)' : ''}`);
  console.log(`length        avg ${r.length.avgMoves} · median ${r.length.medianMoves} · p10 ${r.length.p10Moves} · p90 ${r.length.p90Moves} moves`);
  console.log(`first player  ${r.firstPlayerAdvantage == null ? '—' : `${r.firstPlayerAdvantage > 0 ? '+' : ''}${pct(r.firstPlayerAdvantage)} vs fair share (±${pct(r.firstPlayerAdvantageSE)})`}`);
  console.log(`decisions     ${r.decisions.avgChoices} options on average · ${pct(r.decisions.forcedRate)} forced · ties ${pct(r.tieRate)}`);
  if (r.leadChanges != null) console.log(`tension       ${r.leadChanges} lead changes per game · comebacks ${pct(r.comebackRate)}`);
  if (r.strategies) console.log(`bots          ${Object.entries(r.strategies).map(([k, v]) => `${k} ${pct(v)}`).join(' · ')}`);
  console.log(`\n${table(['players', 'games', 'finished', 'avg moves', 'first-player adv.', 'win rate by seat'],
    Object.entries(r.byPlayers).map(([n, b]) => [n, b.games, b.finished, b.avgMoves, pct(b.firstPlayerAdvantage), Object.values(b.seatWinRate).map(pct).join(' / ')]))}`);
  if (r.warnings.length) console.log(`\n${r.warnings.map((w) => `${w.severity === 'warn' ? '!' : '·'} [${w.severity}] ${w.message}`).join('\n')}`);
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
