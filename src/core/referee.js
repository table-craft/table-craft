// The referee: plays many games with bots and reports module errors, moves that actions() offered but move()
// rejected, stuck states (nobody can move but the game has not ended), invariant violations and view/scene errors.
// Works with any loaded module (server GameModule or LocalGameModule).
import { makeRandom } from './random.js';
import { chooseBotMove } from './pace.js';
import { checkScene } from './scene.js';
import { msg } from './messages.js';

export function testPlayers(meta, n) {
  const seats = meta.seats || [];
  return Array.from({ length: n }, (_, i) => {
    const seat = seats.length ? seats[i % seats.length] : null;
    return { id: `p${i + 1}`, name: `Test ${i + 1}`, seat: seat?.id || null, team: seat?.team || null, role: seat?.role || null };
  });
}

// opts: { games=20, players, maxMoves=4000, timeLimitMs=60000, seed, content, variant, botMode: 'mixed'|'module'|'random' }
export function simulate(mod, opts = {}) {
  if (!mod.has('actions')) return { ok: false, skipped: true, error: msg('refereeSkipped') };
  const meta = mod.meta;
  const games = opts.games || 20;
  const maxMoves = opts.maxMoves || 4000;
  const deadline = Date.now() + (opts.timeLimitMs || 60000);
  const minP = Math.max(1, meta.minPlayers || 2);
  const maxP = Math.max(minP, meta.maxPlayers || minP);
  const rep = { ok: true, games: 0, finished: 0, stuck: 0, capped: 0, moves: 0, errors: [], rejected: [], invariants: [], views: [], stuckAt: [], winsBySeat: {}, byPlayers: {}, timedOut: false };
  const note = (list, item) => { if (list.length < 15) list.push(item); };
  for (let g = 0; g < games; g++) {
    if (Date.now() > deadline) { rep.timedOut = true; break; }
    const n = opts.players || (minP + (g % (maxP - minP + 1)));
    const players = testPlayers(meta, n);
    const seed = ((opts.seed || 1) + g * 7919) >>> 0;
    const bot = makeRandom(seed ^ 0x9e3779b9).api;
    let now = 1_700_000_000_000;
    let state; let rng;
    try { ({ state, rng } = mod.setup(players, seed, { content: opts.content || {}, ...(opts.variant ? { variant: opts.variant } : {}) }, now)); } catch (e) {
      note(rep.errors, { game: g, players: n, at: 'setup', error: e.message }); rep.games++; continue;
    }
    rep.games++;
    const bp = rep.byPlayers[n] = rep.byPlayers[n] || { games: 0, finished: 0, moves: 0 };
    bp.games++;
    let moves = 0; let ended = false;
    // botMode: 'module' (the module's bot) | 'random' | 'mixed' (even games bot, odd games random)
    const useBot = opts.botMode === 'random' ? false : opts.botMode === 'module' ? true : g % 2 === 0;
    const checkViews = (tag) => {
      for (const p of players) {
        try {
          const v = mod.view(state, p);
          if (!v || !v.type) note(rep.views, { game: g, at: tag, player: p.id, error: msg('viewNoTypeShort') });
          else checkScene(v).forEach((m) => note(rep.views, { game: g, at: tag, player: p.id, error: m }));
        } catch (e) { note(rep.views, { game: g, at: tag, player: p.id, error: e.message }); }
      }
    };
    checkViews('setup');
    while (moves < maxMoves) {
      let end;
      try { end = mod.endIf(state); } catch (e) { note(rep.errors, { game: g, at: 'endIf', error: e.message }); break; }
      if (end) {
        ended = true; rep.finished++; bp.finished++;
        const winners = [].concat(end.winners || (end.winner != null ? String(end.winner).split(',') : []));
        for (const w of winners) { const i = players.findIndex((p) => p.id === w || p.name === w); if (i >= 0) rep.winsBySeat[i] = (rep.winsBySeat[i] || 0) + 1; }
        break;
      }
      let movers;
      try { movers = players.map((p) => ({ p, acts: mod.actions(state, p) })).filter((x) => x.acts.some((a) => !a.free)); } catch (e) {
        note(rep.errors, { game: g, move: moves, at: 'actions', error: e.message }); break;
      }
      if (!movers.length) {
        if (state && state.$deadline) { // behave as if the sand timer ran out
          const d = state.$deadline; now = Math.max(now, d.at);
          const r = mod.move(state, d.move, { playerId: d.playerId, player: players.find((p) => p.id === d.playerId) || { id: 'system', name: msg('system') }, args: d.args, now }, rng);
          if (r.error) { note(rep.errors, { game: g, move: moves, at: `deadline ${d.move}`, error: r.error }); break; }
          ({ state, rng } = r); moves++; continue;
        }
        rep.stuck++; note(rep.stuckAt, { game: g, players: n, move: moves, phase: state && (state.phase || state.stage), hint: JSON.stringify(state && state.pending ? state.pending[0] : null)?.slice(0, 200) });
        break;
      }
      const { p } = bot.pick(movers);
      let applied = false;
      for (let attempt = 0; attempt < 4 && !applied; attempt++) {
        const choice = attempt === 0 ? chooseBotMove(mod, state, p, bot, useBot) : bot.pick(movers.find((x) => x.p === p).acts.filter((a) => !a.free));
        if (!choice) break;
        now += 1500;
        let r;
        try { r = mod.move(state, choice.name, { playerId: p.id, player: p, args: choice.args || {}, now }, rng); } catch (e) { r = { error: msg('moduleError', e.message), crashed: true }; }
        if (r.error) {
          note(r.crashed ? rep.errors : rep.rejected, { game: g, move: moves, player: p.id, phase: state.phase, name: choice.name, args: choice.args, error: r.error });
          continue;
        }
        ({ state, rng } = r); applied = true; moves++;
      }
      if (!applied) { rep.stuck++; note(rep.stuckAt, { game: g, move: moves, phase: state.phase, hint: msg('allRejected') }); break; }
      let inv = [];
      try { inv = mod.invariants(state); } catch (e) { inv = [msg('invariantsError', e.message)]; }
      if (inv.length) { note(rep.invariants, { game: g, move: moves, phase: state.phase, errors: inv.slice(0, 3) }); break; }
      if (g < 2 || moves % 40 === 0) checkViews(`move ${moves}`);
    }
    if (!ended && moves >= maxMoves) rep.capped++;
    rep.moves += moves; bp.moves += moves;
  }
  rep.avgMoves = rep.games ? Math.round(rep.moves / rep.games) : 0;
  rep.ok = !rep.errors.length && !rep.rejected.length && !rep.invariants.length && !rep.views.length && !rep.stuck;
  return rep;
}

