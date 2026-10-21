// Treasure Road — a complete, small Tablecraft game (1–4 players).
// Roll the die, draw cards, race your pawn down the road; first to the treasure wins.
//
// It shows: seat areas, a hidden hand (opponents only see card backs), deck + discard, a physical die (ctx.roll),
// pawns on a track, a coin stack, a sand timer ($deadline auto-ends slow turns), banner/toast/toss fx, log lines the
// Spotlight can attribute, and actions()/bot()/invariants() for bots and the referee.
//
// Game modules are plain CommonJS-style scripts: `module.exports = { ... }`, the rules kit is the global `T`.

const TRACK = 16;
const TURN_SECONDS = 25;
const COLORS = ['#c8642b', '#3f78a8', '#6e7b3a', '#8a6aa8'];
const DEFAULT_CARDS = [
  { id: 'wind', name: 'Tailwind', text: 'Your pawn moves 2 spaces.', kind: 'move', n: 2, count: 6, color: '#3f78a8', icon: '➹' },
  { id: 'shortcut', name: 'Shortcut', text: 'Your pawn moves 3 spaces.', kind: 'move', n: 3, count: 4, color: '#2f6b48', icon: '⤳' },
  { id: 'swamp', name: 'Swamp', text: 'The leading opponent moves 2 spaces back.', kind: 'back', n: 2, count: 4, color: '#7a3b30', icon: '☠' },
  { id: 'chest', name: 'Treasure Chest', text: 'Gain 2 gold.', kind: 'gold', n: 2, count: 6, color: '#c9a227', icon: '✦' },
];
const BACK = { title: 'TREASURE', color: '#5b3a1e', icon: '✦' };

const P = (s, id) => s.players.find((p) => p.id === id);
const cur = (s) => s.players[s.turn];
function log(s, t) { s.log.push(`R${s.round} · ${t}`); if (s.log.length > 60) s.log.shift(); }
function deadline(s, ctx) { T.setDeadline(s, ctx.now, TURN_SECONDS, 'endTurn', { timeout: true }, cur(s).id); }
function nextTurn(s, ctx) {
  s.turn = T.nextIndex(s.players.length, s.turn);
  if (s.turn === 0) { s.round += 1; log(s, `— Round ${s.round} —`); }
  s.rolled = false; s.played = false;
  deadline(s, ctx);
}
function moveBy(s, p, n, ctx) {
  const before = p.pos;
  p.pos = T.clamp(p.pos + n, 0, TRACK - 1);
  for (const c of [5, 10]) {
    if (before < c && p.pos >= c) {
      p.gold += 1;
      log(s, `${p.name} passed a camp and found 1 gold.`);
      ctx.fx({ type: 'toss', zone: `gold:${p.id}`, n: 1, token: { shape: 'coin', color: '#d4a72c' } });
    }
  }
  if (p.pos >= TRACK - 1 && !s.winner) {
    s.winner = p.id; T.clearDeadline(s);
    log(s, `${p.name} reached the treasure!`);
    ctx.fx({ type: 'banner', text: `${p.name} wins!`, sub: `Reached the treasure with ${p.gold} gold`, color: p.color, sound: 'win' });
  }
}

