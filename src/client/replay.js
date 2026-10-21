// Watch a recorded game again — any player's point of view, step by step or at speed.
//
//   const replay = createReplay({ source, seed, players, options, moves, viewer: 'p1' });
//   <ReplayViewer replay={replay} />          // or <Tabletop {...useMatch(replay).tableProps} />
//
// It is a MatchClient (subscribe/getSnapshot) with transport controls: play, pause, step, seek, setViewer, setSpeed.
import { LocalGameModule } from './local-module.js';
import { replayMatch, describeMove } from '../core/replay.js';
import { visibleFx } from '../core/pace.js';

const SPECTATOR = { id: 'spectator', name: 'Spectator', role: 'spectator' };

export function createReplay({ source, module, seed, players = [], options = {}, moves = [], startedAt, viewer, assets = {}, meta } = {}) {
  const mod = module || new LocalGameModule(source);
  const run = replayMatch(mod, { seed, players, options, moves, startedAt });
  const { frames } = run;
  const listeners = new Set();
  let index = 0; let viewerId = viewer || players[0]?.id || 'spectator';
  let speed = 1; let timer = null; let playing = false; let seq = 0; let snap = null;

  const viewerPlayer = () => players.find((p) => p.id === viewerId) || SPECTATOR;
  const timeline = frames.map((f) => ({
    index: f.index, label: f.move ? describeMove(f.move, players) : 'setup', rejected: f.rejected,
    banner: (f.fx || []).find((e) => e.type === 'banner')?.text || null, at: f.at,
  }));

  function publish(fxFrame) {
    const f = frames[index];
    if (!f) { snap = { status: 'error', error: run.error || 'empty replay' }; listeners.forEach((fn) => fn(snap)); return; }
    let view = null; let viewError = null;
    try { view = mod.view(f.state, viewerPlayer()); } catch (e) { viewError = e.message; }
    const list = fxFrame ? visibleFx(fxFrame.fx, viewerId) : [];
    snap = {
      status: f.result ? 'finished' : 'playing', replay: true, code: 'REPLAY', players, host: null, meta: meta || mod.meta,
      you: players.find((p) => p.id === viewerId) || null, view, viewError, result: f.result || null, assets, canBots: false,
      fx: list.length ? { seq: `r${++seq}`, list } : null,
      serverOffset: (f.at || Date.now()) - Date.now(), // sand timers show the time of that moment
      index, length: frames.length, playing, speed, viewer: viewerId, frame: timeline[index], timeline, ok: run.ok, error: run.error,
    };
    listeners.forEach((fn) => fn(snap));
  }

  const clamp = (i) => Math.max(0, Math.min(frames.length - 1, i));
  function go(i, withFx) {
    const next = clamp(i);
    const forwardOne = next === index + 1;
    index = next;
    publish(withFx !== false && forwardOne ? frames[index] : null); // fx only when moving forward one move
  }
  function tick() {
    clearTimeout(timer);
    if (!playing) return;
    if (index >= frames.length - 1) { playing = false; publish(null); return; }
    const gap = (frames[index + 1].at ?? 0) - (frames[index].at ?? 0);
    const wait = Math.max(350, Math.min(3000, Number.isFinite(gap) && gap > 0 ? gap : 1200)) / speed;
    timer = setTimeout(() => { go(index + 1); tick(); }, wait);
  }

  function pause() { playing = false; clearTimeout(timer); publish(null); }

  publish(frames[0]);
  return {
    replay: true,
    frames,
    timeline,
    ok: run.ok,
    error: run.error,
    get index() { return index; },
    get length() { return frames.length; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => snap,
    move: () => Promise.resolve({ ok: false, error: 'Replays are read-only' }),
    play() { if (index >= frames.length - 1) index = 0; playing = true; publish(null); tick(); },
    pause,
    step(d = 1) { pause(); go(index + d); },
    seek(i) { const was = playing; playing = false; clearTimeout(timer); go(i, false); if (was) { playing = true; tick(); } },
    setViewer(id) { viewerId = id; publish(null); },
    setSpeed(x) { speed = Math.max(0.25, Math.min(8, Number(x) || 1)); publish(null); if (playing) tick(); },
    dispose() { clearTimeout(timer); listeners.clear(); },
  };
}
