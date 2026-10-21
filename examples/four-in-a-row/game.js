// Drop Four — a classic two-player connection game on a 7 × 6 board.
// Drop a disc into a column; it falls to the lowest free hole. Four of your discs in a row — across, up or
// diagonally — wins. A full board is a draw. A coin toss decides who drops first.
//
// It shows: T.grid (rect, key/parse, lineRuns) for the board and the win check, a board with free-layout pieces on
// computed positions, ghost "drop here" holes you click, discs that fly in from each player's supply (enterFrom),
// the winning line glowing with a link drawn through it, and a bot that wins, blocks and avoids handing out wins.

const COLS = 7;
const ROWS = 6;
const CELL = 4.4; // cm between hole centres
const NEED = 4;
const CELLS = T.grid.rect(COLS, ROWS); // 'x,y' keys, y = 0 is the far (top) row; discs fall towards +y
const COLORS = ['#e0a325', '#2f8f9d'];
const NAMES = ['Amber', 'Teal'];
// every straight window of four cells as board indices (y * COLS + x) — used by the bot and score()
const WINDOWS = [];
for (const k of CELLS) {
  const [x, y] = T.grid.parse(k);
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const w = T.range(NEED).map((i) => [x + dx * i, y + dy * i]);
    if (w.every((c) => T.grid.inBounds(c, COLS, ROWS))) WINDOWS.push(w.map(([cx, cy]) => cy * COLS + cx));
  }
}
const WEIGHT_MINE = [0, 1, 4, 16, 1000];
const WEIGHT_THEIRS = [0, 1, 4, 18, 1000];

const P = (s, id) => s.players.find((p) => p.id === id);
const cur = (s) => s.players[s.turn];
const other = (s, id) => s.players.find((p) => p.id !== id);
function log(s, t) { s.log.push(`T${s.moves + 1} · ${t}`); if (s.log.length > 60) s.log.shift(); }
const posOf = (k) => { const [x, y] = T.grid.parse(k); return [(x - (COLS - 1) / 2) * CELL, (y - (ROWS - 1) / 2) * CELL]; };

// the hole a disc dropped into column x lands in, or null when the column is full
function landing(board, x) {
  for (let y = ROWS - 1; y >= 0; y--) if (!board[T.grid.key(x, y)]) return T.grid.key(x, y);
  return null;
}
const openCols = (board) => T.range(COLS).filter((x) => landing(board, x) != null);
// runs of four or more through `cell` for whoever owns it
const runsThrough = (board, cell) => T.grid.lineRuns(CELLS, (k) => board[k], NEED).filter((r) => r.cells.includes(cell));
const winsAt = (board, x, id) => { const k = landing(board, x); return !!k && runsThrough({ ...board, [k]: id }, k).length > 0; };

