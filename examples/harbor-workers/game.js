// Harbor Workers — a small worker-placement and market game for 2–4 players.
// Each round has three phases. PLACE: in turn order, put your dockhands one at a time on the harbor's action spaces
// (most have room for only one or two). RESOLVE: the spaces pay out in harbor order — fish, timber, cloth, a resource
// of your choice, coins — and at the Contract Office you fulfil one shipping contract from the market. CLEANUP:
// workers come home, the contract row slides and refills, the start player moves one seat on.
// Older contracts slide to the front of the row and get cheaper. Most points after the last round wins.
//
// It shows the mechanics library: rounds and phases (T.flow), worker spaces with capacity (T.workers), a face-up
// market with price by position (T.market), resources (T.pay / T.add), a rotating start player (T.turns.rotate),
// "finish the round" end triggers (T.flow.endAfterRound) and decisions during resolution (T.pending).

const WORKERS = 3;
const ROUNDS = { 2: 7, 3: 6, 4: 8 }; // a multiple of the player count where possible: everyone starts equally often
const ROW = 4;
const PRICES = [0, 1, 2, 3]; // coins on top of the cargo: the oldest contract (slot 1) is the cheapest
const START_COINS = 3;
const END_CONTRACTS = 5; // fulfilling your 5th contract ends the game after this round
const COLORS = ['#c8642b', '#3f78a8', '#6e7b3a', '#8a6aa8'];
const RES = {
  fish: { name: 'Fish', color: '#4f8fb8', icon: '🐟' },
  timber: { name: 'Timber', color: '#8a5a32', icon: '🪵' },
  cloth: { name: 'Cloth', color: '#b0413e', icon: '🧵' },
};
const RES_KEYS = Object.keys(RES);

// action spaces in resolution order; cap by player count (null = unlimited)
const SPACES = [
  { id: 'pier', name: 'Fishing Pier', text: '+2 Fish', cap: [1, 2, 2], gain: { fish: 2 }, color: '#2f6f96', icon: '⚓' },
  { id: 'yard', name: 'Timber Yard', text: '+2 Timber', cap: [1, 2, 2], gain: { timber: 2 }, color: '#7a5230', icon: '🪓' },
  { id: 'loom', name: 'Weaver\'s Loom', text: '+1 Cloth, +1 coin', cap: [1, 1, 2], gain: { cloth: 1, coins: 1 }, color: '#9c3b3a', icon: '🧶' },
  { id: 'stall', name: 'Market Stall', text: '+1 resource of your choice', cap: [null, null, null], color: '#b8901f', icon: '⚖' },
  { id: 'customs', name: 'Customs House', text: '+3 coins', cap: [1, 1, 1], gain: { coins: 3 }, color: '#4a5a6a', icon: '🏛' },
  { id: 'office', name: 'Contract Office', text: 'Fulfil one contract', cap: [2, 3, 3], color: '#2f6b48', icon: '📜' },
];
const SPACE = Object.fromEntries(SPACES.map((x) => [x.id, x]));

