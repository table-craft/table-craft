// Live playground: edit a game module on the left, play it on the right; referee + balance lab in a worker.
// URLs: playground.html?example=<folder>  ·  playground.html#code=<deflated source>  (Share)
import '@fontsource-variable/inter';
import '@fontsource/playfair-display/700.css';
import 'tablecraft/style.css';
import './site.css';
import './app.css';
import { createEditor } from './pg/editor.js';
import { compile } from './pg/module.js';
import { renderReferee, renderBalance } from './pg/report.js';
import { EXAMPLES, DEFAULT_EXAMPLE, hasExample, loadSource, metaOf, playerRange, titleCase } from './examples.js';
import { packText, unpackText, readHash, pageUrl, replayLink, copyText, toast } from './share.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(`tablecraft:pg:${k}`); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(`tablecraft:pg:${k}`); else localStorage.setItem(`tablecraft:pg:${k}`, v); } catch { /* private mode */ } },
};
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
$('pg-kbd').textContent = isMac ? '⌘↵' : 'Ctrl ↵';

let editor = null;
let current = { example: null, original: null }; // example folder + its pristine source (null for shared code)
let app = null; let client = null; let unsub = null;
let errors = [];
let meta = {};

// ------------------------------------------------------------------ status + errors
function status(text, kind = '') { const el = $('pg-status'); el.textContent = text; el.dataset.kind = kind; }

function showErrors() {
  const box = $('pg-errors');
  if (!errors.length) { box.hidden = true; box.innerHTML = ''; editor?.setError(null); return; }
  box.hidden = false;
  box.innerHTML = `<div class="pg-errors-h"><b>${errors.length === 1 ? 'Error' : `${errors.length} errors`}</b><button type="button" class="pg-x" aria-label="Dismiss">×</button></div>
    <ul>${errors.map((e, i) => `<li><button type="button" data-i="${i}" ${e.line ? '' : 'disabled'}>
      <span class="pg-err-kind">${e.kind === 'syntax' ? 'Syntax error' : 'Runtime error'}${e.where && e.where !== 'load' ? ` in ${escapeHtml(e.where)}` : ''}</span>
      ${e.line ? `<span class="pg-err-at">line ${e.line}${e.col ? `:${e.col}` : ''}</span>` : ''}
      <span class="pg-err-msg">${escapeHtml(e.message)}</span></button></li>`).join('')}</ul>`;
  const first = errors.find((e) => e.line);
  editor?.setError(first ? first.line : null);
}
function addError(e) {
  if (errors.some((x) => x.message === e.message && x.line === e.line)) return;
  errors = [...errors, e].slice(-6);
  showErrors();
  status(e.kind === 'syntax' ? 'Syntax error' : 'Runtime error', 'bad');
}
$('pg-errors').addEventListener('click', (ev) => {
  if (ev.target.closest('.pg-x')) { errors = []; showErrors(); return; }
  const b = ev.target.closest('button[data-i]');
  const e = b && errors[Number(b.dataset.i)];
  if (e?.line) editor.goTo(e.line);
});
const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------ players select (from meta)
function fillPlayers(m, keep) {
  const { min, max } = playerRange(m);
  const top = Math.min(max, 6);
  const sel = $('pg-players');
  const want = Number(keep ?? sel.value) || Math.min(Math.max(min, 2), top);
  sel.innerHTML = '';
  for (let n = min; n <= top; n++) sel.append(new Option(n === 1 ? 'Solo' : `You + ${n - 1} bot${n > 2 ? 's' : ''}`, String(n)));
  sel.value = String(Math.min(top, Math.max(min, want)));
  const bal = $('bal-players'); const bv = bal.value;
  bal.innerHTML = '';
  bal.append(new Option(min === top ? `${min}` : `all (${min}–${top})`, ''));
  for (let n = Math.max(min, 1); n <= top && min !== top; n++) bal.append(new Option(String(n), String(n)));
  if ([...bal.options].some((o) => o.value === bv)) bal.value = bv;
}

