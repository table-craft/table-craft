// @ts-check
/// <reference types="tablecraft/game" />
/* global T */
// A plain-JS game file written against the typed contract: the header above is all an author needs.
// Four in a row on a 7×6 grid, with a pass-to-end-round turn order and a ranking at the end.

/**
 * @typedef {{ id: string, name: string, color: string, wins: number }} Seat
 * @typedef {{
 *   players: Seat[],
 *   turn: import('tablecraft/game').TurnOrder,
 *   flow: import('tablecraft/game').Flow<'drop' | 'score'>,
 *   board: Record<string, string | null>,
 *   log: string[],
 *   winner: string | null,
 * }} State
 */

const COLS = 7;
const ROWS = 6;
const CELLS = T.grid.rect(COLS, ROWS);
const COLORS = ['#d8453b', '#e8c547'];

/** @param {State} s @param {string} id */
const P = (s, id) => s.players.find((p) => p.id === id);

/** @param {State} s @param {number} col → the lowest free cell of a column, or null */
function landing(s, col) {
  for (let y = ROWS - 1; y >= 0; y--) { const k = T.grid.key(col, y); if (!s.board[k]) return k; }
  return null;
}

/** @type {import('tablecraft/game').GameModule<State>} */
module.exports = {
  meta: { name: 'Typed Four', minPlayers: 2, maxPlayers: 2, description: 'Type-test fixture.' },

  setup({ players, fx }) {
    fx({ type: 'banner', text: 'Typed Four', sub: 'Connect four to win' });
    return {
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i], wins: 0 })),
      turn: T.turns.create(players.map((p) => p.id)),
      flow: T.flow.create(['drop', 'score'], { rounds: 21 }),
      board: Object.fromEntries(CELLS.map((k) => [k, null])),
      log: [],
      winner: null,
    };
  },

  moves: {
    /** @type {import('tablecraft/game').Move<State, { col: number }>} */
    drop(s, ctx) {
      if (T.turns.current(s.turn) !== ctx.playerId) return { error: 'Not your turn' };
      const cell = landing(s, Number(ctx.args.col));
      if (!cell) return { error: 'That column is full' };
      s.board[cell] = ctx.playerId;
      const me = P(s, ctx.playerId);
      s.log.push(`${me ? me.name : ctx.playerId} dropped into column ${ctx.args.col + 1}.`);
      const run = T.grid.lineRuns(CELLS, (k) => s.board[k], 4)[0];
      if (run) {
        s.winner = run.value;
        ctx.fx({ type: 'highlight', ids: run.cells.map((k) => `disc:${k}`), color: '#fff' });
      }
      if (!T.turns.next(s.turn)) T.flow.next(s.flow);
      return s;
    },
  },

  view(s, { playerId }) {
    const myTurn = T.turns.current(s.turn) === playerId && !s.winner;
    /** @type {import('tablecraft/game').SceneObject[]} */
    const objects = [];
    for (const k of CELLS) {
      const owner = s.board[k];
      if (owner) objects.push({ id: `disc:${k}`, kind: 'token', shape: 'disc', zone: 'board', order: CELLS.indexOf(k), color: P(s, owner)?.color });
    }
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'day' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: T.turns.current(s.turn) === p.id })),
        zones: [{ id: 'board', layout: 'grid', cols: COLS, at: [0, 0], mat: true, label: 'Board' }],
        objects,
      },
      hud: {
        title: 'Typed Four',
        status: s.winner ? 'Game over' : `Round ${s.flow.round}`,
        players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, me: p.id === playerId, stats: [{ label: 'Wins', value: p.wins, key: true }] })),
        prompt: myTurn
          ? { type: 'row', children: T.range(COLS).map((c) => ({ type: 'button', label: String(c + 1), move: { name: 'drop', args: { col: c } } })) }
          : { type: 'text', text: 'Waiting…', muted: true },
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.winner && !s.flow.over) return null;
    return T.score.result(s.players.map((p) => ({ ...p, score: p.id === s.winner ? 1 : 0 })), { keys: ['score'] });
  },

  actions(s, { playerId }) {
    if (s.winner || T.turns.current(s.turn) !== playerId) return [];
    return T.range(COLS).filter((c) => landing(s, c)).map((col) => ({ name: 'drop', args: { col } }));
  },

  bot(s, { actions, random }) {
    return random.pick(actions);
  },

  score(s, { playerId }) {
    return s.winner === playerId ? 1 : 0;
  },

  invariants(s) {
    const discs = Object.values(s.board).filter(Boolean).length;
    return [discs > COLS * ROWS && 'too many discs'];
  },
};