// shipping contracts: cargo → points (cloth is scarce, mixed cargo pays a bonus)
const CONTRACTS = [
  ['Salt Cod for the Navy', { fish: 3 }], ['Pickled Herring', { fish: 2, cloth: 1 }], ['Mast Timber', { timber: 3 }],
  ['Fishing Smacks', { timber: 2, fish: 1 }], ['Sailcloth', { cloth: 2 }], ['Cargo Crates', { timber: 2, cloth: 1 }],
  ['Smoked Eel', { fish: 2, timber: 1 }], ['Fine Linen', { cloth: 3 }], ['Ship\'s Hull', { timber: 4, cloth: 1 }],
  ['Feast for the Guild', { fish: 4, cloth: 1 }], ['Rigging', { timber: 1, cloth: 2 }], ['Trade Barge', { fish: 2, timber: 2, cloth: 1 }],
  ['Lighthouse Stores', { fish: 1, timber: 2, cloth: 2 }], ['Harbor Crane', { timber: 5 }], ['Spice Run', { fish: 3, cloth: 2 }],
  ['Market Day', { fish: 1, timber: 1, cloth: 1 }], ['Rope Walk', { timber: 2, cloth: 2 }], ['Whaler\'s Supplies', { fish: 3, timber: 3 }],
  ['Governor\'s Banquet', { fish: 3, timber: 1, cloth: 2 }], ['Barrels', { timber: 2 }], ['Dried Fish', { fish: 2 }], ['Bolt of Silk', { cloth: 1, fish: 1 }],
].map(([name, cost], i) => {
  const n = T.sum(cost); const kinds = Object.keys(cost).length;
  return { id: `k${i}`, name, cost, vp: n + (cost.cloth || 0) + (kinds === 3 ? 2 : kinds === 2 ? 1 : 0) };
});
const BYID = Object.fromEntries(CONTRACTS.map((c) => [c.id, c]));
const BACK = { title: 'CONTRACT', color: '#23384a', icon: '⚓' };

