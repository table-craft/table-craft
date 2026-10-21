// The balance lab: plays many complete games with bot profiles and measures what the referee does not — seat and
// first-player advantage, game length, forced decisions, lead changes, comebacks and dominant strategies.
// Isomorphic: pass a loaded module (server GameModule or browser LocalGameModule). Deterministic for a given seed.
import { makeRandom } from './random.js';
import { chooseBotMove } from './pace.js';
import { testPlayers } from './referee.js';

export const BOT_PROFILES = ['module', 'random', 'greedy'];
const GREEDY_SAMPLE = 24; // candidate actions evaluated per greedy decision

const round = (x, d = 3) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))] : null);

// Picks a move for `p` with the given profile → { name, args, applied?: { state, rng, fx } } | null
function choose(mod, profile, state, p, rand, rng, now, hasScore) {
  const acts = mod.actions(state, p) || [];
  const main = acts.filter((a) => !a.free);
  if (!main.length) return null;
  if (profile === 'random') { const a = rand.pick(main); return { name: a.name, args: a.args || {} }; }
  if (profile === 'greedy' && hasScore) {
    const pool = main.length > GREEDY_SAMPLE ? rand.shuffle(main).slice(0, GREEDY_SAMPLE) : main;
    let best = null;
    for (const a of pool) {
      const r = mod.move(state, a.name, { playerId: p.id, player: p, args: a.args || {}, now }, rng);
      if (r.error) continue;
      const v = mod.score(r.state, p) ?? -Infinity;
      if (!best || v > best.v || (v === best.v && rand.float() < 0.5)) best = { v, a, r };
    }
    if (best) return { name: best.a.name, args: best.a.args || {}, applied: best.r };
  }
  return chooseBotMove(mod, state, p, rand, true);
}

function winnersOf(end, players) {
  const ids = [].concat(end.winners || (end.winner != null ? String(end.winner).split(',') : []));
  return [...new Set(ids.map((w) => players.findIndex((p) => p.id === w || p.name === w)).filter((i) => i >= 0))];
}

