// Deterministic replays: seed + players + options + the recorded move list → every state the table went through.
// A host records moves as { playerId, name, args, at, error? }; replaying re-runs setup() and each move with the
// recorded timestamp as ctx.now. Rejected moves become frames marked `rejected` and are not applied.

const toMs = (t) => (t == null ? null : typeof t === 'number' ? t : Date.parse(t));
const SYSTEM = { id: 'system', name: 'System' };

// mod: a loaded GameModule / LocalGameModule
// → { frames: [{ index, move, state, rng, fx, result, error, rejected, at }], ok, error, divergedAt }
// Frame 0 is the state right after setup (move: null).
export function replayMatch(mod, { seed, players = [], options = {}, moves = [], startedAt } = {}) {
  const t0 = toMs(startedAt) ?? toMs(moves[0]?.at) ?? 0;
  const frames = [];
  let state; let rng; let fx;
  try {
    ({ state, rng, fx } = mod.setup(players, seed, options, t0));
  } catch (e) {
    return { frames, ok: false, error: `setup: ${e.message}`, divergedAt: 0 };
  }
  let result = mod.endIf(state);
  frames.push({ index: 0, move: null, state, rng, fx: fx || [], result, error: null, rejected: false, at: t0 });
  let divergedAt = null;
  moves.forEach((mv, i) => {
    const at = toMs(mv.at) ?? frames[frames.length - 1].at;
    const player = players.find((p) => p.id === mv.playerId) || (mv.playerId === 'system' || !mv.playerId ? SYSTEM : { id: mv.playerId, name: mv.playerName || mv.playerId });
    let r;
    try { r = mod.move(state, mv.name, { playerId: player.id, player, args: mv.args || {}, now: at }, rng); } catch (e) { r = { error: e.message }; }
    if (r.error) {
      // a recorded success that fails now means the module or the inputs differ from the original game
      if (!mv.error && divergedAt == null) divergedAt = i + 1;
      frames.push({ index: i + 1, move: mv, state, rng, fx: [], result, error: r.error, rejected: true, at });
      return;
    }
    if (mv.error && divergedAt == null) divergedAt = i + 1; // originally rejected, accepted now
    ({ state, rng } = r);
    result = mod.endIf(state);
    frames.push({ index: i + 1, move: mv, state, rng, fx: r.fx || [], result, error: null, rejected: false, at });
  });
  return { frames, ok: divergedAt == null, error: divergedAt == null ? null : `replay diverged at move ${divergedAt}`, divergedAt };
}

// one-line description of a recorded move: "Bo · deliver {"port":"x"}"
export function describeMove(mv, players = []) {
  if (!mv) return '';
  const who = players.find((p) => p.id === mv.playerId)?.name || mv.playerName || (mv.playerId === 'system' ? 'System' : mv.playerId);
  const args = mv.args && Object.keys(mv.args).length ? ` ${JSON.stringify(mv.args)}` : '';
  return `${who} · ${mv.name}${args}`;
}
