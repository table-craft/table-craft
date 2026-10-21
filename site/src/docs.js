// Docs pages: code highlighting + copy, search (press "/"), mobile navigation, "on this page" scroll spy.
import '@fontsource-variable/inter';
import '@fontsource/playfair-display/700.css';
import './site.css';
import './docs.css';
import { highlight, highlightShell } from './highlight.js';

// ---------------------------------------------------------------- code blocks
for (const el of document.querySelectorAll('.prose pre code')) {
  const lang = (el.className.match(/lang-(\w+)/) || [])[1];
  if (['js', 'jsx', 'ts', 'json', 'javascript'].includes(lang)) el.innerHTML = highlight(el.textContent);
  else if (['bash', 'sh'].includes(lang)) el.innerHTML = highlightShell(el.textContent);
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('.code-copy');
  if (!b) return;
  try { await navigator.clipboard.writeText(b.parentElement.querySelector('code').textContent); b.textContent = 'Copied'; } catch { b.textContent = 'Press ⌘C'; }
  setTimeout(() => { b.textContent = 'Copy'; }, 1400);
});

// ---------------------------------------------------------------- mobile navigation
const menu = document.getElementById('menu-btn');
menu.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  menu.setAttribute('aria-expanded', String(open));
});
document.getElementById('side').addEventListener('click', (e) => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });

// ---------------------------------------------------------------- search
const index = JSON.parse(document.getElementById('search-index').textContent || '[]');
const input = document.getElementById('search');
const box = document.getElementById('search-results');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let hits = []; let sel = 0;

function score(item, terms) {
  const t = item.t.toLowerCase(); const s = item.s.toLowerCase(); let sc = 0;
  for (const w of terms) {
    if (t.startsWith(w)) sc += 6; else if (t.includes(w)) sc += 4; else if (s.includes(w) || item.p.toLowerCase().includes(w)) sc += 1; else return 0;
  }
  return sc + (item.p ? 0 : 1);
}
function render() {
  if (!hits.length) { box.innerHTML = input.value.trim() ? '<div class="sr-empty">No results</div>' : ''; box.hidden = !input.value.trim(); return; }
  box.innerHTML = hits.map((h, i) => `<a href="${h.u}" class="${i === sel ? 'sel' : ''}" role="option"><b>${esc(h.t)}</b><span>${esc(h.p || h.s)}</span></a>`).join('');
  box.hidden = false;
}
input.addEventListener('input', () => {
  const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
  hits = terms.length ? index.map((it) => [score(it, terms), it]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 8).map(([, it]) => it) : [];
  sel = 0; render();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { sel = Math.min(hits.length - 1, sel + 1); render(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
  if (e.key === 'Enter' && hits[sel]) location.href = hits[sel].u;
  if (e.key === 'Escape') { input.value = ''; hits = []; render(); input.blur(); }
});
input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
input.addEventListener('focus', () => { if (hits.length) box.hidden = false; });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input && !e.target.closest?.('input, textarea')) { e.preventDefault(); input.focus(); }
});

// ---------------------------------------------------------------- scroll spy for "On this page"
const links = [...document.querySelectorAll('.toc a')];
const targets = links.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
if (targets.length) {
  const spy = () => {
    let cur = targets[0];
    for (const t of targets) if (t.getBoundingClientRect().top < 120) cur = t;
    links.forEach((a) => a.classList.toggle('on', a.hash === `#${cur.id}`));
  };
  addEventListener('scroll', spy, { passive: true });
  spy();
}