// opts: { games=200, players, botMix=['module'], seed=1, content, variant, options, maxMoves=4000, timeLimitMs=60000 }
export function analyzeBalance(mod, opts = {}) {
  if (!mod.has('actions')) throw new Error('The balance lab needs actions() to play games with bots.');
  const { games = 200, players, botMix = ['module'], seed = 1, content = {}, variant, options = {}, maxMoves = 4000, timeLimitMs = 60000 } = opts;
  const mix = botMix.length ? botMix : ['module'];
  for (const b of mix) if (!BOT_PROFILES.includes(b)) throw new Error(`Unknown bot profile "${b}" (use ${BOT_PROFILES.join(', ')})`);
  const meta = mod.meta || {};
  const minP = Math.max(1, meta.minPlayers || 2);
  const maxP = Math.max(minP, meta.maxPlayers || minP);
  const hasScore = mod.has('score');
  const deadline = Date.now() + timeLimitMs;

  const per = {}; // player count → aggregates
  const lengths = []; const profileWins = {}; const profileSeats = {};
  let played = 0, finished = 0, ties = 0, choices = 0, decisions = 0, forced = 0, errors = 0, timedOut = false;
  let leadChanges = 0, scoredGames = 0, comebacks = 0, comebackGames = 0;

  for (let g = 0; g < games; g++) {
    if (Date.now() > deadline) { timedOut = true; break; }
    const n = players || (minP + (g % (maxP - minP + 1)));
    const ps = testPlayers(meta, n);
    const k = per[n]?.games || 0; // rotate per player count, so every profile sits in every seat equally often
    const profiles = ps.map((_, i) => mix[(i + k) % mix.length]);
    const rand = makeRandom(((seed * 2654435761) ^ (g * 7919)) >>> 0).api;
    let now = 1_700_000_000_000;
    let state; let rng;
    try { ({ state, rng } = mod.setup(ps, (seed + g * 7919) >>> 0, { content, ...(variant ? { variant } : {}), ...options }, now)); } catch { errors++; played++; continue; }
    played++;
    const pc = per[n] = per[n] || { games: 0, finished: 0, credit: Array(n).fill(0), moves: 0 };
    pc.games++;
    let moves = 0; let end = null; const leaders = [];
    while (moves < maxMoves) {
      try { end = mod.endIf(state); } catch { errors++; break; }
      if (end) break;
      if (hasScore) {
        const sc = ps.map((p) => mod.score(state, p) ?? 0);
        const top = Math.max(...sc);
        const lead = sc.filter((x) => x === top).length === 1 ? sc.indexOf(top) : null;
        if (lead != null && leaders.length && leaders[leaders.length - 1] != null && leaders[leaders.length - 1] !== lead) leadChanges++;
        leaders.push(lead ?? (leaders.length ? leaders[leaders.length - 1] : null));
      }
      const movers = ps.map((p, i) => ({ p, i, n: (mod.actions(state, p) || []).filter((a) => !a.free).length })).filter((x) => x.n > 0);
      if (!movers.length) {
        const d = state && state.$deadline;
        if (!d) break; // stuck — the referee reports these
        now = Math.max(now, d.at);
        const r = mod.move(state, d.move, { playerId: d.playerId, player: ps.find((p) => p.id === d.playerId) || { id: 'system', name: 'System' }, args: d.args, now }, rng);
        if (r.error) { errors++; break; }
        ({ state, rng } = r); moves++; continue;
      }
      const m = rand.pick(movers);
      decisions++; choices += m.n; if (m.n === 1) forced++;
      now += 1500;
      const c = choose(mod, profiles[m.i], state, m.p, rand, rng, now, hasScore);
      if (!c) break;
      const r = c.applied || mod.move(state, c.name, { playerId: m.p.id, player: m.p, args: c.args, now }, rng);
      if (r.error) { errors++; break; }
      ({ state, rng } = r); moves++;
    }
    pc.moves += moves;
    if (!end) continue;
    finished++; pc.finished++; lengths.push(moves);
    const w = winnersOf(end, ps);
    if (w.length > 1) ties++;
    for (const i of w) {
      pc.credit[i] += 1 / w.length;
      profileWins[profiles[i]] = (profileWins[profiles[i]] || 0) + 1 / w.length;
    }
    profiles.forEach((pr) => { profileSeats[pr] = (profileSeats[pr] || 0) + 1; });
    if (hasScore && leaders.length) {
      scoredGames++;
      const at = leaders[Math.floor((leaders.length - 1) * (2 / 3))];
      if (w.length === 1 && at != null) { comebackGames++; if (at !== w[0]) comebacks++; }
    }
  }

  // seat win rates: overall (by seat index, over games where the seat existed) and per player count
  const seatCredit = {}; const seatGames = {};
  const byPlayers = {};
  let fpaSum = 0, fpaWeight = 0, fpaVar = 0;
  for (const [n, pc] of Object.entries(per)) {
    const rates = {};
    pc.credit.forEach((c, i) => {
      rates[i] = pc.finished ? round(c / pc.finished) : null;
      seatCredit[i] = (seatCredit[i] || 0) + c; seatGames[i] = (seatGames[i] || 0) + pc.finished;
    });
    const fpa = pc.finished && Number(n) > 1 ? pc.credit[0] / pc.finished - 1 / Number(n) : null; // solo: no seat order
    if (fpa != null) { fpaSum += fpa * pc.finished; fpaWeight += pc.finished; fpaVar += (1 / Number(n)) * (1 - 1 / Number(n)) * pc.finished; }
    byPlayers[n] = { games: pc.games, finished: pc.finished, seatWinRate: rates, avgMoves: round(pc.moves / Math.max(1, pc.games), 1), firstPlayerAdvantage: round(fpa) };
  }
  const seatWinRate = Object.fromEntries(Object.keys(seatCredit).map((i) => [i, seatGames[i] ? round(seatCredit[i] / seatGames[i]) : null]));
  const sorted = lengths.slice().sort((a, b) => a - b);
  // per profile: wins ÷ seats it played in finished games (fair share is 1 / player count)
  const strategies = new Set(mix).size > 1 ? Object.fromEntries([...new Set(mix)].map((pr) => [pr, profileSeats[pr] ? round((profileWins[pr] || 0) / profileSeats[pr]) : null])) : null;

  const report = {
    games: played, finished, timedOut,
    length: { avgMoves: round(lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length), 1), medianMoves: quantile(sorted, 0.5), p10Moves: quantile(sorted, 0.1), p90Moves: quantile(sorted, 0.9) },
    seatWinRate,
    firstPlayerAdvantage: fpaWeight ? round(fpaSum / fpaWeight) : null,
    firstPlayerAdvantageSE: fpaWeight ? round(Math.sqrt(fpaVar) / fpaWeight) : null, // standard error under fair play
    tieRate: finished ? round(ties / finished) : null,
    decisions: { avgChoices: decisions ? round(choices / decisions, 2) : null, forcedRate: decisions ? round(forced / decisions) : null },
    leadChanges: hasScore && scoredGames ? round(leadChanges / scoredGames, 2) : null,
    comebackRate: hasScore && comebackGames ? round(comebacks / comebackGames) : null,
    strategies,
    byPlayers,
    errors,
    warnings: [],
  };
  report.warnings = warningsFor(report, new Set(mix).size);
  return report;
}

