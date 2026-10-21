// Supply Lines — a small hex-map Tablecraft game (2–4 players).
// Claim supply routes between cities with fuel, build depots for more fuel and connect the city pairs of your
// missions. Most points after 8 rounds (or when every route is taken) wins.
//
// It shows: a hex map (`layout: 'hex'` zone + `hex` tiles with terrain), pieces on cells (depots), on corners (cities)
// and links between them (routes, clickable to claim), tile clicks for placement, and the T.hex / T.findPath helpers.

const ROUNDS = 8;
const ACTIONS = 2;
const COLORS = ['#d8453b', '#3d7fd0', '#e3b62f', '#5aa65a'];
const NAMES = ['Aksa', 'Brivo', 'Morva', 'Karsos', 'Kovan', 'Oskel', 'Pirin', 'Tavra', 'Lazra', 'Esvar', 'Nuran'];
const LAND = ['plains', 'plains', 'plains', 'forest', 'forest', 'hills', 'desert', 'mountain'];

const P = (s, id) => s.players.find((p) => p.id === id);
const cur = (s) => s.players[s.turn];
function log(s, t) { s.log.push(`R${s.round} · ${t}`); if (s.log.length > 60) s.log.shift(); }

// position of a hex corner on a unit pointy grid (only used to measure distances between cities)
function cornerPos(v) {
  const [q, r, c] = v.split(',').map(Number);
  const a = ((60 * c - 30) * Math.PI) / 180;
  return [Math.sqrt(3) * (q + r / 2) + Math.cos(a), 1.5 * r + Math.sin(a)];
}
const dist = (a, b) => { const [x1, z1] = cornerPos(a); const [x2, z2] = cornerPos(b); return Math.hypot(x1 - x2, z1 - z2); };

function buildMap(random) {
  const cells = {};
  for (const k of T.hex.area('0,0', 3)) {
    const edge = T.hex.distance(k, '0,0') === 3;
    cells[k] = edge && random.float() < 0.55 ? 'sea' : random.pick(LAND);
  }
  // cities on land corners, spread out: each new city is the corner farthest from the ones already placed
  const land = Object.keys(cells).filter((k) => cells[k] !== 'sea' && cells[k] !== 'mountain');
  const corners = [...new Set(land.flatMap((k) => T.hex.corners(k)))];
  const cities = [random.pick(corners)];
  while (cities.length < 9) {
    let best = null, bd = -1;
    for (const v of corners) { const d = Math.min(...cities.map((c) => dist(c, v))); if (d > bd) { bd = d; best = v; } }
    cities.push(best);
  }
  // routes: every city to its three nearest neighbours; longer routes cost more fuel
  const routes = {};
  cities.forEach((a) => {
    cities.filter((b) => b !== a).sort((x, y) => dist(a, x) - dist(a, y)).slice(0, 3).forEach((b) => {
      const id = [a, b].sort().join('|');
      if (!routes[id]) routes[id] = { id, a: [a, b].sort()[0], b: [a, b].sort()[1], cost: Math.max(1, Math.min(4, Math.round(dist(a, b) / 1.2))), owner: null };
    });
  });
  return { cells, cities: Object.fromEntries(cities.map((v, i) => [v, NAMES[i]])), routes };
}

