// Play a game entirely in the browser — no server. You + bots, same rules runtime, same pacing as online rooms.
//
//   const match = createLocalMatch({ source, players: ['You', 'bot', 'bot'] });
//   <Tabletop {...useMatch(match).tableProps} />   // or <TablecraftGame client={match} />
//
// Returns a MatchClient (see docs/client.md): subscribe(), getSnapshot(), move(), start(), addBot(), setPace()...
// plus record() — the replay record of the current game (feed it to createReplay with the same source).
import { LocalGameModule } from './local-module.js';
import { Match } from '../core/match.js';
import { botDelay, visibleFx } from '../core/pace.js';
import { randomSeed } from '../core/random.js';

export function createLocalMatch({ source, module, content = {}, options = {}, players = ['You', 'bot'], seed = randomSeed(), pace = 'normal', assets = {}, autoStart = true, playerId = 'you' } = {}) {
  const mod = module || new LocalGameModule(source);
  const match = new Match(mod, { seed, content, options, pace });
  const listeners = new Set();
  let seq = 0;
  let snap = null;
  const timers = { bot: null, deadline: null };

  players.forEach((p, i) => {
    const spec = typeof p === 'string' ? (p === 'bot' ? { bot: true } : { name: p }) : p;
    if (spec.bot) match.addBot(spec.seat ?? null);
    else match.join(i === 0 ? playerId : spec.id || `local_${i}`, { name: spec.name, seat: spec.seat ?? match.seats[i % (match.seats.length || 1)]?.id ?? null });
  });

  function publish(fx = []) {
    const list = visibleFx(fx, playerId);
    snap = { ...match.snapshot(playerId), code: 'LOCAL', assets, local: true, fx: list.length ? { seq: ++seq, list } : null, serverOffset: 0 };
    listeners.forEach((fn) => fn(snap));
  }

  function schedule(fx) {
    clearTimeout(timers.bot); clearTimeout(timers.deadline);
    if (match.status !== 'playing') return;
    if (match.hasBots()) {
      timers.bot = setTimeout(() => { const r = match.nextBot(); if (r) { publish(r.fx); schedule(r.fx); } }, botDelay(match.pace, fx));
    }
    const d = match.deadline();
    if (d) {
      timers.deadline = setTimeout(() => {
        let out = null;
        try { out = match.applyDeadline(); } catch { return; }
        if (out) { publish(out); schedule(out); }
      }, Math.max(0, d.at - Date.now()) + 50);
    }
  }

  const act = (fn) => {
    try { const fx = fn() || []; publish(fx); schedule(fx); return Promise.resolve({ ok: true }); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
  };

  if (autoStart) { const fx = match.start(); publish(fx); schedule(fx); } else publish();

  return {
    playerId,
    match,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => snap,
    move: (name, args) => act(() => match.move(playerId, name, args)),
    join: (seat, name) => act(() => { match.join(playerId, { seat, name }); }),
    leave: () => act(() => { match.leave(playerId); }),
    addBot: (seat) => act(() => { match.addBot(seat); }),
    removeBot: (id) => act(() => { match.removeBot(id); }),
    start: () => act(() => match.start()),
    restart: () => act(() => { match.restart(); }),
    setPace: (p) => act(() => { match.setPace(p); }),
    // replay record { seed, players, options, moves, startedAt } for createReplay(); null before the game starts
    record: () => match.record(),
    dispose() { clearTimeout(timers.bot); clearTimeout(timers.deadline); listeners.clear(); },
  };
}
