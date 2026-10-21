// tablecraft/server — Node runtime: sandboxed game modules, referee, bots, pacing and the socket.io room server.
import { Worker } from 'node:worker_threads';
import { GameModule, CALL_TIMEOUT } from './runtime.js';
import * as referee from '../core/referee.js';
import * as balance from '../core/balance.js';
import { auditViews } from '../core/audit.js';
import { setLocale, addLocale, msg } from '../core/messages.js';

let locale = 'en';
const load = (m) => (typeof m === 'string' ? new GameModule(m) : m);

export { GameModule, CALL_TIMEOUT };
export { Match } from '../core/match.js';
export { makeRandom, randomSeed } from '../core/random.js';
export { T, KIT_SOURCE } from '../core/kit.js';
export { checkScene } from '../core/scene.js';
export { PACE, botDelay, visibleFx, chooseBotMove, isBotId } from '../core/pace.js';
export { createRoomServer } from './rooms.js';
export { addLocale, msg };
export const { summarize, testPlayers } = referee;

export function configure({ locale: l } = {}) { if (l) { locale = l; setLocale(l); } }

// Referee: accepts module source or a loaded module.
export const simulate = (source, opts) => referee.simulate(load(source), opts);
export const validate = (source, opts) => referee.validate(load(source), opts);

// Balance lab (docs/balance.md) and view audit: accept module source or a loaded module.
export const analyzeBalance = (source, opts) => balance.analyzeBalance(load(source), opts);
export const sweepParameter = (source, opts) => balance.sweepParameter(load(source), opts);
export const { compareReports, sweepPoint, BOT_PROFILES } = balance;
export const audit = (source, opts) => auditViews(load(source), opts);

// simulate() in a worker thread → Promise<report & { summary }>
export const simulateAsync = (source, opts = {}) => runWorker('simulate', source, opts);
// analyzeBalance() in a worker thread → Promise<balance report>
export const analyzeBalanceAsync = (source, opts = {}) => runWorker('balance', source, opts);

function runWorker(kind, source, opts) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./sim-worker.js', import.meta.url), { workerData: { kind, source, opts, locale }, execArgv: [] }); // don't inherit host flags (e.g. --input-type)
    const kill = setTimeout(() => { w.terminate(); reject(new Error(msg('simTimeout'))); }, (opts.timeLimitMs || 60000) + 15000);
    w.once('message', (m) => { clearTimeout(kill); w.terminate(); if (m.ok) resolve(m.rep); else reject(new Error(m.error)); });
    w.once('error', (e) => { clearTimeout(kill); reject(e); });
  });
}