// my network: cities joined by routes I own
const myNext = (s, pid) => (c) => Object.values(s.routes).filter((r) => r.owner === pid && (r.a === c || r.b === c)).map((r) => (r.a === c ? r.b : r.a));
const anyNext = (s) => (c) => Object.values(s.routes).filter((r) => r.a === c || r.b === c).map((r) => [r.a === c ? r.b : r.a, r.owner ? 99 : r.cost]);
const myCities = (s, pid) => new Set(Object.values(s.routes).filter((r) => r.owner === pid).flatMap((r) => [r.a, r.b]));
// a depot goes on a free land cell that touches one of my cities
function depotCells(s, pid) {
  const mine = myCities(s, pid);
  return Object.keys(s.cells).filter((k) => s.cells[k] !== 'sea' && !s.depots[k] && T.hex.corners(k).some((v) => mine.has(v)));
}
function drawMission(s, p) {
  p.mission = s.missions.shift() || null;
}
function checkMissions(s, p, ctx) {
  while (p.mission && T.findPath(p.mission.a, p.mission.b, myNext(s, p.id))) {
    p.score += p.mission.pts;
    log(s, `${p.name} completed the ${s.cities[p.mission.a]} → ${s.cities[p.mission.b]} mission (+${p.mission.pts}).`);
    ctx.fx({ type: 'toast', text: `${p.name}: supply line ${s.cities[p.mission.a]} → ${s.cities[p.mission.b]} open! +${p.mission.pts}`, tone: 'good' });
    drawMission(s, p);
  }
}
function endGame(s, ctx) {
  const best = Math.max(...s.players.map((p) => p.score));
  s.winners = s.players.filter((p) => p.score === best).map((p) => p.id);
  log(s, `Game over — ${s.winners.map((id) => P(s, id).name).join(' & ')} win${s.winners.length > 1 ? '' : 's'} with ${best} points.`);
  ctx.fx({ type: 'banner', text: `${s.winners.map((id) => P(s, id).name).join(' & ')} win${s.winners.length > 1 ? '' : 's'}!`, sub: `${best} points`, sound: 'win' });
}
function needTurn(s, ctx) {
  if (s.winners) return 'The game is over';
  if (cur(s).id !== ctx.playerId) return 'It is not your turn';
  if (s.left <= 0) return 'No actions left — end your turn';
  return null;
}