// Human-readable report (also handy as feedback for an AI author).
export function summarize(rep) {
  if (rep.skipped) return rep.error;
  const lines = [msg('summary', rep)];
  const show = (title, list) => { if (list.length) lines.push(`${title}:`, ...list.slice(0, 6).map((x) => `  - ${JSON.stringify(x).slice(0, 400)}`)); };
  show(msg('repErrors'), rep.errors);
  show(msg('repRejected'), rep.rejected);
  show(msg('repStuck'), rep.stuckAt);
  show(msg('repInvariants'), rep.invariants);
  show(msg('repViews'), rep.views);
  return lines.join('\n');
}

// Smoke test before saving/publishing a module: setup + every player's view + scene checks (+ referee when
// actions() exists). Throws with a readable message on the first problem.
export function validate(mod, options = {}) {
  const n = Math.max(mod.meta.minPlayers || 2, Math.min(4, mod.meta.maxPlayers || 4));
  const players = testPlayers(mod.meta, n);
  const { state } = mod.setup(players, 1234, { ...options, content: options.content || {} });
  if (!state || typeof state !== 'object') throw new Error(msg('setupNoState'));
  for (const p of players) {
    const v = mod.view(state, p);
    if (!v || typeof v !== 'object' || !v.type) throw new Error(msg('viewNoType'));
    const sp = checkScene(v);
    if (sp.length) throw new Error(msg('sceneError', sp.join('; ')));
  }
  mod.endIf(state);
  if (options.requireActions && !mod.has('actions')) throw new Error(msg('needActions'));
  let referee = null;
  if (mod.has('actions') && options.simulate !== false) {
    referee = simulate(mod, { content: options.content, games: options.games || 6, timeLimitMs: options.timeLimitMs || 20000 });
    if (!referee.ok) throw new Error(msg('refereeFailed', summarize(referee)));
  }
  return { meta: mod.meta, players: players.length, tabletop: mod.view(state, players[0])?.type === 'tabletop', referee: referee && { games: referee.games, finished: referee.finished, avgMoves: referee.avgMoves } };
}
