// Landing page, playground, examples gallery, replays and docs. `npm run site:dev` / `npm run site:build` → site/dist (deploy to GitHub Pages).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDocs, fillTemplate } from './docs-build.js';

const src = fileURLToPath(new URL('../src', import.meta.url));
const here = fileURLToPath(new URL('.', import.meta.url));
const docsDir = fileURLToPath(new URL('../docs', import.meta.url));

// docs/*.md → /docs/<slug>.html. Dev: rendered per request (edit a .md, the page reloads). Build: one static page each,
// filled into the Vite-processed docs.html template (so CSS/JS hashes are right), the template itself is dropped.
function docsPages() {
  return {
    name: 'tablecraft-docs',
    enforce: 'post',
    configureServer(server) {
      server.watcher.add(docsDir);
      server.watcher.on('change', (f) => { if (f.startsWith(docsDir)) server.ws.send({ type: 'full-reload' }); });
      server.middlewares.use(async (req, res, next) => {
        const m = req.url.split('?')[0].match(/^\/docs\/(?:([\w-]+)\.html)?$/);
        if (!m) return next();
        const pages = loadDocs(docsDir);
        const slug = m[1] || 'index';
        if (!pages.has(slug)) return next();
        const html = fillTemplate(fs.readFileSync(`${here}docs.html`, 'utf8'), pages, slug);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await server.transformIndexHtml(req.url, html));
      });
    },
    generateBundle(_, bundle) {
      const tpl = bundle['docs.html'];
      if (!tpl) return;
      const pages = loadDocs(docsDir);
      for (const slug of pages.keys()) this.emitFile({ type: 'asset', fileName: `docs/${slug}.html`, source: fillTemplate(String(tpl.source), pages, slug) });
      delete bundle['docs.html'];
    },
  };
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [react(), docsPages()],
  resolve: {
    alias: [
      { find: /^tablecraft\/embed$/, replacement: `${src}/embed.js` },
      { find: /^tablecraft\/react$/, replacement: `${src}/react/index.js` },
      { find: /^tablecraft\/style\.css$/, replacement: `${src}/react/tablecraft.css` },
      { find: /^tablecraft$/, replacement: `${src}/index.js` },
    ],
  },
  server: {
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    // containers on macOS (Docker Desktop/Podman) don't forward file events through bind mounts
    watch: process.env.VITE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
  worker: { format: 'es' }, // the playground's referee / balance worker
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: `${here}index.html`, play: `${here}play.html`, docs: `${here}docs.html`,
        playground: `${here}playground.html`, examples: `${here}examples.html`, replay: `${here}replay.html`,
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
