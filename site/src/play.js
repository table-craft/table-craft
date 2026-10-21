// Full-screen table: ?game=<example folder>&players=3&pace=fast&lang=tr — any folder in examples/ works.
import { createElement } from 'react';
import { mountGame, createLocalMatch } from 'tablecraft/embed';
import 'tablecraft/style.css';
import './app.css';
import { DEFAULT_EXAMPLE, hasExample, loadSource, metaOf, playerRange } from './examples.js';
import { replayLink, copyText, toast } from './share.js';

const q = new URLSearchParams(location.search);
const game = hasExample(q.get('game')) ? q.get('game') : DEFAULT_EXAMPLE;

const replayIcon = createElement('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
  createElement('path', { d: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5' }));

async function main() {
  const source = await loadSource(game);
  const meta = metaOf(source, game);
  const { min, max } = playerRange(meta);
  const n = Math.max(min, Math.min(max, Number(q.get('players')) || Math.max(min, 2)));
  if (meta.name) document.title = `${meta.name} · Tablecraft`;

  const client = createLocalMatch({ source, players: ['Ada', ...Array(n - 1).fill('bot')], pace: q.get('pace') || 'normal' });

  async function shareReplay() {
    const rec = client.record();
    if (!rec) { toast('Start a game first', 'bad'); return; }
    const ok = await copyText(await replayLink(rec, { game }));
    toast(ok ? `Replay link copied · ${rec.moves.length} moves` : 'Could not copy the link', ok ? 'ok' : 'bad');
  }
  const headerExtra = createElement('div', { className: 'tc-toolgroup' },
    createElement('button', { 'data-tip': 'Share replay', 'aria-label': 'Copy a replay link', onClick: shareReplay }, replayIcon));

  mountGame(document.getElementById('app'), { client, locale: q.get('lang') || 'en', style: { height: '100vh', borderRadius: 0 }, headerExtra });
}
main();