const P = (s, id) => s.players.find((p) => p.id === id);
function log(s, t) { s.log.push(`R${s.flow.round} · ${t}`); if (s.log.length > 60) s.log.shift(); }
const capOf = (sp, n) => sp.cap[Math.min(2, n - 2)];
const resText = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${v} ${k === 'coins' ? 'coin' + (v > 1 ? 's' : '') : RES[k].name}`).join(', ');
const workersLeft = (s, id) => WORKERS - s.placed.filter((x) => x.playerId === id).length;
const price = (s, id) => T.market.price(s.row.indexOf(id), PRICES);
const fullCost = (s, id) => ({ ...BYID[id].cost, coins: price(s, id) });
const affordable = (s, p) => s.row.filter((id) => id != null && T.canPay(p.res, fullCost(s, id)));

function startRound(s, ctx) {
  s.placed = [];
  log(s, `— Round ${s.flow.round} —`);
  const first = P(s, T.turns.current(s.turn));
  ctx.fx({ type: 'banner', text: `Round ${s.flow.round}${T.flow.isLastRound(s.flow) ? ' · last round' : ''}`, sub: `${first.name} places first`, color: '#4f8fb8', sound: 'gong' });
}

// resolve the spaces in harbor order; stops at the first decision (T.pending) and continues after it
function resolve(s, ctx) {
  while (!s.pending.length && s.queue.length) {
    const { space, playerId } = s.queue.shift();
    const p = P(s, playerId); const sp = SPACE[space];
    if (sp.gain) {
      T.add(p.res, sp.gain);
      log(s, `${p.name} at the ${sp.name}: +${resText(sp.gain)}.`);
      if (sp.gain.coins) ctx.fx({ type: 'toss', zone: `res:${p.id}`, n: sp.gain.coins, token: { shape: 'coin', color: '#d4a72c' } });
    } else if (space === 'stall') {
      T.pending.push(s.pending, { playerId, kind: 'stall', options: RES_KEYS });
    } else if (space === 'office') {
      const can = affordable(s, p);
      if (can.length) T.pending.push(s.pending, { playerId, kind: 'contract', options: [...can, 'skip'] });
      else log(s, `${p.name} found no contract they could fulfil.`);
    }
  }
  if (s.pending.length || s.queue.length) return;
  T.flow.next(s.flow); // → cleanup
  cleanup(s, ctx);
}

function cleanup(s, ctx) {
  T.workers.returnAll(s.board);
  s.placed = [];
  if (!s.takenThisRound && s.row[0] != null) {
    const gone = T.market.take(s.row, 0);
    s.gone.push(gone);
    log(s, `Nobody took ${BYID[gone].name}: it sails away.`);
  }
  s.takenThisRound = false;
  T.market.refill(s.row, ROW, s.deck, [], ctx.random); // no reshuffle: when the deck is out, the row thins
  if (!s.deck.length && !s.deckOut) {
    s.deckOut = true;
    T.flow.endAfterRound(s.flow, 1);
    log(s, 'The contract deck is empty: one more round, then the harbor closes.');
    ctx.fx({ type: 'toast', text: 'Contract deck empty — one final round!', tone: 'info' });
  }
  T.turns.rotate(s.turn);
  if (T.flow.next(s.flow) === null) { finish(s, ctx); return; }
  startRound(s, ctx);
}

function finish(s, ctx) {
  for (const p of s.players) {
    p.bonus = Math.floor((p.res.fish + p.res.timber + p.res.cloth) / 2) + Math.floor(p.res.coins / 4);
    p.final = p.vp + p.bonus; p.coinsLeft = p.res.coins;
    log(s, `${p.name}: ${p.vp} points from ${p.done.length} contracts + ${p.bonus} for leftovers = ${p.final}.`);
  }
  s.over = true;
  const r = T.score.result(s.players, { keys: ['final', 'contracts', 'coinsLeft'] });
  const names = r.winners.map((id) => P(s, id).name).join(' & ');
  ctx.fx({ type: 'banner', text: `${names} win${r.winners.length > 1 ? '' : 's'}!`, sub: `${r.ranking[0].score} points`, sound: 'win', color: P(s, r.winners[0]).color });
}

module.exports = {
  meta: {
    name: 'Harbor Workers', minPlayers: 2, maxPlayers: 4,
    description: 'Send dockhands to the pier, the yard and the loom, then fulfil shipping contracts before the harbor closes.',
  },

  setup({ players, random, fx }) {
    const n = players.length;
    const deck = random.shuffle(CONTRACTS.map((c) => c.id));
    const row = [];
    T.market.refill(row, ROW, deck, [], random);
    const s = {
      flow: T.flow.create(['place', 'resolve', 'cleanup'], { rounds: ROUNDS[n] }),
      turn: T.turns.create(players.map((p) => p.id)),
      board: T.workers.board(Object.fromEntries(SPACES.map((sp) => [sp.id, capOf(sp, n)]))),
      placed: [], queue: [], pending: [], deck, row, gone: [], takenThisRound: false, deckOut: false, over: false, log: [],
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % 4], res: { fish: 0, timber: 0, cloth: 0, coins: START_COINS }, vp: 0, done: [], contracts: 0, coinsLeft: 0, final: 0, bonus: 0 })),
    };
    startRound(s, { fx });
    return s;
  },

  moves: {
    place(s, ctx) {
      if (s.over || s.flow.phase !== 'place') return { error: 'Workers are not being placed now' };
      if (T.turns.current(s.turn) !== ctx.playerId) return { error: 'It is not your turn' };
      const space = ctx.args && ctx.args.space;
      if (typeof space !== 'string' || !SPACE[space]) return { error: 'Unknown action space' };
      if (workersLeft(s, ctx.playerId) <= 0) return { error: 'All your workers are out' };
      if (!T.workers.place(s.board, space, ctx.playerId)) return { error: `The ${SPACE[space].name} is full` };
      const p = P(s, ctx.playerId);
      s.placed.push({ playerId: p.id, space });
      log(s, `${p.name} sent a worker to the ${SPACE[space].name}.`);
      if (workersLeft(s, p.id) === 0) T.turns.pass(s.turn, p.id);
      if (T.turns.next(s.turn) === null) {
        T.flow.next(s.flow); // → resolve
        s.queue = SPACES.flatMap((sp) => s.placed.filter((x) => x.space === sp.id));
        ctx.fx({ type: 'banner', text: 'The harbor gets to work', sub: 'Spaces pay out in order', ms: 1600, color: '#2f6b48' });
        resolve(s, ctx);
      }
      return s;
    },
    choose(s, ctx) {
      if (s.over || s.flow.phase !== 'resolve') return { error: 'Nothing to decide now' };
      const choice = ctx.args && ctx.args.choice;
      const top = T.pending.top(s.pending);
      if (!top || top.playerId !== ctx.playerId) return { error: 'It is not your decision' };
      if (top.kind === 'contract' && choice !== 'skip' && !(s.row.includes(choice) && T.canPay(P(s, ctx.playerId).res, fullCost(s, choice)))) return { error: 'You cannot fulfil that contract' };
      const d = T.pending.resolve(s.pending, ctx.playerId, choice);
      if (!d) return { error: 'Not a valid choice' };
      const p = P(s, ctx.playerId);
      if (d.kind === 'stall') {
        T.add(p.res, { [choice]: 1 });
        log(s, `${p.name} at the Market Stall: +1 ${RES[choice].name}.`);
      } else if (choice === 'skip') {
        log(s, `${p.name} left the Contract Office empty-handed.`);
      } else {
        const c = BYID[choice]; const cost = fullCost(s, choice);
        T.pay(p.res, cost);
        T.market.take(s.row, s.row.indexOf(choice)); // later contracts slide down and get cheaper
        p.done.push(choice); p.vp += c.vp; p.contracts = p.done.length;
        s.takenThisRound = true;
        log(s, `${p.name} fulfilled ${c.name} for ${resText(cost)}: +${c.vp} points.`);
        ctx.fx({ type: 'toast', text: `${p.name}: ${c.name} shipped! +${c.vp}`, tone: 'good' });
        if (p.done.length >= END_CONTRACTS && !T.flow.isLastRound(s.flow)) {
          T.flow.endAfterRound(s.flow);
          log(s, `${p.name} has ${END_CONTRACTS} contracts: this is the last round.`);
          ctx.fx({ type: 'banner', text: 'Last round!', sub: `${p.name} fulfilled ${END_CONTRACTS} contracts`, color: p.color, ms: 1800 });
        }
      }
      for (const q of s.players) q.coinsLeft = q.res.coins;
      resolve(s, ctx);
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const n = s.players.length;
    const placing = !s.over && s.flow.phase === 'place';
    const myPlace = placing && me && T.turns.current(s.turn) === me.id;
    const decision = T.pending.top(s.pending);
    const myDecision = !!(decision && me && decision.playerId === me.id);
    const activeId = s.over ? null : placing ? T.turns.current(s.turn) : decision ? decision.playerId : null;
    const open = new Set(myPlace ? T.workers.available(s.board, me.id) : []);

    const zones = [
      { id: 'cdeck', layout: 'stack', at: [-31, 12], label: 'Contracts' },
      { id: 'market', layout: 'row', at: [2, 12], slots: ROW, slot: 'poker', gap: 1.2, label: 'Contract market' },
    ];
    const objects = [{ id: 'contractDeck', kind: 'deck', zone: 'cdeck', count: s.deck.length, back: BACK, showEmpty: true, tip: `${s.deck.length} contracts left` }];
    SPACES.forEach((sp, i) => {
      const at = [-20 + (i % 3) * 20, -13 + Math.floor(i / 3) * 11];
      const cap = capOf(sp, n);
      const can = open.has(sp.id);
      objects.push({ id: `space:${sp.id}`, kind: 'board', at, size: [18, 9], thickness: 0.4,
        face: { title: sp.name, text: `${sp.text}${cap ? ` · room for ${cap}` : ''}`, color: sp.color, icon: sp.icon },
        click: can ? { name: 'place', args: { space: sp.id } } : undefined, glow: can ? 'soft' : false,
        tip: `${sp.name}: ${sp.text}. ${s.board[sp.id].workers.length}/${cap || '∞'} workers` });
      zones.push({ id: `sp:${sp.id}`, layout: 'row', at: [at[0], at[1] + 1.8], gap: 0.6, label: `${i + 1}. ${sp.name}`, labelSize: 0.8 });
    });
    // workers: the k-th worker a player placed this round keeps its id, the rest wait at home
    for (const p of s.players) {
      zones.push({ id: `home:${p.id}`, seat: p.id, layout: 'row', at: [-15, 5], gap: 0.8, label: 'Dockhands' });
      zones.push({ id: `res:${p.id}`, seat: p.id, layout: 'row', at: [3, 5], gap: 1.2 });
      zones.push({ id: `done:${p.id}`, seat: p.id, layout: 'row', at: [0, -4], gap: -2.4, label: `${p.name}'s shipped contracts` });
      const mine = s.placed.filter((x) => x.playerId === p.id);
      for (let k = 0; k < WORKERS; k++) {
        const at = mine[k];
        objects.push({ id: `w:${p.id}:${k}`, kind: 'token', shape: 'meeple', color: p.color, size: 2, zone: at ? `sp:${at.space}` : `home:${p.id}`,
          order: at ? s.placed.indexOf(at) : k, tip: `${p.name}'s dockhand${at ? ` at the ${SPACE[at.space].name}` : ''}` });
      }
      RES_KEYS.forEach((k, i) => objects.push({ id: `${k}:${p.id}`, kind: 'token', shape: 'cube', color: RES[k].color, size: 1.3, count: p.res[k], zone: `res:${p.id}`, order: i, label: `${p.res[k]}`, showCount: false, tip: `${p.name}: ${p.res[k]} ${RES[k].name}` }));
      objects.push({ id: `coins:${p.id}`, kind: 'token', shape: 'coin', color: '#d4a72c', count: Math.min(p.res.coins, 15), zone: `res:${p.id}`, order: 9, label: `${p.res.coins}`, showCount: false, tip: `${p.name}: ${p.res.coins} coins` });
      p.done.forEach((id, i) => objects.push({ id, kind: 'card', zone: `done:${p.id}`, order: i, size: 'mini', face: contractFace(s, id, false) }));
    }
    s.row.forEach((id, i) => {
      if (id == null) return;
      const choosable = myDecision && decision.kind === 'contract' && decision.options.includes(id);
      objects.push({ id, kind: 'card', zone: 'market', order: i, enterFrom: 'cdeck', face: contractFace(s, id, true),
        click: choosable ? { name: 'choose', args: { choice: id } } : undefined, glow: choosable ? '#7fc97f' : undefined,
        tip: `${BYID[id].name}: ${resText(fullCost(s, id))} → ${BYID[id].vp} points` });
    });

    let prompt;
    if (s.over) {
      prompt = { type: 'col', children: [{ type: 'text', text: '⚓ The harbor is closed', bold: true, size: 'lg' },
        { type: 'scores', items: s.players.slice().sort((a, b) => b.final - a.final).map((p) => ({ label: p.name, value: p.final, color: p.color })) }] };
    } else if (myDecision && decision.kind === 'stall') {
      prompt = { type: 'col', children: [{ type: 'text', text: 'Market Stall: take one resource', bold: true },
        { type: 'row', wrap: true, children: RES_KEYS.map((k) => ({ type: 'button', label: `${RES[k].icon} ${RES[k].name}`, move: { name: 'choose', args: { choice: k } } })) }] };
    } else if (myDecision) {
      prompt = { type: 'col', children: [{ type: 'text', text: 'Contract Office: fulfil a contract (click a glowing card)', bold: true },
        ...decision.options.filter((o) => o !== 'skip').map((id) => ({ type: 'button', label: `${BYID[id].name} · ${resText(fullCost(s, id))} → ${BYID[id].vp} pts`, move: { name: 'choose', args: { choice: id } } })),
        { type: 'button', label: 'Skip', variant: 'ghost', move: { name: 'choose', args: { choice: 'skip' } } }] };
    } else if (myPlace) {
      prompt = { type: 'col', children: [{ type: 'text', text: `Place a worker (${workersLeft(s, me.id)} left) — click a glowing space`, bold: true },
        { type: 'row', wrap: true, children: SPACES.filter((sp) => open.has(sp.id)).map((sp) => ({ type: 'button', label: `${sp.icon} ${sp.name}`, move: { name: 'place', args: { space: sp.id } } })) }] };
    } else {
      prompt = { type: 'text', text: activeId ? `⏳ ${P(s, activeId).name} ${placing ? 'is placing a worker' : 'is deciding'}` : '⏳ …', muted: true };
    }
    const status = s.over ? 'Game over' : `Round ${s.flow.round}/${s.flow.lastRound}${T.flow.isLastRound(s.flow) ? ' (last)' : ''} · ${s.flow.phase}${activeId ? ` · ${P(s, activeId).name}` : ''}`;
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'sea' }, table: { surface: 'wood' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: p.id === activeId, me: !!(me && me.id === p.id), sub: `${p.vp} pts · ${p.done.length} contracts` })),
        zones, objects, camera: { preset: 'table' },
      },
      hud: {
        title: 'Harbor Workers', status, myTurn: !!(myPlace || myDecision),
        players: s.players.map((p) => ({
          id: p.id, name: p.name, color: p.color, active: p.id === activeId, me: !!(me && me.id === p.id),
          badges: !s.over && s.turn.order[s.turn.start] === p.id ? ['Start player'] : [],
          stats: [
            { label: 'Points', value: s.over ? p.final : p.vp, key: true },
            { label: 'Coins', value: p.res.coins, color: '#b8901f', key: true },
            ...RES_KEYS.map((k) => ({ label: RES[k].name, value: p.res[k], icon: RES[k].icon })),
            { label: 'Workers home', value: workersLeft(s, p.id) },
          ],
        })),
        prompt, promptTone: myPlace || myDecision ? '' : 'wait',
        promptTitle: s.over ? 'Final score' : `Round ${s.flow.round} · ${s.flow.phase}`,
        panels: [{ id: 'rules', title: 'How to play', icon: '⚓', side: 'left', open: false, node: { type: 'col', gap: 4, children: [
          { type: 'text', text: `Place ${WORKERS} dockhands, one at a time. Spaces then pay out top-left to bottom-right.`, size: 'sm' },
          { type: 'text', text: `Contracts cost their cargo plus ${PRICES.join('/')} coins by position — the oldest is the cheapest.`, size: 'sm' },
          { type: 'text', text: 'A round without a fulfilled contract: the oldest one sails away.', size: 'sm' },
          { type: 'text', text: `Game end: after round ${s.flow.lastRound}, after the round someone ships their ${END_CONTRACTS}th contract, or one round after the deck runs out.`, size: 'sm' },
          { type: 'text', text: 'Leftovers: 1 point per 2 goods and per 4 coins.', size: 'sm' },
        ] } }],
        log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.over) return null;
    return T.score.result(s.players, { keys: ['final', 'contracts', 'coinsLeft'], reason: (r) => `${r[0].name} ran the busiest quay (${r[0].score} points)` });
  },

  // balance lab: points + goods (including what this round's workers will bring in) + a contract within reach
  score(s, { playerId }) {
    const p = P(s, playerId);
    const have = incoming(s, p);
    const office = s.flow.phase === 'place' && s.board.office.workers.includes(playerId)
      ? Math.max(0, ...affordable(s, { res: have }).map((id) => BYID[id].vp)) * 0.8 : 0;
    return p.vp + office + have.coins * 0.3 + (have.fish + have.timber) * 0.6 + have.cloth * 0.9;
  },

  actions(s, { playerId }) {
    if (s.over) return [];
    if (s.flow.phase === 'resolve') return T.pending.actions(s.pending, playerId, 'choose').map((a) => ({ name: a.name, args: a.args }));
    if (s.flow.phase !== 'place' || T.turns.current(s.turn) !== playerId) return [];
    return T.workers.available(s.board, playerId).map((space) => ({ name: 'place', args: { space } }));
  },

  // aim at the best contract in the row: collect what it lacks, fulfil it when possible
  bot(s, { playerId, actions, random }) {
    const p = P(s, playerId);
    const d = T.pending.top(s.pending);
    if (d && d.playerId === playerId) {
      if (d.kind === 'contract') {
        const best = d.options.filter((o) => o !== 'skip').sort((a, b) => BYID[b].vp - BYID[a].vp)[0];
        return actions.find((a) => a.args.choice === (best || 'skip'));
      }
      const need = missing(s, p);
      const k = RES_KEYS.slice().sort((a, b) => need[b] - need[a] || (a === 'cloth' ? -1 : 1))[0];
      return actions.find((a) => a.args.choice === k);
    }
    const need = missing(s, p);
    const officeMine = s.board.office.workers.filter((x) => x === playerId).length;
    const value = {
      pier: need.fish * 3 + 0.8, yard: need.timber * 3 + 0.8, loom: need.cloth * 3.5 + 1.2,
      stall: Math.max(...RES_KEYS.map((k) => need[k])) * 2 + 0.5, customs: (p.res.coins < 3 ? 4 : 1.5),
      // goods gathered this round arrive before the office resolves, so count what is coming in
      office: officeMine === 0 && affordable(s, { res: incoming(s, p) }).length ? 9 : -1,
    };
    let best = actions[0]; let bv = -Infinity;
    for (const a of actions) { const v = (value[a.args.space] ?? 0) + random.float(); if (v > bv) { bv = v; best = a; } }
    return best;
  },

  invariants(s) {
    const e = [];
    for (const p of s.players) for (const [k, v] of Object.entries(p.res)) if (v < 0) e.push(`${p.name} has negative ${k}`);
    const seen = s.deck.length + s.row.filter((x) => x != null).length + s.gone.length + s.players.reduce((a, p) => a + p.done.length, 0);
    if (seen !== CONTRACTS.length) e.push('Contract count changed');
    for (const sp of SPACES) { const b = s.board[sp.id]; if (b.cap != null && b.workers.length > b.cap) e.push(`${sp.name} over capacity`); }
    return e;
  },
};

