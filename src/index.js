// tablecraft — isomorphic core + match clients. No three.js here (see tablecraft/engine, tablecraft/react).
export { createLocalMatch } from './client/local.js';
export { connectRoom } from './client/room.js';
export { createReplay } from './client/replay.js';
export { replayMatch, describeMove } from './core/replay.js';
export { analyzeBalance, sweepParameter, sweepPoint, compareReports, BOT_PROFILES } from './core/balance.js';
export { auditViews } from './core/audit.js';
export { LocalGameModule } from './client/local-module.js';
export { Match } from './core/match.js';
export { T, KIT_SOURCE, createKit } from './core/kit.js';
export { makeRandom, randomSeed } from './core/random.js';
export { checkScene } from './core/scene.js';
export { simulate, summarize, validate, testPlayers } from './core/referee.js';
export { PACE, botDelay, visibleFx, chooseBotMove, isBotId } from './core/pace.js';
export { setLocale, addLocale } from './core/messages.js';
export const VERSION = '0.1.0';
