// Tablecraft tools for AI assistants: read the docs, start from a template, validate, run the referee, audit views and
// step through a match move by move.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameModule, Match, simulateAsync, summarize, chooseBotMove, makeRandom } from '../server/index.js';
import { validate as validateModule } from '../core/referee.js';
import { auditViews as coreAudit } from '../core/audit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = path.join(ROOT, 'docs');
export const TEMPLATES = {
  'coin-flip-duel': { file: 'examples/coin-flip-duel/game.js', about: 'Smallest complete game (~70 lines): two players, one die, first to 10 points.' },
  'treasure-road': { file: 'examples/treasure-road/game.js', about: 'Complete small game: hidden hands, deck + discard, physical die, pawns on a track, coins, sand timer, bots, invariants.' },
  'supply-lines': { file: 'examples/supply-lines/game.js', about: 'Hex-map game: terrain tiles, cities on hex corners, clickable routes (links) between them, depots placed on cells, T.hex / T.findPath for connections, bots.' },
  'spice-draft': { file: 'examples/spice-draft/game.js', about: 'Pick-and-pass card drafting: simultaneous secret picks (T.secret), hands passed left/right (T.draft), set-collection and majority scoring (T.sets, T.area.majority, T.score).' },
  'harbor-workers': { file: 'examples/harbor-workers/game.js', about: 'Worker placement with rounds and phases (T.flow, T.workers), a sliding contract market priced by position (T.market), pending decisions (T.pending), resources.' },
  'four-in-a-row': { file: 'examples/four-in-a-row/game.js', about: 'Square-grid game: drop discs with gravity, n-in-a-row detection (T.grid.lineRuns), winning-line highlight, a bot that wins/blocks.' },
  'liars-dice': { file: 'examples/liars-dice/game.js', about: 'Bluffing with hidden dice: private rolls (roll to: [id]), bids and challenges, bots using exact odds (T.dice.odds).' },
  'tricks': { file: 'examples/tricks/game.js', about: 'Trick-taking card game: trumps, follow suit (T.tricks), bid → play → score phases (T.flow), exact-bid scoring.' },
  'auction-house': { file: 'examples/auction-house/game.js', about: 'Auctions of every kind: open, once-around, sealed (T.secret + T.auction.sealed) and Dutch; hidden money, rotating auctioneer (T.turns), artist values by rank (T.score.rank).' },
};

// ---------------------------------------------------------------- inputs
export function readSource({ source, path: p }) {
  if (typeof source === 'string' && source.trim()) return source;
  if (typeof p === 'string' && p) return fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
  throw new Error('Pass the game module as `source` (text) or `path` (file).');
}
function readContent({ content, contentPath }) {
  if (content && typeof content === 'object') return content;
  if (contentPath) return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), contentPath), 'utf8'));
  return {};
}
const json = (o) => `\`\`\`json\n${JSON.stringify(o, null, 2)}\n\`\`\``;

