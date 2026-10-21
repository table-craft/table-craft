import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // one copy of React and three.js, even when tablecraft is linked from a local checkout
  resolve: { dedupe: ['react', 'react-dom', 'three', 'cannon-es'] },
  build: { chunkSizeWarningLimit: 1500 }, // three.js alone is ~600 kB; the table is one chunk
});
