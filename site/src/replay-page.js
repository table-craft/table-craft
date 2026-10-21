// Replay viewer: replay.html#r=<deflated JSON record> — see share.js replayLink() for the format.
import '@fontsource-variable/inter';
import '@fontsource/playfair-display/700.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createReplay } from 'tablecraft';
import { ReplayViewer } from 'tablecraft/react';
import 'tablecraft/style.css';
import './site.css';
import './app.css';
import { hasExample, loadSource, metaOf } from './examples.js';
import { readHash, unpackJson, packText, pageUrl, copyText, toast } from './share.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fail(title, text) {
  $('rp-name').textContent = 'Replay';
  $('rp-sub').textContent = '';
  $('rp-stage').innerHTML = `<div class="pg-placeholder big"><b>${esc(title)}</b><span>${text}</span><a class="pg-btn primary" href="./playground.html">Open the playground</a></div>`;
  document.querySelector('.rp-actions').hidden = true;
}

async function boot() {
  const { r } = readHash();
  if (!r) { fail('No replay in this link', 'Play a game in the playground or on <a href="./play.html">the full-screen table</a> and press <b>Share replay</b> to get a link.'); return; }
  let rec;
  try { rec = await unpackJson(r); } catch (e) { fail('This replay link is damaged', esc(e.message)); return; }
  let source = rec.src;
  // edited code travels inline and runs in this page: show where it comes from and wait for a click first
  if (source && !(await confirmInline(source))) return;
  if (!source) {
    if (!hasExample(rec.game)) { fail('Unknown game', `This replay was recorded with “${esc(rec.game)}”, which this site does not have.`); return; }
    source = await loadSource(rec.game);
  }
  const meta = metaOf(source, rec.game || 'game');
  const players = rec.players || [];
  $('rp-name').textContent = meta.name || 'Replay';
  $('rp-sub').textContent = `${players.map((p) => p.name).join(' · ')} · ${rec.moves.length} moves`;
  document.title = `${meta.name || 'Replay'} replay · Tablecraft`;

  const human = players.find((p) => !String(p.id).startsWith('bot_'));
  let replay;
  try {
    replay = createReplay({ source, seed: rec.seed, players, options: rec.options || {}, moves: rec.moves || [], startedAt: rec.startedAt, viewer: human?.id || players[0]?.id });
  } catch (e) { fail('This replay could not be loaded', esc(e.message)); return; }

  createRoot($('rp-stage')).render(createElement(ReplayViewer, { replay, locale: 'en', height: '100%' }));
  if (rec.game) $('rp-open').href = `./playground.html?example=${encodeURIComponent(rec.game)}`;
  else $('rp-open').href = `./playground.html#code=${await packText(source)}`;
  if (replay.frames.length > 1) setTimeout(() => replay.play(), 900);
}

function confirmInline(source) {
  return new Promise((resolve) => {
    $('rp-name').textContent = 'Replay';
    $('rp-stage').innerHTML = `<div class="pg-placeholder big"><b>This replay contains its own game code</b><span>It was recorded with code edited in the playground (${source.split('\n').length} lines). Code from a link runs in this page — only continue if you trust whoever sent it.</span><span class="rp-confirm"><button class="pg-btn primary" type="button" id="rp-go">Run the replay</button> <a class="pg-btn" href="./playground.html#code=" id="rp-read">Read the code first</a></span></div>`;
    packText(source).then((c) => { $('rp-read').href = `./playground.html#code=${c}`; });
    $('rp-go').addEventListener('click', () => { $('rp-stage').innerHTML = ''; resolve(true); }, { once: true });
  });
}

$('rp-copy').addEventListener('click', async () => {
  const ok = await copyText(`${pageUrl('replay.html')}${location.hash}`);
  toast(ok ? 'Link copied' : 'Could not copy the link', ok ? 'ok' : 'bad');
});
window.addEventListener('hashchange', () => location.reload());
boot();