// Seat warnings must be both large and statistically clear (beyond ~2.5 standard errors of a fair game), so small
// samples do not cry wolf. With mixed bot profiles seat results are confounded by who sat where, so they are skipped.
function warningsFor(r, profiles) {
  const out = [];
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  if (r.finished < r.games) out.push({ code: 'unfinished', severity: 'warn', message: `${r.games - r.finished} of ${r.games} games did not finish (stuck, errors or move cap) — run the referee` });
  if (r.timedOut) out.push({ code: 'timed_out', severity: 'info', message: 'stopped early at the time limit; fewer games than requested' });
  if (r.firstPlayerAdvantage != null) {
    const a = Math.abs(r.firstPlayerAdvantage);
    const clear = a > 2.5 * (r.firstPlayerAdvantageSE || 0);
    if (a > 0.08 && clear) out.push({ code: 'first_player_advantage', severity: 'warn', message: `first player wins ${r.firstPlayerAdvantage > 0 ? 'more' : 'less'} than a fair share by ${pct(a)}` });
    else if (a > 0.04 && clear) out.push({ code: 'first_player_advantage', severity: 'info', message: `first-player ${r.firstPlayerAdvantage > 0 ? 'advantage' : 'disadvantage'} of ${pct(a)} — watch it in playtests` });
  }
  for (const [n, b] of profiles > 1 ? [] : Object.entries(r.byPlayers)) {
    const fair = 1 / Number(n); const se = Math.sqrt(fair * (1 - fair) / Math.max(1, b.finished));
    for (const [seat, rate] of Object.entries(b.seatWinRate)) {
      if (rate != null && Number(n) > 1 && b.finished >= 20 && Math.abs(rate - fair) > Math.max(0.1, 2.5 * se)) out.push({ code: 'seat_imbalance', severity: 'warn', message: `with ${n} players seat ${Number(seat) + 1} wins ${pct(rate)} (fair share ${pct(1 / Number(n))})` });
    }
  }
  if (r.decisions.forcedRate != null && r.decisions.forcedRate > 0.4) out.push({ code: 'forced_decisions', severity: 'warn', message: `${pct(r.decisions.forcedRate)} of decisions offer only one option — players may feel on rails` });
  if (r.length.medianMoves && r.length.p90Moves > 3 * r.length.medianMoves) out.push({ code: 'long_tail', severity: 'warn', message: `game length has a long tail: 90th percentile ${r.length.p90Moves} moves vs median ${r.length.medianMoves}` });
  if (r.tieRate != null && r.tieRate > 0.15) out.push({ code: 'many_ties', severity: 'info', message: `${pct(r.tieRate)} of games end in a tie — consider a tie-breaker` });
  if (r.strategies && profiles > 1) {
    // "random" is a baseline, not a strategy: beating it shows that decisions matter; matching it shows luck dominates
    const real = Object.entries(r.strategies).filter(([pr, v]) => pr !== 'random' && v != null);
    const rnd = r.strategies.random;
    if (real.length > 1) {
      for (const [pr, rate] of real) if (rate > 0.65) out.push({ code: 'dominant_strategy', severity: 'warn', message: `"${pr}" bots win ${pct(rate)} of their games — a dominant strategy may exist` });
    }
    if (rnd != null) {
      for (const [pr, rate] of real) {
        if (rate - rnd < 0.05) out.push({ code: 'luck_dominates', severity: 'warn', message: `random play wins about as often as "${pr}" bots (${pct(rnd)} vs ${pct(rate)}) — decisions may not matter much` });
        else out.push({ code: 'skill_matters', severity: 'info', message: `"${pr}" bots beat random play (${pct(rate)} vs ${pct(rnd)}) — decisions matter` });
      }
    }
  }
  if (r.comebackRate != null && r.comebackRate < 0.1) out.push({ code: 'no_comebacks', severity: 'info', message: `only ${pct(r.comebackRate)} of games are won by a player who was not leading at two thirds — the leader rarely loses` });
  if (r.errors) out.push({ code: 'errors', severity: 'warn', message: `${r.errors} module error(s) or rejected bot moves — run the referee` });
  return out;
}