module.exports = {
  meta: { name: 'Supply Lines', minPlayers: 2, maxPlayers: 4, description: 'Claim routes across a hex map, build depots and connect your mission cities.' },

  setup({ players, random, fx }) {
    const map = buildMap(random);
    const pairs = [];
    const cs = Object.keys(map.cities);
    cs.forEach((a, i) => cs.slice(i + 1).forEach((b) => { const d = dist(a, b); if (d > 2.5) pairs.push({ a, b, pts: Math.round(d) }); }));
    const s = {
      ...map, depots: {}, missions: random.shuffle(pairs),
      players: players.map((p, i) => ({ id: p.id, name: p.name, color: COLORS[i % 4], fuel: 3 + i, score: 0, mission: null })),
      turn: 0, round: 1, left: ACTIONS, log: [], winners: null,
    };
    s.players.forEach((p) => drawMission(s, p));
    log(s, '— Round 1 —');
    fx({ type: 'banner', text: 'Supply Lines', sub: `${s.players[0].name} goes first`, sound: 'gong' });
    return s;
  },

  moves: {
    claim(s, ctx) {
      const err = needTurn(s, ctx); if (err) return { error: err };
      const r = s.routes[ctx.args.route]; const p = cur(s);
      if (!r) return { error: 'Unknown route' };
      if (r.owner) return { error: 'That route is already taken' };
      if (p.fuel < r.cost) return { error: `You need ${r.cost} fuel` };
      p.fuel -= r.cost; r.owner = p.id; s.left -= 1;
      log(s, `${p.name} claimed ${s.cities[r.a]} – ${s.cities[r.b]} for ${r.cost} fuel.`);
      ctx.fx({ type: 'highlight', ids: [`route:${r.id}`], color: p.color });
      checkMissions(s, p, ctx);
      return s;
    },
    depot(s, ctx) {
      const err = needTurn(s, ctx); if (err) return { error: err };
      const p = cur(s); const cell = T.hex.key(ctx.args.cell);
      if (!depotCells(s, p.id).includes(cell)) return { error: 'Depots go on a free land hex next to one of your cities' };
      if (p.fuel < 2) return { error: 'A depot costs 2 fuel' };
      p.fuel -= 2; s.depots[cell] = p.id; s.left -= 1;
      log(s, `${p.name} built a depot (+1 fuel per turn).`);
      return s;
    },
    endTurn(s, ctx) {
      if (s.winners) return { error: 'The game is over' };
      if (cur(s).id !== ctx.playerId) return { error: 'It is not your turn' };
      const p = cur(s);
      const income = 2 + Object.values(s.depots).filter((o) => o === p.id).length;
      p.fuel += income;
      log(s, `${p.name} ended the turn and refuelled (+${income}).`);
      s.turn = T.nextIndex(s.players.length, s.turn); s.left = ACTIONS;
      if (s.turn === 0) { s.round += 1; if (s.round <= ROUNDS) log(s, `— Round ${s.round} —`); }
      if (s.round > ROUNDS || Object.values(s.routes).every((r) => r.owner)) endGame(s, ctx);
      return s;
    },
  },

  view(s, { playerId }) {
    const me = P(s, playerId);
    const myTurn = !!(me && cur(s) === me && !s.winners && s.left > 0);
    const claimable = (r) => myTurn && !r.owner && me.fuel >= r.cost;
    const depotOk = new Set(myTurn && me.fuel >= 2 ? depotCells(s, me.id) : []);
    const goal = me && me.mission ? [me.mission.a, me.mission.b] : [];
    const zones = [{ id: 'map', layout: 'hex', hex: 5, label: 'Front' }];
    const objects = [];
    for (const [k, terrain] of Object.entries(s.cells)) {
      objects.push({ id: `hex:${k}`, kind: 'hex', zone: 'map', cell: k, terrain, tip: depotOk.has(k) ? 'Build a depot here (2 fuel)' : terrain,
        click: depotOk.has(k) ? { name: 'depot', args: { cell: k } } : undefined, glow: depotOk.has(k) ? 'soft' : false });
    }
    for (const [v, name] of Object.entries(s.cities)) {
      objects.push({ id: `city:${v}`, kind: 'token', shape: 'cylinder', size: 1.6, color: goal.includes(v) ? '#f2c14e' : '#d9dde2', material: 'metal', zone: 'map', vertex: v, label: name, glow: goal.includes(v) ? '#f2c14e' : undefined, tip: name });
    }
    for (const r of Object.values(s.routes)) {
      const o = r.owner && P(s, r.owner);
      objects.push({ id: `route:${r.id}`, kind: 'link', from: `city:${r.a}`, to: `city:${r.b}`, segments: r.cost, color: o ? o.color : '#f1ede4', ghost: !o,
        tip: o ? `${s.cities[r.a]} – ${s.cities[r.b]}: ${o.name}` : `${s.cities[r.a]} – ${s.cities[r.b]}: ${r.cost} fuel`,
        click: claimable(r) ? { name: 'claim', args: { route: r.id } } : undefined });
    }
    for (const [k, pid] of Object.entries(s.depots)) objects.push({ id: `depot:${k}`, kind: 'token', shape: 'house', size: 1.8, color: P(s, pid).color, zone: 'map', cell: k, tip: `${P(s, pid).name}'s depot` });
    for (const p of s.players) {
      zones.push({ id: `fuel:${p.id}`, seat: p.id, layout: 'row', at: [0, 0] });
      objects.push({ id: `fuel-stack:${p.id}`, kind: 'token', shape: 'coin', color: '#3b3f45', count: Math.min(p.fuel, 12), zone: `fuel:${p.id}`, label: `${p.fuel} fuel`, showCount: false, tip: `${p.name}: ${p.fuel} fuel` });
    }
    const mission = me && me.mission ? `Mission: ${s.cities[me.mission.a]} → ${s.cities[me.mission.b]} (${me.mission.pts} pts)` : 'No mission left';
    const prompt = s.winners
      ? { type: 'text', text: `🏆 ${s.winners.map((id) => P(s, id).name).join(' & ')} win!`, size: 'lg', bold: true }
      : me && cur(s) === me
        ? { type: 'col', children: [
          { type: 'text', text: s.left ? `${s.left} action${s.left > 1 ? 's' : ''} left: click a route to claim it, or a glowing hex for a depot.` : 'No actions left.', bold: true },
          { type: 'text', text: mission, muted: true },
          { type: 'button', label: 'End turn', move: { name: 'endTurn' } }] }
        : { type: 'col', children: [{ type: 'text', text: `⏳ ${cur(s).name} is playing`, muted: true }, { type: 'text', text: mission, muted: true }] };
    return {
      type: 'tabletop',
      scene: {
        env: { preset: 'night' }, table: { surface: 'dark' },
        seats: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !s.winners, me: !!(me && me.id === p.id), sub: `${p.score} pts` })),
        zones, objects, camera: { preset: 'top' },
      },
      hud: {
        title: 'Supply Lines', status: s.winners ? 'Game over' : `Round ${Math.min(s.round, ROUNDS)}/${ROUNDS} · ${cur(s).name}`,
        players: s.players.map((p) => ({ id: p.id, name: p.name, color: p.color, active: cur(s) === p && !s.winners, me: !!(me && me.id === p.id),
          stats: [{ label: 'Points', value: p.score, key: true }, { label: 'Fuel', value: p.fuel, key: true }, { label: 'Depots', value: Object.values(s.depots).filter((o) => o === p.id).length }] })),
        prompt, promptTone: myTurn ? '' : 'wait', log: s.log.slice(-40),
      },
    };
  },

  endIf(s) {
    if (!s.winners) return null;
    const ranking = s.players.slice().sort((a, b) => b.score - a.score).map((p, i) => ({ id: p.id, name: p.name, score: p.score, place: i + 1 }));
    return { winners: s.winners, reason: 'Most points', ranking };
  },

  score(s, { playerId }) {
    const p = P(s, playerId);
    return p.score + p.fuel * 0.2 + myCities(s, p.id).size * 0.3;
  },

  actions(s, { playerId }) {
    if (s.winners || cur(s).id !== playerId) return [];
    const p = cur(s);
    const out = [{ name: 'endTurn' }];
    if (s.left <= 0) return out;
    for (const r of Object.values(s.routes)) if (!r.owner && p.fuel >= r.cost) out.push({ name: 'claim', args: { route: r.id } });
    if (p.fuel >= 2) for (const k of depotCells(s, p.id)) out.push({ name: 'depot', args: { cell: k } });
    return out;
  },

  // claim the next free route on the cheapest path for my mission; otherwise build a depot; otherwise pass
  bot(s, { playerId, actions, random }) {
    const p = P(s, playerId);
    if (p.mission) {
      const path = T.findPath(p.mission.a, p.mission.b, (c) => anyNext(s)(c).filter(([n]) => {
        const r = s.routes[[c, n].sort().join('|')]; return !r.owner || r.owner === p.id;
      }).map(([n, cost]) => [n, s.routes[[c, n].sort().join('|')].owner ? 0 : cost]));
      if (path) for (let i = 1; i < path.path.length; i++) {
        const id = [path.path[i - 1], path.path[i]].sort().join('|');
        const a = actions.find((x) => x.name === 'claim' && x.args.route === id);
        if (a) return a;
      }
    }
    const depots = actions.filter((a) => a.name === 'depot');
    if (depots.length && random.float() < 0.5) return random.pick(depots);
    const claims = actions.filter((a) => a.name === 'claim');
    if (claims.length && random.float() < 0.3) return random.pick(claims);
    return actions.find((a) => a.name === 'endTurn');
  },

  invariants(s) {
    const e = [];
    s.players.forEach((p) => { if (p.fuel < 0) e.push(`${p.name} has negative fuel`); });
    for (const k of Object.keys(s.depots)) if (s.cells[k] === 'sea') e.push('Depot at sea');
    return e;
  },
};