module.exports = {
  meta: { name: 'Treasure Road', minPlayers: 1, maxPlayers: 4, description: 'Roll the die, play cards and race to the treasure. First to arrive wins.' },

  setup({ players, random, options, now, fx }) {
    const defs = (options.content && options.content.cards) || DEFAULT_CARDS;
    const deck = [];
    defs.forEach((d) => { for (let i = 0; i < (d.count || 1); i++) deck.push(`${d.id}#${i}`); });
    const s = {
      defs: Object.fromEntries(defs.map((d) => [d.id, d])),
      deck: random.shuffle(deck), discard: [],
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % 4], pos: 0, gold: 0, hand: [] })),
      turn: 0, round: 1, rolled: false, played: false, die: 0, winner: null, log: [],
    };
    log(s, '— Round 1 —');
    deadline(s, { now });
    fx({ type: 'banner', text: 'Treasure Road', sub: `${s.players[0].name} goes first`, sound: 'gong' });
    return s;
  },

  moves: {
    roll(s, ctx) {
      if (s.winner) return { error: 'The game is over' };
      if (cur(s).id !== ctx.playerId) return { error: 'It is not your turn' };
      if (s.rolled) return { error: 'You already rolled this turn' };
      const p = cur(s);
      const r = ctx.roll(6, { id: 'die', by: p.id }); // physical die lands on the server's result
      s.die = r.index; s.rolled = true;
      log(s, `${p.name} rolled a ${r.face}.`);
      moveBy(s, p, r.face, ctx);
      const [card] = T.draw(s.deck, s.discard, ctx.random, 1);
      if (card) p.hand.push(card);
      return s;
    },
    play(s, ctx) {
      const p = cur(s);
      if (s.winner || p.id !== ctx.playerId) return { error: 'It is not your turn' };
      if (!s.rolled) return { error: 'Roll the die first' };
      if (s.played) return { error: 'You already played a card this turn' };
      const card = ctx.args.card;
      if (!p.hand.includes(card)) return { error: 'That card is not in your hand' };
      const d = s.defs[card.split('#')[0]];
      p.hand = p.hand.filter((c) => c !== card);
      s.discard.push(card); s.played = true;
      // name + card title in one line: the Spotlight shows this text under the revealed card
      log(s, `${p.name} played ${d.name}.`);
      if (d.kind === 'move') moveBy(s, p, d.n, ctx);
      if (d.kind === 'gold') { p.gold += d.n; ctx.fx({ type: 'toss', zone: `gold:${p.id}`, n: d.n, token: { shape: 'coin', color: '#d4a72c' } }); }
      if (d.kind === 'back') {
        const lead = s.players.filter((q) => q !== p).sort((a, b) => b.pos - a.pos)[0];
        if (lead) { lead.pos = Math.max(0, lead.pos - d.n); ctx.fx({ type: 'toast', text: `${lead.name} is stuck in the swamp!`, tone: 'bad' }); }
      }
      return s;
    },
    endTurn(s, ctx) {
      const p = cur(s);
      if (s.winner) return { error: 'The game is over' };
      if (ctx.playerId !== p.id) return { error: 'It is not your turn' };
      if (ctx.args.timeout) {
        ctx.fx({ type: 'toast', text: `${p.name}: time is up!`, tone: 'bad', sound: false });
        ctx.fx({ type: 'sound', name: 'alarm' });
        if (!s.rolled) moveBy(s, p, 1, ctx); // out of time: one step instead of a roll
      } else if (!s.rolled) return { error: 'Roll the die first' };
      if (!s.winner) nextTurn(s, ctx);
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const zones = [
      { id: 'track', layout: 'track', at: [-24, -11], to: [48, 0], spacing: 3.2, cells: Array.from({ length: TRACK }, (_, i) => ({ label: i === TRACK - 1 ? '★' : String(i), fill: i === 5 || i === 10 ? 'rgba(212,167,44,.5)' : i === TRACK - 1 ? 'rgba(127,201,127,.55)' : 'rgba(255,255,255,.12)' })) },
      { id: 'deck', layout: 'stack', at: [-8, 3], label: 'Deck' },
      { id: 'discard', layout: 'pile', at: [2, 3], label: 'Discard' },
      { id: 'tray', layout: 'row', at: [16, 3], size: [14, 12], mat: true, label: 'Dice' },
      { id: 'timer', layout: 'row', at: [-22, 3] },
    ];
    const objects = [
      { id: 'board', kind: 'board', at: [0, -11], size: [54, 6], face: { title: '', color: '#3a4a3a' } },
      { id: 'deckObj', kind: 'deck', zone: 'deck', count: s.deck.length, back: BACK, tip: `Deck: ${s.deck.length} cards` },
      ...s.discard.slice(-3).map((c) => ({ id: c, kind: 'card', zone: 'discard', face: cardFace(s, c), back: BACK })),
    ];
    const myTurn = me && cur(s).id === me.id && !s.winner;
    objects.push({ id: 'die', kind: 'die', zone: 'tray', faces: 6, value: s.die, color: '#f4f1ea', size: 2.4, click: myTurn && !s.rolled ? { name: 'roll' } : undefined, tip: 'Roll the die' });
    if (s.$deadline && !s.winner) objects.push({ id: 'hourglass', kind: 'timer', zone: 'timer', endsAt: s.$deadline.at, duration: TURN_SECONDS, size: 7, tip: 'Turn time' });
    for (const p of s.players) {
      objects.push({ id: `pawn:${p.id}`, kind: 'token', shape: 'pawn', color: p.color, size: 1.8, zone: 'track', order: p.pos, tip: `${p.name}: space ${p.pos}` });
      zones.push({ id: `hand:${p.id}`, seat: p.id, layout: p === me ? 'fan' : 'row', at: [0, 0], gap: 0.5 });
      zones.push({ id: `gold:${p.id}`, seat: p.id, layout: 'row', at: [14, 0] });
      objects.push({ id: `gold-stack:${p.id}`, kind: 'token', shape: 'coin', color: '#d4a72c', count: p.gold, zone: `gold:${p.id}`, label: `${p.gold}`, showCount: false, tip: `${p.name}: ${p.gold} gold` });
      p.hand.forEach((c) => {
        const mine = me && p.id === me.id;
        objects.push({
          id: c, kind: 'card', zone: `hand:${p.id}`, enterFrom: 'deck', faceUp: mine,
          face: mine ? cardFace(s, c) : undefined, // hidden information: an opponent's card face never enters the view
          back: BACK,
          click: mine && myTurn && s.rolled && !s.played ? { name: 'play', args: { card: c } } : undefined,
        });
      });
    }
    const prompt = s.winner
      ? { type: 'text', text: `🏆 ${P(s, s.winner).name} wins!`, size: 'lg', bold: true }
      : myTurn
        ? { type: 'col', children: [
          { type: 'text', text: s.rolled ? 'Play a card (click it) or end your turn.' : 'Click the die or press the button.', bold: true },
          { type: 'row', children: [
            { type: 'button', label: '🎲 Roll', move: { name: 'roll' }, disabled: s.rolled },
            { type: 'button', label: 'End turn', variant: 'ghost', move: { name: 'endTurn' }, disabled: !s.rolled },
          ] }] }
        : { type: 'text', text: `⏳ ${cur(s).name} is playing`, muted: true };
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'tavern' }, table: { surface: 'felt' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !s.winner, me: !!(me && me.id === p.id) })),
        zones, objects,
      },
      hud: {
        title: 'Treasure Road', status: s.winner ? 'Game over' : `Round ${s.round} · ${cur(s).name}`,
        players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !s.winner, me: !!(me && me.id === p.id), stats: [{ label: 'Space', value: p.pos, key: true }, { label: 'Gold', value: p.gold, color: '#b8901f', key: true }, { label: 'Hand', value: p.hand.length }] })),
        prompt, promptTone: myTurn ? '' : 'wait', log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.winner) return null;
    const ranking = s.players.slice().sort((a, b) => b.pos - a.pos || b.gold - a.gold).map((p, i) => ({ id: p.id, name: p.name, score: p.pos, place: i + 1 }));
    return { winners: [s.winner], reason: `${P(s, s.winner).name} reached the treasure`, ranking };
  },

  // ---- balance lab: position value for a player (distance ahead of the best rival, gold as a tiebreak)
  score(s, { playerId }) {
    const me = P(s, playerId);
    const rival = Math.max(0, ...s.players.filter((p) => p !== me).map((p) => p.pos));
    return me.pos - rival + me.gold * 0.25;
  },

  // ---- referee + bots
  actions(s, { playerId }) {
    if (s.winner || cur(s).id !== playerId) return [];
    if (!s.rolled) return [{ name: 'roll' }];
    const out = [{ name: 'endTurn' }];
    if (!s.played) cur(s).hand.forEach((c) => out.push({ name: 'play', args: { card: c } }));
    return out;
  },
  bot(s, { actions, random }) {
    const plays = actions.filter((a) => a.name === 'play');
    if (plays.length && random.float() < 0.7) return plays[random.int(plays.length)];
    return actions.find((a) => a.name === 'roll') || actions.find((a) => a.name === 'endTurn');
  },
  invariants(s) {
    const e = [];
    const total = Object.values(s.defs).reduce((a, d) => a + (d.count || 1), 0);
    const held = s.players.reduce((a, p) => a + p.hand.length, 0);
    if (s.deck.length + s.discard.length + held !== total) e.push('Card count changed');
    s.players.forEach((p) => { if (p.pos < 0 || p.pos >= TRACK) e.push(`${p.name} left the road`); if (p.gold < 0) e.push('Negative gold'); });
    return e;
  },
};

function cardFace(s, c) {
  const d = s.defs[c.split('#')[0]];
  return { title: d.name, subtitle: d.kind === 'gold' ? 'Treasure' : 'Road', text: d.text, color: d.color, icon: d.icon, image: d.image, corners: { tl: d.n != null ? String(d.n) : undefined } };
}
