// Runs the referee and the balance lab off the main thread, so the table and the editor stay responsive.
// in:  { id, task: 'referee' | 'balance', code, opts }
// out: { id, ok: true, result } | { id, ok: false, error: { message, line, where } }
import { simulate, validate } from '../../../src/core/referee.js';
import { analyzeBalance } from '../../../src/core/balance.js';
import { PlaygroundModule, describeError } from './module.js';

self.onmessage = ({ data: { id, task, code, opts = {} } }) => {
  let firstError = null;
  const reply = (msg) => self.postMessage({ id, ...msg });
  let mod;
  try {
    mod = new PlaygroundModule(code, { onError: (e) => { firstError = firstError || e; } });
  } catch (e) { reply({ ok: false, error: describeError(e, 'load') }); return; }
  try {
    const t0 = performance.now();
    if (task === 'referee') {
      let smoke = null;
      try { smoke = validate(mod, { simulate: false }); } catch (e) { smoke = { error: e.message }; }
      const rep = simulate(mod, { games: opts.games || 50, players: opts.players || undefined, timeLimitMs: 45000, seed: opts.seed || 1 });
      reply({ ok: true, result: { smoke, rep, firstError, ms: Math.round(performance.now() - t0) } });
    } else if (task === 'balance') {
      const report = analyzeBalance(mod, { games: opts.games || 100, players: opts.players || undefined, botMix: opts.botMix || ['module'], seed: opts.seed || 1, timeLimitMs: 60000 });
      reply({ ok: true, result: { report, firstError, hasScore: mod.has('score'), meta: mod.meta, ms: Math.round(performance.now() - t0) } });
    } else reply({ ok: false, error: { message: `unknown task ${task}` } });
  } catch (e) {
    reply({ ok: false, error: firstError || describeError(e, task) });
  }
};
