// Self-hosted multiplayer: an in-memory room server on a socket.io namespace.
//
//   const rooms = createRoomServer(io.of('/tablecraft'));
//   const code = rooms.createRoom({ source: fs.readFileSync('game.js', 'utf8') });
//
// Every move runs on the server (clients only send intents). Bots, pacing and sand timers are scheduled here.
// The wire protocol is documented in docs/server.md and implemented by `connectRoom()` in tablecraft/client.
import { randomBytes } from 'node:crypto';
import { GameModule } from './runtime.js';
import { Match } from '../core/match.js';
import { botDelay, visibleFx, PACE } from '../core/pace.js';
import { msg } from '../core/messages.js';

const newCode = () => randomBytes(3).toString('hex').toUpperCase();
const guestId = () => `g_${randomBytes(4).toString('hex')}`;

// options:
//   identify(socket) → { id, name } | null   — map your auth to a stable player id (default: client-provided guest id)
//   assets: { key: url }                       — default asset map sent to clients (per room via createRoom)
//   onEvent(room, event)                       — hook for logging/persistence ('move', 'start', 'finish', ...)
export function createRoomServer(nsp, { identify = null, assets = {}, onEvent = () => {} } = {}) {
  const rooms = new Map();

  function createRoom({ source, module, code = newCode(), content = {}, options = {}, pace = 'normal', assets: roomAssets, seed } = {}) {
    if (rooms.has(code)) throw new Error(`Room ${code} exists`);
    const mod = module || new GameModule(source);
    const match = new Match(mod, { content, options, pace, seed });
    rooms.set(code, { code, match, assets: roomAssets || assets, bot: null, timer: null });
    return code;
  }

  const getRoom = (code) => rooms.get(String(code || '').toUpperCase()) || null;

  async function broadcast(room, fx = []) {
    const sockets = await nsp.in(room.code).fetchSockets();
    const fxSeq = Date.now();
    for (const s of sockets) {
      s.emit('session', { code: room.code, assets: room.assets, ...room.match.snapshot(s.data.playerId), fx: visibleFx(fx, s.data.playerId || 'spectator'), fxSeq });
    }
  }

  function schedule(room, fx) {
    const { match } = room;
    clearTimeout(room.bot); clearTimeout(room.timer);
    if (match.status !== 'playing') { if (match.status === 'finished') onEvent(room, { type: 'finish', result: match.result }); return; }
    if (match.hasBots()) {
      room.bot = setTimeout(() => {
        const r = match.nextBot();
        if (!r) return;
        onEvent(room, { type: 'move', playerId: r.player.id, name: r.name, bot: true });
        broadcast(room, r.fx).catch(() => {});
        schedule(room, r.fx);
      }, botDelay(match.pace, fx));
    }
    const d = match.deadline();
    if (d) {
      const key = `${d.at}:${d.move}`;
      room.timer = setTimeout(() => {
        const cur = match.deadline();
        if (!cur || `${cur.at}:${cur.move}` !== key) return;
        let out;
        try { out = match.applyDeadline(); } catch { return; }
        broadcast(room, out).catch(() => {});
        schedule(room, out);
      }, Math.max(0, d.at - Date.now()) + 50);
    }
  }

  nsp.on('connection', async (socket) => {
    const auth = socket.handshake.auth || {};
    const room = getRoom(auth.room);
    if (!room) { socket.emit('fatal', 'Room not found'); socket.disconnect(); return; }
    const who = identify ? await identify(socket) : null;
    socket.data.playerId = who?.id || (/^g_[a-f0-9]{8}$/.test(String(auth.playerId || '')) ? auth.playerId : guestId());
    socket.data.name = who?.name || String(auth.name || '').slice(0, 40) || 'Guest';
    socket.join(room.code);
    socket.emit('hello', { playerId: socket.data.playerId });
    await broadcast(room);

    const hostOnly = () => { if (room.match.host && room.match.host !== socket.data.playerId) throw new Error(msg('hostOnly')); };
    const on = (event, fn) => socket.on(event, async (payload = {}, ack) => {
      try {
        const fx = fn(payload || {}) || [];
        await broadcast(room, fx);
        schedule(room, fx);
        onEvent(room, { type: event, playerId: socket.data.playerId, payload });
        if (typeof ack === 'function') ack({ ok: true });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e.message });
      }
    });

    on('join', ({ seat, name }) => { room.match.join(socket.data.playerId, { name: name || socket.data.name, seat }); });
    on('leave', () => { room.match.leave(socket.data.playerId); });
    on('addBot', ({ seat }) => { hostOnly(); room.match.addBot(seat); });
    on('removeBot', ({ id }) => { hostOnly(); room.match.removeBot(id); });
    on('start', () => { hostOnly(); return room.match.start(); });
    on('restart', () => { hostOnly(); room.match.restart(); });
    on('setPace', ({ pace }) => { hostOnly(); if (!PACE[pace]) throw new Error(msg('badPace')); room.match.setPace(pace); });
    on('move', ({ name, args }) => room.match.move(socket.data.playerId, name, args || {}));
  });

  return {
    createRoom,
    getRoom,
    deleteRoom(code) { const r = getRoom(code); if (r) { clearTimeout(r.bot); clearTimeout(r.timer); rooms.delete(r.code); } },
    rooms,
  };
}