// ------------------------------------------------------------------ run the table
let embed = null;
let runSeq = 0;
async function run() {
  const seq = ++runSeq;
  const code = editor.getValue();
  errors = []; showErrors();
  status('Compiling…');
  const { mod, error } = await compile(code, { onError: (e) => { if (seq === runSeq) addError(e); } });
  if (seq !== runSeq) return;
  if (error) { addError(error); if (error.line) editor.goTo(error.line); teardown(); placeholder('The module did not load', 'Fix the error on the left, then press Run.'); return; }
  meta = mod.meta || {};
  fillPlayers(meta);
  updateLabHints(mod);
  status('Loading the table…');
  embed = embed || await import('tablecraft/embed');
  if (seq !== runSeq) return;
  teardown();
  const n = Number($('pg-players').value) || 2;
  try {
    client = createClient(mod, n);
  } catch (e) {
    if (!errors.length) addError({ message: e.message, line: null, kind: 'runtime', where: 'setup()' });
    placeholder('The game could not start', 'See the error panel under the editor.');
    return;
  }
  const el = $('pg-table'); el.innerHTML = '';
  app = embed.mountGame(el, { client, locale: 'en', style: { height: '100%', minHeight: 0, borderRadius: 0 } });
  unsub = client.subscribe((s) => {
    $('pg-replay').disabled = !(s && (s.status === 'playing' || s.status === 'finished') && client.record?.());
    if (s?.status === 'finished' && seq === runSeq) status(`Game over${s.result?.winner ? ` · ${s.result.winner} wins` : ''}`, 'good');
  });
  $('pg-replay').disabled = !client.record?.();
  if (!errors.length) status(`Running · ${meta.name || 'game'}`, 'good');
  showTab('table');
}

function createClient(mod, n) {
  const players = ['You', ...Array(Math.max(0, n - 1)).fill('bot')];
  return embed.createLocalMatch({ module: mod, players, pace: 'normal' });
}

function teardown() {
  unsub?.(); unsub = null;
  try { app?.unmount(); } catch { /* already gone */ }
  client?.dispose?.(); app = null; client = null;
  $('pg-replay').disabled = true;
}
function placeholder(title, text) {
  $('pg-table').innerHTML = `<div class="pg-placeholder"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 3l9.5 17h-19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1" fill="currentColor"/></svg><b>${title}</b><span>${text}</span></div>`;
}

// ------------------------------------------------------------------ examples, drafts, autosave
function fillExamples() {
  const sel = $('pg-example');
  sel.innerHTML = '';
  for (const f of EXAMPLES) sel.append(new Option(titleCase(f), f));
  sel.append(new Option('Shared / custom code', '__custom'));
}

async function openExample(folder, { code } = {}) {
  const custom = folder === '__custom';
  const original = custom ? null : await loadSource(folder);
  current = { example: custom ? null : folder, original };
  $('pg-example').value = folder;
  const draft = store.get(`draft:${folder}`);
  // custom code with no draft yet starts from the smallest example
  const starter = custom && code == null && !draft ? await loadSource(EXAMPLES.includes('coin-flip-duel') ? 'coin-flip-duel' : EXAMPLES[0]) : '';
  editor.setValue(code ?? draft ?? original ?? starter);
  store.set('last', folder);
  if (current.example) {
    const m = metaOf(original, folder);
    const opt = [...$('pg-example').options].find((o) => o.value === folder);
    if (opt && m.name) opt.textContent = m.name;
    const u = new URL(location.href); u.searchParams.set('example', folder); u.hash = '';
    history.replaceState(null, '', u);
  }
  updateDraft();
}

function updateDraft() {
  const edited = current.original != null && editor.getValue() !== current.original;
  $('pg-draft').hidden = !edited;
}

