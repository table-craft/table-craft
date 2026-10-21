// Library build → dist/ (ESM). Peer dependencies stay external; CSS is emitted as dist/tablecraft.css.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const external = (id) => /^(react|react-dom|three|cannon-es|@fontsource(-variable)?)(\/|$)/.test(id) || id.startsWith("node:");

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: { index: 'src/index.js', react: 'src/react/index.js', engine: 'src/engine/index.js', embed: 'src/embed.js' },
      formats: ['es'],
    },
    rollupOptions: {
      external,
      output: { assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') || a.name?.endsWith('.css') ? 'tablecraft.css' : 'assets/[name]-[hash][extname]') },
    },
  },
});
