// Self-hosted multiplayer in ~50 lines: socket.io room server + the client served by Vite.
//
//   npm run example:server                      # Treasure Road
//   node examples/server/server.js path/to/game.js
//   PORT=5180 GAME=examples/coin-flip-duel/game.js node examples/server/server.js
//
// Open the printed URL in two browsers (or send it to a friend on your network).
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createServer as createVite } from 'vite';
import react from '@vitejs/plugin-react';
import { createRoomServer } from 'tablecraft/server';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameFile = process.argv[2] || process.env.GAME || path.join(here, '../treasure-road/game.js');
const port = Number(process.env.PORT || 5180);

const http = createServer();
const vite = await createVite({
  root: here, configFile: false, plugins: [react()], appType: 'spa',
  cacheDir: path.join(here, '../../node_modules/.vite-rooms'),   // own cache: may run next to the site dev server
  server: {
    middlewareMode: true,
    hmr: { server: http },                                       // HMR shares the port (handy in containers)
    watch: process.env.VITE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    fs: { allow: [path.join(here, '../..')] },
  },
  resolve: { alias: aliases() },
});
http.on('request', (req, res) => vite.middlewares(req, res));
const io = new Server(http, { destroyUpgrade: false });           // leave Vite's HMR upgrades alone
const rooms = createRoomServer(io.of('/tablecraft'));
const code = rooms.createRoom({ source: fs.readFileSync(path.resolve(gameFile), 'utf8') });

http.listen(port, () => console.log(`Tablecraft room ${code} → http://localhost:${port}/?room=${code}`));

// inside this repo `tablecraft` resolves to the source; in your app it is just the npm package
function aliases() {
  const src = path.join(here, '../../src');
  return [
    { find: /^tablecraft\/react$/, replacement: `${src}/react/index.js` },
    { find: /^tablecraft\/style\.css$/, replacement: `${src}/react/tablecraft.css` },
    { find: /^tablecraft$/, replacement: `${src}/index.js` },
  ];
}
