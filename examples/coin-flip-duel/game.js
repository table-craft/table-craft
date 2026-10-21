// Coin Flip Duel — the game from docs/getting-started.md.
module.exports = {
  meta: { name: 'Coin Flip Duel', minPlayers: 2, maxPlayers: 2, description: 'First to 10 points wins.' },

  setup({ players, fx }) {
    fx({ type: 'banner', text: 'Coin Flip Duel', sub: 'First to 10' });
    return { players: players.map((p) => ({ id: p.id, name: p.name, score: 0 })), turn: 0, die: 0, log: [] };
  },

  moves: {
    roll(s, ctx) {
      const p = s.players[s.turn];
      if (p.id !== ctx.playerId) return { error: 'Not your turn' };   // rejected moves never change state
      const r = ctx.roll(6, { id: 'die', by: p.id });                // the 3D die lands on this result
      s.die = r.index;
      p.score += r.face;
      s.log.push(`${p.name} rolled ${r.face}.`);
      s.turn = T.nextIndex(s.players.length, s.turn);
      return s;
    },
  },

  view(s, { playerId }) {
    const myTurn = s.players[s.turn].id === playerId;
    return {
      type: 'tabletop',
      scene: {
        seats: s.players.map((p, i) => ({ id: p.id, name: p.name, color: ['#c8642b', '#3f78a8'][i], active: i === s.turn })),
        zones: [{ id: 'tray', layout: 'row', at: [0, 0], size: [16, 12], mat: true, label: 'Dice tray' }],
        objects: [{ id: 'die', kind: 'die', zone: 'tray', value: s.die, size: 2.6, click: myTurn ? { name: 'roll' } : undefined }],
      },
      hud: {
        title: 'Coin Flip Duel',
        status: `${s.players[s.turn].name} to roll`,
        players: s.players.map((p, i) => ({ id: p.id, name: p.name, active: i === s.turn, me: p.id === playerId, stats: [{ label: 'Points', value: p.score, key: true }] })),
        prompt: myTurn ? { type: 'button', label: '🎲 Roll', move: { name: 'roll' } } : { type: 'text', text: 'Waiting…', muted: true },
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    const w = s.players.find((p) => p.score >= 10);
    return w ? { winners: [w.id], reason: `${w.name} reached ${w.score} points` } : null;
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
};
