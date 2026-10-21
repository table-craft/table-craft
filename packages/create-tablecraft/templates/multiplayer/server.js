// Tablecraft room server: every move runs here; browsers only send intents and receive their own view.
//
//   npm run server            → http://localhost:3001 (API + socket.io; `npm run dev` proxies to it)
//   PORT=4000 npm run server
//   npm start                 → builds the client and serves it from this server too (one port, ready to deploy)
//
// Rooms live in memory: restarting the server (e.g. after editing src/game.js) closes them; reload the page for a new one.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createRoomServer } from 'tablecraft/server';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3001);
const gameFile = path.join(here, 'src/game.js');
const dist = path.join(here, 'dist');
const MAX_ROOMS = 200;

const http = createServer(handle);
const io = new Server(http, { cors: { origin: process.env.CORS_ORIGIN || '*' } });
const rooms = createRoomServer(io.of('/tablecraft'), {
  onEvent: (room, e) => { if (e.type === 'start' || e.type === 'finish') console.log(`room ${room.code}: ${e.type}`); },
});

function openRoom() {
  if (rooms.rooms.size >= MAX_ROOMS) rooms.deleteRoom(rooms.rooms.keys().next().value); // drop the oldest
  // the module is read on every new room, so edits to src/game.js apply to the next room without a restart
  return rooms.createRoom({ source: fs.readFileSync(gameFile, 'utf8') });
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json', '.mp3': 'audio/mpeg' };

function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST' }).end(); return; }
  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    try {
      const code = openRoom();
      console.log(`room ${code} opened`);
      res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ code }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  // `npm start`: serve the built client (dist/) from the same port
  if (req.method === 'GET' && fs.existsSync(dist)) {
    let file = path.join(dist, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]\.\.)+/, ''));
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Tablecraft room server. Run `npm run dev` and open the Vite URL.');
}

http.listen(port, () => {
  console.log(`Tablecraft room server on http://localhost:${port}`);
  console.log(fs.existsSync(dist) ? `Play: http://localhost:${port}` : 'Play: run `npm run dev` and open http://localhost:5173');
});
