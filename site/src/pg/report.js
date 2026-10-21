// HTML/SVG renderers for the referee summary and the balance report. Hand-rolled charts, no chart library.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d).replace(/\.0$/, '')}%`);
const num = (x, d = 1) => (x == null ? '—' : String(Math.round(x * 10 ** d) / 10 ** d));

const ICON = {
  ok: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12.5l2.7 2.7L16 9.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3l9.5 17h-19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/></svg>',
  bad: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const lineLink = (line) => (line ? ` <button class="lab-line" data-line="${line}">line ${line}</button>` : '');

// ------------------------------------------------------------------ referee
export function renderReferee({ smoke, rep, firstError, ms }, { games }) {
  if (rep.skipped) {
    return `<div class="lab-banner info">${ICON.info}<div><b>The referee needs <code>actions()</code></b><p>Export <code>actions(state, { playerId })</code> listing every legal move, and the referee can play hundreds of games with bots.</p></div></div>`;
  }
  const problems = rep.errors.length + rep.rejected.length + rep.invariants.length + rep.views.length + rep.stuck;
  const tiles = [
    ['Games', rep.games, ''],
    ['Finished', rep.finished, rep.finished === rep.games ? 'good' : 'bad'],
    ['Stuck', rep.stuck, rep.stuck ? 'bad' : 'good'],
    ['Hit move cap', rep.capped, rep.capped ? 'bad' : 'good'],
    ['Errors', rep.errors.length, rep.errors.length ? 'bad' : 'good'],
    ['Rejected moves', rep.rejected.length, rep.rejected.length ? 'bad' : 'good'],
    ['Avg. moves', rep.avgMoves, ''],
  ];
  const head = rep.ok && !smoke?.error
    ? `<div class="lab-banner ok">${ICON.ok}<div><b>All ${rep.games} games played cleanly</b><p>No module errors, rejected moves, stuck states, invariant violations or broken scenes. ${esc(ms)} ms.</p></div></div>`
    : `<div class="lab-banner bad">${ICON.bad}<div><b>${problems || 1} problem${problems === 1 ? '' : 's'} found</b><p>Each entry names the game, the move and the arguments the bot tried. ${esc(ms)} ms.</p></div></div>`;
  const list = (title, items, fmt) => (items.length ? `<section class="lab-list"><h4>${title} <span>${items.length}${items.length >= 15 ? '+' : ''}</span></h4><ul>${items.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul></section>` : '');
  const where = (x) => `<span class="lab-where">game ${x.game + 1}${x.move != null ? ` · move ${x.move}` : ''}${x.player ? ` · ${esc(x.player)}` : ''}${x.phase ? ` · ${esc(x.phase)}` : ''}</span>`;
  const mv = (x) => (x.name ? `<code>${esc(x.name)}${x.args && Object.keys(x.args).length ? ` ${esc(JSON.stringify(x.args))}` : ''}</code> ` : '');
  const byP = Object.entries(rep.byPlayers || {});
  return `
    ${head}
    ${smoke?.error ? `<div class="lab-banner bad">${ICON.bad}<div><b>Smoke test failed</b><p>${esc(smoke.error)}</p></div></div>` : ''}
    ${firstError ? `<div class="lab-banner bad">${ICON.bad}<div><b>Exception in ${esc(firstError.where || 'the module')}</b><p>${esc(firstError.message)}${lineLink(firstError.line)}</p></div></div>` : ''}
    <div class="lab-tiles">${tiles.map(([k, v, c]) => `<div class="lab-tile ${c}"><b>${esc(v)}</b><span>${k}</span></div>`).join('')}</div>
    ${byP.length > 1 ? `<table class="lab-table"><thead><tr><th>Players</th><th>Games</th><th>Finished</th><th>Avg. moves</th></tr></thead><tbody>${byP.map(([n, b]) => `<tr><td>${n}</td><td>${b.games}</td><td>${b.finished}</td><td>${b.games ? Math.round(b.moves / b.games) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
    ${list('Module errors', rep.errors, (x) => `${where(x)}${x.at ? `<span class="lab-at">${esc(x.at)}</span>` : ''}${mv(x)}<span class="lab-msg">${esc(x.error)}</span>`)}
    ${list('Rejected moves', rep.rejected, (x) => `${where(x)}${mv(x)}<span class="lab-msg">${esc(x.error)}</span><small>actions() offered this move but move() rejected it</small>`)}
    ${list('Stuck games', rep.stuckAt, (x) => `${where(x)}<span class="lab-msg">nobody can move and endIf() returned nothing${x.hint ? ` — ${esc(x.hint)}` : ''}</span>`)}
    ${list('Invariant violations', rep.invariants, (x) => `${where(x)}<span class="lab-msg">${esc((x.errors || []).join('; '))}</span>`)}
    ${list('View / scene problems', rep.views, (x) => `${where(x)}<span class="lab-at">${esc(x.at)}</span><span class="lab-msg">${esc(x.error)}</span>`)}
    ${rep.timedOut ? `<p class="lab-note">Stopped at the time limit after ${rep.games} of ${games} games.</p>` : ''}
    <p class="lab-note">Bots alternate between your <code>bot()</code> and random legal moves, so rarely chosen moves get exercised too.</p>`;
}

// ------------------------------------------------------------------ balance
export function renderBalance({ report: r, hasScore, ms }, { games }) {
  const sev = { warn: 'warn', info: 'info' };
  const warnings = r.warnings.length
    ? `<ul class="lab-warnings">${r.warnings.map((w) => `<li class="${sev[w.severity] || 'info'}">${w.severity === 'warn' ? ICON.warn : ICON.info}<span>${esc(w.message)}</span></li>`).join('')}</ul>`
    : `<div class="lab-banner ok">${ICON.ok}<div><b>No warnings</b><p>Nothing in these ${r.finished} games looks unbalanced. More games make the numbers sharper.</p></div></div>`;

  return `
    <div class="lab-tiles">
      <div class="lab-tile"><b>${r.finished}<small>/${r.games}</small></b><span>games finished</span></div>
      <div class="lab-tile"><b>${num(r.length.avgMoves)}</b><span>avg. moves</span></div>
      <div class="lab-tile"><b>${pct(r.tieRate)}</b><span>ties</span></div>
      <div class="lab-tile"><b>${esc(ms)}<small> ms</small></b><span>${r.timedOut ? 'time limit hit' : 'run time'}</span></div>
    </div>
    <section class="lab-card"><h4>Warnings</h4>${warnings}</section>
    <div class="lab-grid">
      <section class="lab-card"><h4>First-player advantage</h4>${fpaChart(r)}</section>
      <section class="lab-card"><h4>Win rate by seat</h4>${seatChart(r)}</section>
      <section class="lab-card"><h4>Game length <span>moves per finished game</span></h4>${lengthChart(r)}</section>
      <section class="lab-card"><h4>Decisions</h4>${decisions(r)}</section>
      <section class="lab-card"><h4>Tension</h4>${tension(r, hasScore)}</section>
      ${r.strategies ? `<section class="lab-card"><h4>Bot profiles <span>wins ÷ seats played</span></h4>${strategies(r)}</section>` : ''}
    </div>
    ${byPlayersTable(r)}
    ${r.finished < games ? `<p class="lab-note">${games - r.finished} of ${games} games did not finish — run the referee to see why.</p>` : ''}`;
}

// a diverging axis around 0 with the estimate and ±1.96 SE
function fpaChart(r) {
  const v = r.firstPlayerAdvantage; const se = r.firstPlayerAdvantageSE || 0;
  if (v == null) return '<p class="lab-empty">Needs games with two or more players.</p>';
  const W = 320; const H = 74; const pad = 14;
  const lim = Math.max(0.15, Math.abs(v) + 2 * se + 0.03);
  const x = (t) => pad + ((t + lim) / (2 * lim)) * (W - 2 * pad);
  const lo = v - 1.96 * se; const hi = v + 1.96 * se;
  const clear = Math.abs(v) > 2.5 * se;
  const side = v > 0 ? 'the first player is favoured' : 'the first player is at a disadvantage';
  const verdict = Math.abs(v) < 0.04 ? 'close to a fair game' : !clear ? `${v > 0 ? 'leans to' : 'leans against'} the first player — not yet clear, run more games` : side;
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim].map((t) => Math.round(t * 100));
  return `
    <div class="lab-big ${clear && Math.abs(v) > 0.08 ? 'warn' : ''}"><b>${v > 0 ? '+' : ''}${pct(v)}</b><span>${verdict}</span></div>
    <svg class="lab-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="First-player advantage ${pct(v)} plus or minus ${pct(1.96 * se)}">
      <rect x="${x(-0.04)}" y="12" width="${x(0.04) - x(-0.04)}" height="30" rx="4" class="zone"/>
      <line x1="${pad}" x2="${W - pad}" y1="27" y2="27" class="axis"/>
      <line x1="${x(0)}" x2="${x(0)}" y1="8" y2="46" class="mid"/>
      <line x1="${x(lo)}" x2="${x(hi)}" y1="27" y2="27" class="err"><title>95% interval ${pct(lo)} … ${pct(hi)}</title></line>
      <line x1="${x(lo)}" x2="${x(lo)}" y1="20" y2="34" class="err"/><line x1="${x(hi)}" x2="${x(hi)}" y1="20" y2="34" class="err"/>
      <circle cx="${x(v)}" cy="27" r="6" class="dot"><title>${pct(v)} ± ${pct(1.96 * se)}</title></circle>
      ${ticks.map((t) => `<text x="${x(t / 100)}" y="64" class="tick">${t > 0 ? '+' : ''}${t}%</text>`).join('')}
    </svg>
    <p class="lab-cap">Wins of seat 1 beyond a fair share (1 ÷ players). Whisker: 95% interval under fair play; shaded: ±4%.</p>`;
}

function seatChart(r) {
  const seats = Object.entries(r.seatWinRate || {}).filter(([, v]) => v != null);
  if (!seats.length) return '<p class="lab-empty">No finished games.</p>';
  // fair share per seat: average of 1/n over the player counts where that seat existed
  const counts = Object.entries(r.byPlayers || {}).map(([n, b]) => [Number(n), b.finished]);
  const fair = (i) => { let w = 0; let s = 0; for (const [n, f] of counts) if (n > i) { s += f / n; w += f; } return w ? s / w : null; };
  const max = Math.max(0.5, ...seats.map(([, v]) => v)) * 1.1;
  return `<div class="lab-bars">${seats.map(([i, v]) => {
    const f = fair(Number(i));
    return `<div class="lab-bar" title="Seat ${Number(i) + 1}: ${pct(v)} of games${f != null ? ` (fair share ${pct(f)})` : ''}">
      <span class="lab-bar-k">Seat ${Number(i) + 1}</span>
      <span class="lab-bar-track"><i style="width:${(v / max) * 100}%"></i>${f != null ? `<em style="left:${(f / max) * 100}%"></em>` : ''}</span>
      <span class="lab-bar-v">${pct(v)}</span></div>`;
  }).join('')}</div><p class="lab-cap">Gold: share of games won (ties split). Tick: fair share for the player counts that seat played.</p>`;
}

// box: p10 – median – p90, with the mean as a diamond
function lengthChart(r) {
  const { avgMoves: avg, medianMoves: med, p10Moves: p10, p90Moves: p90 } = r.length || {};
  if (med == null) return '<p class="lab-empty">No finished games.</p>';
  const W = 320; const H = 78; const pad = 16;
  const top = Math.max(p90, avg) * 1.15 || 1;
  const x = (t) => pad + (t / top) * (W - 2 * pad);
  const ticks = niceTicks(top);
  return `
    <svg class="lab-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Game length: 10th percentile ${p10}, median ${med}, 90th percentile ${p90}, mean ${avg} moves">
      ${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="8" y2="44" class="grid"/><text x="${x(t)}" y="62" class="tick">${t}</text>`).join('')}
      <line x1="${x(p10)}" x2="${x(p90)}" y1="26" y2="26" class="whisk"/>
      <rect x="${x(p10)}" y="14" width="${Math.max(2, x(p90) - x(p10))}" height="24" rx="4" class="box"><title>80% of games: ${p10}–${p90} moves</title></rect>
      <line x1="${x(med)}" x2="${x(med)}" y1="10" y2="42" class="med"><title>median ${med}</title></line>
      <path d="M${x(avg)} 20l6 6-6 6-6-6z" class="avg"><title>mean ${avg}</title></path>
    </svg>
    <dl class="lab-dl"><div><dt>10th pct.</dt><dd>${p10}</dd></div><div><dt>median</dt><dd>${med}</dd></div><div><dt>mean</dt><dd>${num(avg)}</dd></div><div><dt>90th pct.</dt><dd>${p90}</dd></div></dl>`;
}

function niceTicks(max) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => max / s <= 5) || 2000;
  const out = []; for (let t = 0; t <= max; t += step) out.push(t); return out;
}

function meter(label, value, display, warnAt, hint) {
  const w = Math.max(0, Math.min(1, value ?? 0)) * 100;
  const warn = value != null && warnAt != null && value > warnAt;
  return `<div class="lab-meter ${warn ? 'warn' : ''}"><div class="lab-meter-h"><span>${label}</span><b>${display}</b></div><span class="lab-meter-t"><i style="width:${w}%"></i>${warnAt != null ? `<em style="left:${warnAt * 100}%"></em>` : ''}</span>${hint ? `<small>${hint}</small>` : ''}</div>`;
}

function decisions(r) {
  const d = r.decisions || {};
  return `<div class="lab-big"><b>${num(d.avgChoices, 1)}</b><span>legal moves per decision, on average</span></div>
    ${meter('Forced decisions', d.forcedRate, pct(d.forcedRate), 0.4, 'Only one legal move. Above 40% players may feel on rails.')}`;
}

function tension(r, hasScore) {
  if (!hasScore) return '<p class="lab-empty">Export <code>score(state, { playerId })</code> to measure lead changes and comebacks (it also powers the greedy bot).</p>';
  return `<div class="lab-big"><b>${num(r.leadChanges, 1)}</b><span>lead changes per game</span></div>
    ${meter('Comebacks', r.comebackRate, pct(r.comebackRate), null, 'Games won by someone who was not leading at the two-thirds mark.')}
    ${meter('Ties', r.tieRate, pct(r.tieRate), 0.15, '')}`;
}

function strategies(r) {
  const rows = Object.entries(r.strategies).filter(([, v]) => v != null);
  const max = Math.max(0.5, ...rows.map(([, v]) => v)) * 1.1;
  return `<div class="lab-bars">${rows.map(([k, v]) => `<div class="lab-bar ${k === 'random' ? 'base' : ''}" title="${esc(k)} bots won ${pct(v)} of the seats they played"><span class="lab-bar-k">${esc(k)}</span><span class="lab-bar-track"><i style="width:${(v / max) * 100}%"></i></span><span class="lab-bar-v">${pct(v)}</span></div>`).join('')}</div><p class="lab-cap">Random play is the baseline: if it wins as often, decisions matter little.</p>`;
}

function byPlayersTable(r) {
  const rows = Object.entries(r.byPlayers || {});
  if (!rows.length) return '';
  const seats = Math.max(...rows.map(([n]) => Number(n)));
  return `<section class="lab-card"><h4>By player count</h4><div class="table-scroll"><table class="lab-table"><thead><tr><th>Players</th><th>Finished</th><th>Avg. moves</th><th>1st-player adv.</th>${Array.from({ length: seats }, (_, i) => `<th>Seat ${i + 1}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([n, b]) => `<tr><td>${n}</td><td>${b.finished}/${b.games}</td><td>${num(b.avgMoves)}</td><td>${b.firstPlayerAdvantage == null ? '—' : `${b.firstPlayerAdvantage > 0 ? '+' : ''}${pct(b.firstPlayerAdvantage)}`}</td>${Array.from({ length: seats }, (_, i) => `<td>${b.seatWinRate[i] == null ? '' : pct(b.seatWinRate[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}
