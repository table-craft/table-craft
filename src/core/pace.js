// Pacing and bots: how a host (room server, local match) decides who moves next and how long to wait so that
// humans can follow — dice settle, banners are read, revealed cards stay on screen.

export const PACE = { slow: 3400, normal: 2200, fast: 900 };
const PACE_EXTRA = { slow: 1.3, normal: 1, fast: 0.35 };

// Delay before the next bot move, given the fx produced by the previous move.
export function botDelay(pace = 'normal', fx = []) {
  const p = PACE[pace] ? pace : 'normal';
  let extra = 0;
  for (const e of fx || []) {
    if (e.type === 'roll') extra = Math.max(extra, 1900);
    else if (e.type === 'banner') extra = Math.max(extra, Math.min(4000, e.ms || 2600));
    else if (e.type === 'reveal') extra = Math.max(extra, 1800);
    else if (e.type === 'shake' || e.type === 'toss') extra = Math.max(extra, 900);
  }
  return Math.round(PACE[p] + extra * PACE_EXTRA[p]);
}

// fx with `to: [playerIds]` are private to those players.
export const visibleFx = (fx, playerId) => (fx || []).filter((e) => !Array.isArray(e.to) || e.to.includes(playerId));

// Bot move: the module's bot() first; if it returns nothing valid, a random non-free action.
// useBot=false: fully random (the referee uses this to widen coverage; free actions are sometimes tried too).
export function chooseBotMove(mod, state, player, rand, useBot = true) {
  const acts = mod.actions(state, player) || [];
  const main = acts.filter((a) => !a.free);
  if (!main.length) return null;
  let pick = null;
  if (useBot) { try { pick = mod.bot(state, player, acts, rand.int(2 ** 31)); } catch { pick = null; } }
  else if (rand.float() < 0.15 && acts.length > main.length) pick = rand.pick(acts.filter((a) => a.free));
  if (!pick || typeof pick.name !== 'string') pick = rand.pick(main);
  return { name: pick.name, args: pick.args || {} };
}

export const isBotId = (id) => typeof id === 'string' && id.startsWith('bot_');