// ---- the bot's look-ahead works on a compact copy: an array of 42 (0 empty, 1 = me, 2 = them) and column heights
function compact(board, me) {
  const a = CELLS.map((k) => (!board[k] ? 0 : board[k] === me ? 1 : 2));
  const h = T.range(COLS).map((x) => T.range(ROWS).filter((y) => a[y * COLS + x]).length); // discs per column
  return { a, h };
}
// would a disc of `who` dropped into column x complete four?
function connects(a, h, x, who) {
  const y = ROWS - 1 - h[x];
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let n = 1;
    for (const sg of [1, -1]) {
      for (let i = 1; ; i++) {
        const cx = x + dx * i * sg, cy = y + dy * i * sg;
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || a[cy * COLS + cx] !== who) break;
        n++;
      }
    }
    if (n >= NEED) return true;
  }
  return false;
}
// open windows weighted by how full they are, plus the centre column — from player 1's point of view
function evaluate(a) {
  let v = 0;
  for (const w of WINDOWS) {
    let mine = 0, theirs = 0;
    for (const i of w) { if (a[i] === 1) mine++; else if (a[i] === 2) theirs++; }
    if (mine && !theirs) v += WEIGHT_MINE[mine];
    else if (theirs && !mine) v -= WEIGHT_THEIRS[theirs];
  }
  for (let y = 0; y < ROWS; y++) { const o = a[y * COLS + 3]; if (o === 1) v += 2; else if (o === 2) v -= 2; }
  return v;
}
// negamax with alpha-beta: the value for `who` (1 or 2), who is about to move. Moves are made and undone in place.
const ORDER = [3, 2, 4, 1, 5, 0, 6];
function search(a, h, who, depth, alpha, beta) {
  const cols = ORDER.filter((x) => h[x] < ROWS);
  if (!cols.length) return 0;
  for (const x of cols) if (connects(a, h, x, who)) return 100000 + depth;
  if (depth === 0) return who === 1 ? evaluate(a) : -evaluate(a);
  for (const x of cols) {
    const i = (ROWS - 1 - h[x]) * COLS + x;
    a[i] = who; h[x]++;
    const v = -search(a, h, 3 - who, depth - 1, -beta, -alpha);
    a[i] = 0; h[x]--;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return alpha;
}

module.exports = {
  meta: { name: 'Drop Four', minPlayers: 2, maxPlayers: 2, description: 'Drop discs into a 7 × 6 board. Four in a row — across, up or diagonally — wins.' },

  setup({ players, random, fx }) {
    const first = random.int(2); // coin toss: either seat may start
    const s = {
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i], colorName: NAMES[i], left: (COLS * ROWS) / 2, won: 0 })),
      board: {}, discOf: {}, turn: first, moves: 0, last: null, winner: null, winLines: [], draw: false, log: [],
    };
    log(s, `${s.players[first].name} won the coin toss and drops first.`);
    fx({ type: 'banner', text: 'Drop Four', sub: `${s.players[first].name} drops first`, sound: 'gong' });
    return s;
  },

  moves: {
    drop(s, ctx) {
      if (s.winner || s.draw) return { error: 'The game is over' };
      const p = cur(s);
      if (p.id !== ctx.playerId) return { error: 'It is not your turn' };
      const x = ctx.args && ctx.args.col;
      if (!Number.isInteger(x) || x < 0 || x >= COLS) return { error: 'Choose a column from 1 to 7' };
      const k = landing(s.board, x);
      if (!k) return { error: 'That column is full' };
      s.board[k] = p.id; s.discOf[k] = s.moves; s.last = k; p.left -= 1;
      log(s, `${p.name} dropped a disc into column ${x + 1}.`);
      const runs = runsThrough(s.board, k);
      if (runs.length) {
        s.winner = p.id; p.won = 1;
        s.winLines = runs.map((r) => r.cells);
        log(s, `${p.name} connected ${Math.max(...runs.map((r) => r.cells.length))} in a row and wins!`);
        ctx.fx({ type: 'highlight', ids: s.winLines.flat().map((c) => `disc:${s.discOf[c]}`), color: '#ffe27a', ms: 4000 });
        ctx.fx({ type: 'banner', text: `${p.name} wins!`, sub: 'Four in a row', color: p.color, sound: 'win' });
      } else if (!openCols(s.board).length) {
        s.draw = true;
        log(s, 'The board is full — the game is a draw.');
        ctx.fx({ type: 'banner', text: 'Draw', sub: 'The board is full', sound: 'gong' });
      }
      s.moves += 1;
      if (!s.winner && !s.draw) {
        s.turn = 1 - s.turn;
        const o = other(s, p.id);
        const threats = openCols(s.board).filter((c) => winsAt(s.board, c, p.id));
        if (threats.length) ctx.fx({ type: 'toast', text: threats.length > 1 ? `${p.name} threatens two wins at once!` : `${p.name} threatens column ${threats[0] + 1}`, tone: 'bad', to: [o.id] });
      }
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const over = !!(s.winner || s.draw);
    const myTurn = !!(me && cur(s) === me && !over);
    const winCells = new Set(s.winLines.flat());
    const zones = [{ id: 'grid', layout: 'free', at: [0, 0] }];
    const objects = [
      { id: 'board', kind: 'board', at: [0, 0], size: [COLS * CELL + 3, ROWS * CELL + 3], thickness: 0.8, face: { title: '', color: '#24406b', bg: '#1d3557' } },
    ];
    for (const k of CELLS) {
      const owner = s.board[k];
      if (owner) {
        const o = P(s, owner);
        const win = winCells.has(k);
        objects.push({
          id: `disc:${s.discOf[k]}`, kind: 'token', shape: 'disc', size: 3.6, color: o.color, material: 'wood', zone: 'grid', at: posOf(k),
          enterFrom: `supply:${owner}`, glow: win ? '#ffe27a' : k === s.last && !over ? 'soft' : false,
          tip: `${o.name} · column ${T.grid.parse(k)[0] + 1}`,
        });
      } else {
        const x = T.grid.parse(k)[0];
        const drop = myTurn && landing(s.board, x) === k;
        objects.push({
          id: `hole:${k}`, kind: 'token', shape: 'disc', size: 3.4, color: '#0f1f36', ghost: true, zone: 'grid', at: posOf(k),
          click: drop ? { name: 'drop', args: { col: x } } : undefined, glow: drop ? me.color : false,
          label: drop ? String(x + 1) : undefined, tip: drop ? `Drop into column ${x + 1}` : undefined,
        });
      }
    }
    if (s.winLines.length) {
      s.winLines.forEach((line, i) => objects.push({ id: `winline:${i}`, kind: 'link', from: `disc:${s.discOf[line[0]]}`, to: `disc:${s.discOf[line[line.length - 1]]}`, color: '#ffe27a', width: 0.6, raise: 0.9, inset: 0 }));
    }
    for (const p of s.players) {
      zones.push({ id: `supply:${p.id}`, seat: p.id, layout: 'row', at: [0, 2] });
      objects.push({ id: `supply-stack:${p.id}`, kind: 'token', shape: 'disc', color: p.color, size: 3.6, count: p.left, maxStack: 21, zone: `supply:${p.id}`, label: `${p.left} left`, showCount: false, tip: `${p.name}: ${p.left} discs left` });
    }
    const status = s.winner ? `${P(s, s.winner).name} wins` : s.draw ? 'Draw' : `Turn ${s.moves + 1} · ${cur(s).name}`;
    const prompt = over
      ? { type: 'text', text: s.winner ? `🏆 ${P(s, s.winner).name} connected four!` : 'Draw — the board is full.', size: 'lg', bold: true }
      : myTurn
        ? { type: 'col', children: [
          { type: 'text', text: 'Click a glowing hole or pick a column.', bold: true },
          { type: 'row', wrap: true, children: T.range(COLS).map((x) => ({ type: 'button', label: String(x + 1), variant: x === 3 ? 'primary' : 'ghost', move: { name: 'drop', args: { col: x } }, disabled: landing(s.board, x) == null })) }] }
        : { type: 'text', text: `⏳ ${cur(s).name} is thinking`, muted: true };
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'day' }, table: { surface: 'wood' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !over, me: !!(me && me.id === p.id), sub: `${p.colorName} · ${p.left} discs` })),
        zones, objects, camera: { preset: 'top' },
      },
      hud: {
        title: 'Drop Four', status,
        players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !over, me: !!(me && me.id === p.id),
          badges: s.winner === p.id ? ['Winner'] : [], stats: [{ label: 'Colour', value: p.colorName, color: p.color, key: true }, { label: 'Discs left', value: p.left, key: true }] })),
        prompt, promptTone: myTurn ? '' : 'wait', log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.winner && !s.draw) return null;
    return T.score.result(s.players, { keys: ['won'], reason: s.winner ? `${P(s, s.winner).name} connected four in a row` : 'Draw — the board is full' });
  },

  // balance lab: the board from this player's point of view
  score(s, { playerId }) {
    if (s.winner) return s.winner === playerId ? 10000 : -10000;
    return evaluate(compact(s.board, playerId).a);
  },

  actions(s, { playerId }) {
    if (s.winner || s.draw || cur(s).id !== playerId) return [];
    return openCols(s.board).map((col) => ({ name: 'drop', args: { col } }));
  },

  // win now > block their win > a short look-ahead (negamax, 5 plies) over the window heuristic, centre first
  bot(s, { playerId, actions, random }) {
    const opp = other(s, playerId).id;
    const pick = (x) => actions.find((a) => a.args.col === x);
    const cols = actions.map((a) => a.args.col);
    const win = cols.find((x) => winsAt(s.board, x, playerId));
    if (win != null) return pick(win);
    const block = cols.find((x) => winsAt(s.board, x, opp));
    if (block != null) return pick(block);
    const { a, h } = compact(s.board, playerId);
    let best = null, bestV = -Infinity;
    for (const x of cols.slice().sort((p, q) => Math.abs(p - 3) - Math.abs(q - 3))) {
      const i = (ROWS - 1 - h[x]) * COLS + x;
      a[i] = 1; h[x]++;
      const v = -search(a, h, 2, 4, -Infinity, Infinity) + random.float() * 2;
      a[i] = 0; h[x]--;
      if (v > bestV) { bestV = v; best = x; }
    }
    return pick(best);
  },

  invariants(s) {
    const e = [];
    const n = s.players.map((p) => Object.values(s.board).filter((o) => o === p.id).length);
    if (Math.abs(n[0] - n[1]) > 1) e.push('Disc counts drifted apart');
    s.players.forEach((p, i) => { if (p.left + n[i] !== (COLS * ROWS) / 2) e.push(`${p.name}'s discs do not add up`); });
    for (const k of Object.keys(s.board)) {
      const [x, y] = T.grid.parse(k);
      if (y < ROWS - 1 && !s.board[T.grid.key(x, y + 1)]) e.push(`Floating disc at ${k}`);
    }
    return e;
  },
};
