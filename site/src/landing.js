// Landing page: live demo (local match vs bots), code highlighting, tabs, copy buttons.
import '@fontsource-variable/inter';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/700-italic.css';
import './site.css';
import { highlightAll } from './highlight.js';

highlightAll(document);

// tabs
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tabpanes pre').forEach((p) => p.classList.toggle('on', p.dataset.pane === b.dataset.tab));
}));

// copy buttons
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1400); } catch { /* ignore */ }
}));

// live demo: the 3D engine is loaded only when someone asks for it
const stage = document.getElementById('demo-stage');
const start = document.getElementById('demo-start');
let app = null;
async function boot() {
  if (app) return;
  start.disabled = true; start.textContent = 'Loading the table…';
  const [{ mountGame, createLocalMatch }, { default: source }] = await Promise.all([
    import('tablecraft/embed'),
    import('../../examples/treasure-road/game.js?raw'),
    import('tablecraft/style.css'),
  ]);
  start.remove();
  const client = createLocalMatch({ source, players: ['Ada', 'bot'], pace: 'normal' });
  app = mountGame(stage, { client, locale: 'en' });
}
start.addEventListener('click', boot);
document.querySelectorAll('a[href="#demo"]').forEach((a) => a.addEventListener('click', () => setTimeout(boot, 350)));
