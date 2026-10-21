// End-to-end: room server on a real socket.io server, two clients (host + guest) through connectRoom().
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import { createRoomServer } from '../src/server/index.js';
import { connectRoom } from '../src/client/room.js';

const source = fs.readFileSync(new URL('../examples/treasure-road/game.js', import.meta.url), 'utf8');
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const until = (client, pred, ms = 8000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { off(); reject(new Error(`timeout; last: ${JSON.stringify(client.getSnapshot())?.slice(0, 300)}`)); }, ms);
  const check = (s) => { if (s && pred(s)) { clearTimeout(t); off(); resolve(s); } };
  const off = client.subscribe(check);
  check(client.getSnapshot());
});

test('room server: lobby, bots, moves, private views', async () => {
  const http = createServer();
  const ioServer = new Server(http);
  const rooms = createRoomServer(ioServer.of('/tablecraft'));
  const code = rooms.createRoom({ source, pace: 'fast' });
  await new Promise((r) => http.listen(0, r));
  const url = `http://localhost:${http.address().port}`;

  const host = connectRoom({ io, url, room: code, name: 'Host', storage: memory() });
  const guest = connectRoom({ io, url, room: code, name: 'Guest', storage: memory() });
  try {
    await until(host, (s) => s.status === 'lobby');
    assert.deepEqual(await host.join(null), { ok: true });
    assert.deepEqual(await guest.join(null), { ok: true });
    const denied = await guest.start();
    assert.equal(denied.ok, false); // only the host may start
    assert.deepEqual(await host.addBot(null), { ok: true });
    assert.deepEqual(await host.start(), { ok: true });

    const s = await until(host, (x) => x.status === 'playing' && x.view?.type === 'tabletop');
    assert.equal(s.players.length, 3);
    assert.ok(s.fx?.list.some((e) => e.type === 'banner'));

    // hidden information: the guest never sees the host's card faces
    await until(host, (x) => x.view.scene.objects.some((o) => o.zone === `hand:${host.playerId}`) || x.status !== 'playing', 15000).catch(() => null);
    const g = guest.getSnapshot();
    const hostCards = g.view.scene.objects.filter((o) => o.zone === `hand:${host.playerId}`);
    assert.ok(hostCards.every((o) => o.face === undefined && o.faceUp === false));

    const bad = await guest.move('roll');
    if (g.you.id !== g.players[0].id) assert.equal(bad.ok, false);
  } finally {
    host.dispose(); guest.dispose();
    for (const c of [...rooms.rooms.keys()]) rooms.deleteRoom(c);
    ioServer.close(); http.close();
  }
});
