// Worker thread for simulateAsync() / analyzeBalanceAsync(): the referee and the balance lab can take seconds;
// keep them off the event loop of live tables.
import { parentPort, workerData } from 'node:worker_threads';
import { GameModule } from './runtime.js';
import { simulate, summarize } from '../core/referee.js';
import { analyzeBalance } from '../core/balance.js';
import { setLocale } from '../core/messages.js';

try {
  if (workerData.locale) setLocale(workerData.locale);
  const mod = new GameModule(workerData.source);
  if (workerData.kind === 'balance') {
    parentPort.postMessage({ ok: true, rep: analyzeBalance(mod, workerData.opts) });
  } else {
    const rep = simulate(mod, workerData.opts);
    parentPort.postMessage({ ok: true, rep: { ...rep, summary: summarize(rep) } });
  }
} catch (e) {
  parentPort.postMessage({ ok: false, error: e.message });
}
