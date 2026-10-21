// Every example must play cleanly and leak nothing: `npm run examples:check` (CI runs it).
import fs from 'node:fs';
import { simulate, summarize, audit } from '../src/server/index.js';

const games = Number(process.argv[2]) || 50;
let failed = 0;
for (const dir of fs.readdirSync('examples').sort()) {
  const file = `examples/${dir}/game.js`;
  if (!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const rep = simulate(source, { games, seed: 1 });
  const leaks = audit(source, { games: 2 }).findings.filter((f) => f.severity === 'error');
  const ok = rep.ok && !leaks.length;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${dir.padEnd(16)} ${summarize(rep).split('\n')[0]}${leaks.length ? ` · ${leaks.length} audit error(s)` : ''}`);
  for (const f of leaks) console.log(`    ${f.message}`);
}
process.exit(failed ? 1 : 0);
