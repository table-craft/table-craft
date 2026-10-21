// Connect to a room on a Tablecraft room server (createRoomServer). socket.io-client is passed in so the core
// package does not depend on it:
//
//   import { io } from 'socket.io-client';
//   const room = connectRoom({ io, url: 'https://play.example.com', room: 'AB12CD', name: 'Ada' });
//
// Returns the same MatchClient interface as createLocalMatch().
const PID_KEY = 'tablecraft:pid';

export function connectRoom({ io, url = '', namespace = '/tablecraft', path, room, name, auth = {}, storage = globalThis.localStorage } = {}) {
  if (!io) throw new Error('connectRoom: pass the socket.io-client `io` function');
  let stored = '';
  try { stored = storage?.getItem(PID_KEY) || ''; } catch { /* private mode */ }
  const socket = io(`${url}${namespace}`, { path, transports: ['websocket', 'polling'], auth: { room, name, playerId: stored, ...auth } });
  const listeners = new Set();
  let snap = null; let n = 0; let playerId = stored || null; let fatal = null;
  const notify = () => listeners.forEach((fn) => fn(snap));

  socket.on('hello', ({ playerId: id }) => { playerId = id; try { storage?.setItem(PID_KEY, id); } catch { /* ignore */ } });
  socket.on('session', (data) => {
    snap = { ...data, fx: data.fx?.length ? { seq: `${data.fxSeq}:${++n}`, list: data.fx } : null, serverOffset: data.fxSeq ? data.fxSeq - Date.now() : 0 };
    notify();
  });
  socket.on('fatal', (m) => { fatal = m; snap = { ...(snap || {}), status: 'error', error: m }; notify(); });
  socket.on('connect_error', (e) => { if (!snap) { snap = { status: 'error', error: e.message }; notify(); } });

  const emit = (ev, payload = {}) => new Promise((resolve) => socket.emit(ev, payload, (r) => resolve(r || { ok: false, error: 'No response' })));

  return {
    get playerId() { return playerId; },
    get error() { return fatal; },
    socket,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => snap,
    move: (name, args) => emit('move', { name, args }),
    join: (seat, nm) => emit('join', { seat, name: nm ?? name }),
    leave: () => emit('leave'),
    addBot: (seat) => emit('addBot', { seat }),
    removeBot: (id) => emit('removeBot', { id }),
    start: () => emit('start'),
    restart: () => emit('restart'),
    setPace: (pace) => emit('setPace', { pace }),
    dispose() { listeners.clear(); socket.close(); },
  };
}