// what this player lacks for the best-value contract in the row (bots)
function missing(s, p) {
  const have = incoming(s, p);
  let best = null; let bv = -Infinity;
  for (const id of s.row) {
    if (id == null) continue;
    const c = fullCost(s, id);
    const gap = Object.keys(c).reduce((a, k) => a + Math.max(0, c[k] - (have[k] || 0)), 0);
    const v = BYID[id].vp - gap * 1.5;
    if (v > bv) { bv = v; best = c; }
  }
  const out = { fish: 0, timber: 0, cloth: 0 };
  if (best) for (const k of RES_KEYS) out[k] = Math.max(0, (best[k] || 0) - (have[k] || 0));
  return out;
}
// resources this player will have once this round's gathering spaces pay out
function incoming(s, p) {
  const have = clone(p.res);
  for (const x of s.placed) if (x.playerId === p.id && SPACE[x.space].gain) T.add(have, SPACE[x.space].gain);
  return have;
}

function contractFace(s, id, market) {
  const c = BYID[id];
  const pr = market ? price(s, id) : 0;
  return {
    title: c.name, subtitle: 'Shipping contract', color: '#23384a', icon: '⚓',
    chips: Object.entries(c.cost).map(([k, v]) => ({ label: `${v} ${RES[k].name}`, color: RES[k].color, icon: RES[k].icon })),
    corners: { tr: { text: String(c.vp), sub: 'pts' }, ...(market ? { tl: { text: pr ? `+${pr}` : 'free', sub: pr ? 'coins' : '' } } : {}) },
  };
}