// ---------------------------------------------------------------- parameter sweeps
function setPath(root, dotted, value) {
  const keys = dotted.split('.');
  let o = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

// path: 'content.cards.0.n' or 'options.target' — set per run, everything else equal → [{ value, report }]
// analyze options for one sweep point (copies content/options, sets the dotted path)
export function sweepPoint(opts, path, value) {
  if (!path || !/^(content|options)\./.test(path)) throw new Error('path must start with "content." or "options."');
  const bag = { content: JSON.parse(JSON.stringify(opts.content || {})), options: JSON.parse(JSON.stringify(opts.options || {})) };
  setPath(bag, path, value);
  return { ...opts, content: bag.content, options: bag.options };
}

export function sweepParameter(mod, { path, values = [], ...opts } = {}) {
  return values.map((value) => ({ value, report: analyzeBalance(mod, sweepPoint(opts, path, value)) }));
}

// ---------------------------------------------------------------- comparing two reports (versions, sweep points)
const METRICS = [
  ['firstPlayerAdvantage', (r) => r.firstPlayerAdvantage],
  ['finishedRate', (r) => (r.games ? r.finished / r.games : null)],
  ['tieRate', (r) => r.tieRate],
  ['length.avgMoves', (r) => r.length?.avgMoves],
  ['length.medianMoves', (r) => r.length?.medianMoves],
  ['length.p90Moves', (r) => r.length?.p90Moves],
  ['decisions.avgChoices', (r) => r.decisions?.avgChoices],
  ['decisions.forcedRate', (r) => r.decisions?.forcedRate],
  ['leadChanges', (r) => r.leadChanges],
  ['comebackRate', (r) => r.comebackRate],
];

export function compareReports(a, b) {
  const out = [];
  const push = (metric, before, after) => out.push({ metric, before: before ?? null, after: after ?? null, delta: before != null && after != null ? round(after - before) : null });
  for (const [m, get] of METRICS) push(m, get(a || {}), get(b || {}));
  const seats = new Set([...Object.keys(a?.seatWinRate || {}), ...Object.keys(b?.seatWinRate || {})]);
  for (const s of seats) push(`seatWinRate.${s}`, a?.seatWinRate?.[s], b?.seatWinRate?.[s]);
  return out;
}