let saveTimer = null;
function onChange() {
  updateDraft();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const key = `draft:${current.example || '__custom'}`;
    const code = editor.getValue();
    store.set(key, current.original != null && code === current.original ? null : code);
  }, 500);
}

$('pg-reset').addEventListener('click', () => {
  if (current.original == null) return;
  editor.setValue(current.original); store.set(`draft:${current.example}`, null); updateDraft(); run();
});
$('pg-example').addEventListener('change', async (e) => { await openExample(e.target.value); run(); });
$('pg-players').addEventListener('change', () => run());
$('pg-run').addEventListener('click', () => run());

// ------------------------------------------------------------------ share / download / replay
$('pg-share').addEventListener('click', async () => {
  const code = editor.getValue();
  let url;
  if (current.example && code === current.original) url = `${pageUrl('playground.html')}?example=${current.example}`;
  else url = `${pageUrl('playground.html')}${current.example ? `?example=${current.example}` : ''}#code=${await packText(code)}`;
  const ok = await copyText(url);
  toast(ok ? `Link copied${url.length > 8000 ? ` · ${Math.round(url.length / 1024)} KB` : ''}` : 'Could not copy the link', ok ? 'ok' : 'bad');
});

$('pg-download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([editor.getValue()], { type: 'text/javascript' }));
  a.download = 'game.js';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('pg-replay').addEventListener('click', async () => {
  const rec = client?.record?.();
  if (!rec) { toast('Start a game first', 'bad'); return; }
  const code = editor.getValue();
  const url = await replayLink(rec, current.example && code === current.original ? { game: current.example } : { source: code });
  const ok = await copyText(url);
  toast(ok ? `Replay link copied · ${rec.moves.length} moves` : 'Could not copy the link', ok ? 'ok' : 'bad');
});

// ------------------------------------------------------------------ tabs
function showTab(name) {
  document.querySelectorAll('.pg-tabs [role=tab]').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  document.querySelectorAll('.pg-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === name));
}
document.querySelector('.pg-tabs').addEventListener('click', (e) => { const b = e.target.closest('[role=tab]'); if (b) showTab(b.dataset.tab); });

// ------------------------------------------------------------------ referee + balance (web worker)
const jobs = { referee: null, balance: null };
function runJob(task, opts, out, render, button) {
  jobs[task]?.cancel();
  const code = editor.getValue();
  const worker = new Worker(new URL('./pg/lab-worker.js', import.meta.url), { type: 'module' });
  const t0 = performance.now();
  out.innerHTML = `<div class="lab-running"><span class="lab-spin"></span><div><b>${task === 'referee' ? `Playing ${opts.games} games…` : `Analyzing ${opts.games} games…`}</b><span class="lab-elapsed">0.0 s</span></div><button type="button" class="pg-btn lab-cancel">Cancel</button></div>`;
  const tick = setInterval(() => { const el = out.querySelector('.lab-elapsed'); if (el) el.textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`; }, 100);
  button.disabled = true;
  const finish = () => { clearInterval(tick); worker.terminate(); button.disabled = false; jobs[task] = null; };
  const job = { cancel() { finish(); out.innerHTML = '<p class="lab-empty">Cancelled.</p>'; } };
  jobs[task] = job;
  out.querySelector('.lab-cancel').addEventListener('click', () => job.cancel());
  worker.onmessage = ({ data }) => {
    finish();
    if (!data.ok) {
      const e = data.error || {};
      out.innerHTML = `<div class="lab-banner bad"><div><b>${e.where === 'load' ? 'The module did not load' : 'The run failed'}</b><p>${escapeHtml(e.message)}${e.line ? ` <button class="lab-line" data-line="${e.line}">line ${e.line}</button>` : ''}</p></div></div>`;
      return;
    }
    out.innerHTML = render(data.result, opts);
    if (task === 'referee') $('ref-dot').dataset.kind = data.result.rep.skipped ? '' : data.result.rep.ok && !data.result.smoke?.error ? 'good' : 'bad';
  };
  worker.onerror = (e) => { finish(); out.innerHTML = `<div class="lab-banner bad"><div><b>The worker crashed</b><p>${escapeHtml(e.message || 'unknown error')}</p></div></div>`; };
  worker.postMessage({ id: 1, task, code, opts });
}
document.addEventListener('click', (e) => { const b = e.target.closest('.lab-line'); if (b) editor.goTo(Number(b.dataset.line)); });

$('pg-validate').addEventListener('click', () => $('ref-run').click());
$('ref-run').addEventListener('click', () => {
  showTab('referee');
  runJob('referee', { games: Number($('ref-games').value) || 50 }, $('ref-out'), renderReferee, $('ref-run'));
});
$('bal-run').addEventListener('click', () => {
  runJob('balance', {
    games: Number($('bal-games').value) || 100,
    players: Number($('bal-players').value) || undefined,
    botMix: $('bal-bots').value.split(','),
  }, $('bal-out'), renderBalance, $('bal-run'));
});

function updateLabHints(mod) {
  const greedy = [...$('bal-bots').options].filter((o) => o.value.includes('greedy'));
  greedy.forEach((o) => { o.disabled = !mod.has('score'); o.title = mod.has('score') ? '' : 'needs score() in the module'; });
  if ($('bal-bots').selectedOptions[0]?.disabled) $('bal-bots').value = 'module';
}

// ------------------------------------------------------------------ resizable split
(function splitter() {
  const split = $('pg-split'); const gutter = $('pg-gutter');
  const apply = (p) => split.style.setProperty('--pg-left', `${Math.max(22, Math.min(72, p))}%`);
  const saved = Number(store.get('split')); if (saved) apply(saved);
  let drag = false;
  gutter.addEventListener('pointerdown', (e) => { drag = true; gutter.setPointerCapture(e.pointerId); split.classList.add('dragging'); });
  gutter.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = split.getBoundingClientRect();
    apply(((e.clientX - r.left) / r.width) * 100);
  });
  const end = () => { if (!drag) return; drag = false; split.classList.remove('dragging'); store.set('split', parseFloat(split.style.getPropertyValue('--pg-left')) || ''); };
  gutter.addEventListener('pointerup', end); gutter.addEventListener('pointercancel', end);
  gutter.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = parseFloat(split.style.getPropertyValue('--pg-left')) || 44;
    apply(cur + (e.key === 'ArrowLeft' ? -3 : 3)); e.preventDefault();
  });
}());

// ------------------------------------------------------------------ boot
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.target.closest?.('.cm-editor, textarea')) { e.preventDefault(); run(); }
});

(async function boot() {
  fillExamples();
  const q = new URLSearchParams(location.search);
  const hash = readHash();
  let shared = null;
  if (hash.code) {
    try { shared = await unpackText(hash.code); } catch (e) { toast(`Could not open the shared code: ${e.message}`, 'bad'); }
  }
  const asked = q.get('example');
  const last = store.get('last');
  const lastOk = hasExample(last) || (last === '__custom' && store.get('draft:__custom'));
  const folder = hasExample(asked) ? asked : shared != null ? '__custom' : lastOk ? last : DEFAULT_EXAMPLE;
  editor = await createEditor($('pg-editor'), { value: '', onChange, onRun: run });
  $('pg-ed-kind').textContent = editor.kind === 'codemirror' ? '' : 'basic editor';
  await openExample(folder, shared != null ? { code: shared } : {});
  if (shared != null) {
    // keep the shared code as this example's draft and drop the long hash from the address bar
    store.set(`draft:${current.example || '__custom'}`, current.original === shared ? null : shared);
    const u = new URL(location.href); u.hash = ''; history.replaceState(null, '', u);
    // code from a link runs in this page, so it waits until the reader has looked at it and pressed Run
    placeholder('Shared code', 'Someone shared this game module with you. Read it on the left, then press Run.');
    status('Not run yet');
    return;
  }
  run();
}());
