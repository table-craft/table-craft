// Examples gallery: one card per examples/<folder>/game.js (discovered at build time).
import '@fontsource-variable/inter';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/700-italic.css';
import './site.css';
import './app.css';
import { EXAMPLES, loadSource, metaOf, playersLabel, sourceUrl, thumbOf } from './examples.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// a stable hue per folder for the placeholder art
function hueOf(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }

function lines(source) { return source.split('\n').length; }

function card(folder, source) {
  const m = metaOf(source, folder);
  const thumb = thumbOf(folder);
  const hue = hueOf(folder);
  const art = thumb
    ? `<img src="${esc(thumb)}" alt="" loading="lazy" />`
    : `<div class="gc-art" style="--h:${hue}" aria-hidden="true"><span>${esc((m.name || folder).charAt(0))}</span><i></i><i></i><i></i></div>`;
  return `<article class="gcard">
    <a class="gc-thumb" href="./play.html?game=${encodeURIComponent(folder)}" aria-label="Play ${esc(m.name)}">${art}<span class="gc-play"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/></svg></span></a>
    <div class="gc-body">
      <h2>${esc(m.name)}</h2>
      <p>${esc(m.description || (m.error ? `Could not read this module: ${m.error}` : 'A Tablecraft example game.'))}</p>
      <div class="gc-tags"><span>${esc(playersLabel(m))}</span><span>${lines(source)} lines</span><span class="mono">${esc(folder)}</span></div>
      <div class="gc-actions">
        <a class="pg-btn primary" href="./play.html?game=${encodeURIComponent(folder)}">Play</a>
        <a class="pg-btn" href="./playground.html?example=${encodeURIComponent(folder)}">Edit in playground</a>
        <a class="pg-btn ghost" href="${esc(sourceUrl(folder))}" target="_blank" rel="noopener">Source ↗</a>
      </div>
    </div>
  </article>`;
}

const grid = document.getElementById('gallery');
grid.innerHTML = EXAMPLES.map(() => '<article class="gcard skeleton"><div class="gc-thumb"></div><div class="gc-body"><h2>&nbsp;</h2><p>&nbsp;</p></div></article>').join('');
Promise.all(EXAMPLES.map(async (f) => card(f, await loadSource(f)))).then((cards) => {
  grid.innerHTML = cards.join('') || '<p class="lab-empty">No examples found.</p>';
  grid.removeAttribute('aria-busy');
});
