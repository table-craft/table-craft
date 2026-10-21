// Dice Duel — the smallest complete Tablecraft game: two players take turns rolling one die; first to TARGET wins.
//
// Game modules are plain scripts: `module.exports = { ... }`; the rules kit is the global `T`.
// Change a rule, save, and the table reloads. Then run `npm run validate` and `npm run simulate`.
// Reference: https://github.com/table-craft/table-craft/blob/main/docs/game-module.md

const TARGET = 10;                          // points needed to win
const COLORS = ['#c8642b', '#3f78a8'];

module.exports = {
  meta: { name: 'Dice Duel', minPlayers: 2, maxPlayers: 2, description: `First to ${TARGET} points wins.` },

  // Initial state: plain JSON. Every random number must come from `random` / `ctx.roll` so games are replayable.
  setup({ players, fx }) {
    fx({ type: 'banner', text: 'Dice Duel', sub: `First to ${TARGET}` });
    return { players: players.map((p) => ({ id: p.id, name: p.name, score: 0 })), turn: 0, die: 0, log: [] };
  },

  // Moves validate their input and return the new state, or { error } (rejected moves never change state).
  moves: {
    roll(s, ctx) {
      const p = s.players[s.turn];
      if (p.id !== ctx.playerId) return { error: 'Not your turn' };
      const r = ctx.roll(6, { id: 'die', by: p.id });                // the 3D die lands on this result
      s.die = r.index;
      p.score += r.face;
      s.log.push(`${p.name} rolled ${r.face}.`);                     // one line per action, with the player's name
      s.turn = T.nextIndex(s.players.length, s.turn);
      return s;
    },
  },

  // What one player sees: the 3D table (scene) and the 2D overlay (hud). Hidden information stays out of it.
  view(s, { playerId }) {
    const myTurn = s.players[s.turn].id === playerId;
    return {
      type: 'tabletop',
      scene: {
        seats: s.players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i], active: i === s.turn })),
        zones: [{ id: 'tray', layout: 'row', at: [0, 0], size: [16, 12], mat: true, label: 'Dice tray' }],
        objects: [{ id: 'die', kind: 'die', zone: 'tray', value: s.die, size: 2.6, click: myTurn ? { name: 'roll' } : undefined }],
      },
      hud: {
        title: 'Dice Duel',
        status: `${s.players[s.turn].name} to roll`,
        players: s.players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i], active: i === s.turn, me: p.id === playerId, stats: [{ label: 'Points', value: p.score, key: true }] })),
        prompt: myTurn ? { type: 'button', label: '🎲 Roll', move: { name: 'roll' } } : { type: 'text', text: 'Waiting…', muted: true },
        promptTone: myTurn ? '' : 'wait',
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    const w = s.players.find((p) => p.score >= TARGET);
    if (!w) return null;
    const ranking = s.players.slice().sort((a, b) => b.score - a.score).map((p, i) => ({ id: p.id, name: p.name, score: p.score, place: i + 1 }));
    return { winners: [w.id], reason: `${w.name} reached ${w.score} points`, ranking };
  },

  // Optional: how good the position is for this player (the balance lab's greedy bot and lead-change metrics use it).
  score(s, { playerId }) {
    const me = s.players.find((p) => p.id === playerId);
    return me.score - Math.max(...s.players.filter((p) => p !== me).map((p) => p.score));
  },

  // Every legal move for this player right now. Bots and the referee use it.
  actions(s, { playerId }) {
    return s.players[s.turn].id === playerId ? [{ name: 'roll' }] : [];
  },

  // Optional: rules that must always hold. The referee checks them after every move.
  invariants(s) {
    return s.players.some((p) => p.score < 0) ? ['Negative score'] : [];
  },
};