// ---------------------------------------------------------------- docs
export function docList() {
  return fs.readdirSync(DOCS).filter((f) => f.endsWith('.md')).map((f) => {
    const slug = f === 'README.md' ? 'index' : f.slice(0, -3);
    const md = fs.readFileSync(path.join(DOCS, f), 'utf8');
    return { slug, file: f, title: (md.match(/^#\s+(.+)$/m) || [])[1] || slug };
  });
}
export const readDoc = (slug) => {
  const d = docList().find((x) => x.slug === slug);
  if (!d) throw new Error(`Unknown topic "${slug}". Topics: ${docList().map((x) => x.slug).join(', ')}`);
  return fs.readFileSync(path.join(DOCS, d.file), 'utf8');
};
export const readTemplate = (name) => {
  const t = TEMPLATES[name];
  if (!t) throw new Error(`Unknown template "${name}". Templates: ${Object.keys(TEMPLATES).join(', ')}`);
  return fs.readFileSync(path.join(ROOT, t.file), 'utf8');
};

// ---------------------------------------------------------------- view summaries (what a player sees, as text)
function uiText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  for (const k of ['title', 'text', 'label']) if (typeof node[k] === 'string') out.push(node[k]);
  if (node.type === 'form') out.push(`[form → ${typeof node.submit?.move === 'string' ? node.submit.move : node.submit?.move?.name}: ${(node.fields || []).map((f) => f.id).join(', ')}]`);
  if (node.type === 'button' && node.move) out[out.length - 1] = `[button "${node.label}" → ${node.move.name || node.move}]`;
  (node.children || []).forEach((c) => uiText(c, out));
  (node.cells || node.cards || node.items || []).forEach((c) => out.push(c.label || c.title || ''));
  return out;
}

export function summarizeView(view, { maxObjects = 80 } = {}) {
  if (!view) return { text: '(no view)' };
  if (view.type !== 'tabletop') return { text: `2D view: ${uiText(view).filter(Boolean).join(' · ').slice(0, 1500)}` };
  const { scene = {}, hud = {} } = view;
  const zones = new Map((scene.zones || []).map((z) => [z.id, z]));
  const byZone = new Map();
  for (const o of scene.objects || []) {
    const k = o.zone || (o.anchor ? `anchor:${o.anchor}` : '(free)');
    if (!byZone.has(k)) byZone.set(k, []);
    byZone.get(k).push(o);
  }
  const lines = [];
  lines.push(`${hud.title || 'Table'} — ${hud.status || ''}`.trim());
  if (hud.players?.length) lines.push(`Players: ${hud.players.map((p) => `${p.name}${p.me ? ' (you)' : ''}${p.active ? ' [active]' : ''}${(p.stats || []).length ? ` {${p.stats.map((s) => `${s.label}: ${s.value}`).join(', ')}}` : ''}`).join(' | ')}`);
  if (hud.prompt) lines.push(`Prompt: ${uiText(hud.prompt).filter(Boolean).join(' · ').slice(0, 600)}`);
  let shown = 0;
  for (const [zid, objs] of byZone) {
    const z = zones.get(zid);
    const head = z ? `${z.label ? `"${z.label}" ` : ''}${zid}${z.seat ? ` [seat ${z.seat}]` : ''} (${z.layout || 'row'})` : zid;
    const items = objs.slice(0, Math.max(0, maxObjects - shown)).map((o) => {
      const title = typeof o.face === 'string' ? o.face : o.face?.title || o.face?.text || o.text || '';
      const bits = [o.kind, title && `"${String(title).slice(0, 40)}"`, o.faceUp === false && 'face-down', o.count != null && `×${o.count}`, o.value != null && o.kind === 'die' && `value=${o.value}`, o.click && `click→${o.click.name}${o.click.args ? JSON.stringify(o.click.args) : ''}`].filter(Boolean);
      return `${o.id}: ${bits.join(' ')}`;
    });
    shown += items.length;
    lines.push(`- ${head}: ${items.join('; ') || '(empty)'}`);
    if (shown >= maxObjects) { lines.push(`… ${(scene.objects || []).length - shown} more objects`); break; }
  }
  if (hud.log?.length) lines.push(`Log (last 5): ${hud.log.slice(-5).join(' / ')}`);
  return { text: lines.join('\n') };
}

// ---------------------------------------------------------------- audit (see core/audit.js)
export const auditViews = (source, opts) => coreAudit(new GameModule(source), opts);

// ---------------------------------------------------------------- live matches (step through a game)
const matches = new Map();
let seq = 0;

export function startMatch(source, { players = 2, seed = 7, content = {}, variant } = {}) {
  if (matches.size >= 20) matches.delete(matches.keys().next().value);
  const mod = new GameModule(source);
  const names = Array.isArray(players) ? players : Array.from({ length: Number(players) || 2 }, (_, i) => `Player ${i + 1}`);
  const m = new Match(mod, { seed, content, options: variant ? { variant } : {}, clock: () => matchClock(id) });
  const seats = mod.meta?.seats || [];
  names.forEach((nm, i) => m.join(`p${i + 1}`, { name: nm, seat: seats.length ? seats[i % seats.length].id : null }));
  const id = `m${++seq}`;
  matches.set(id, { m, now: 1_700_000_000_000, rand: makeRandom(seed ^ 0x5bd1e995).api });
  m.start();
  return id;
}
function matchClock(id) { const s = matches.get(id); return s ? s.now : Date.now(); }
export function getMatch(id) {
  const s = matches.get(id);
  if (!s) throw new Error(`No match "${id}". Start one with start_match.`);
  return s;
}
export const endMatch = (id) => matches.delete(id);

export function overview(id) {
  const { m } = getMatch(id);
  const acts = m.players.map((p) => {
    const list = m.status === 'playing' ? (m.mod.actions(m.state, p) || []) : [];
    return { player: p.id, name: p.name, actions: list.slice(0, 25), more: Math.max(0, list.length - 25) };
  });
  const log = m.state ? (m.mod.view(m.state, m.players[0])?.hud?.log || []).slice(-8) : [];
  return { match: id, status: m.status, result: m.result, moves: m.moves.length, deadline: m.deadline(), players: acts, log };
}

// plays one move for whoever can act (bots for everyone), or lets a pending sand timer expire
export function stepBots(id, { stopFor } = {}) {
  const s = getMatch(id); const { m } = s;
  if (m.status !== 'playing') return null;
  const movers = m.players.filter((p) => (m.mod.actions(m.state, p) || []).some((a) => !a.free));
  if (stopFor && movers.some((p) => p.id === stopFor)) return { stop: true };
  if (!movers.length) {
    const d = m.deadline();
    if (!d) return { stuck: true };
    s.now = Math.max(s.now, d.at);
    m.applyDeadline();
    return { player: d.playerId || 'system', name: d.move, args: d.args, timer: true };
  }
  const p = s.rand.pick(movers);
  const c = chooseBotMove(m.mod, m.state, p, s.rand);
  s.now += 1500;
  m.apply(p, c.name, c.args);
  return { player: p.id, name: c.name, args: c.args };
}

export function playMove(id, playerId, name, args = {}) {
  const s = getMatch(id);
  s.now += 1500;
  return s.m.move(playerId, name, args);
}

export { summarize, json, readContent, validateModule, simulateAsync, GameModule };
export { analyzeBalanceAsync, compareReports, sweepPoint, BOT_PROFILES } from '../server/index.js';
