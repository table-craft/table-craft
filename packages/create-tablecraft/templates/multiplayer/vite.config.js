import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` serves the table on :5173 and forwards room traffic to the room server (`npm run server`, :3001).
const server = `http://localhost:${process.env.PORT || 3001}`;

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'three', 'cannon-es'] },
  build: { chunkSizeWarningLimit: 1500 }, // three.js alone is ~600 kB; the table is one chunk
  server: {
    proxy: {
      '/api': server,
      '/socket.io': { target: server, ws: true },
    },
  },
});
