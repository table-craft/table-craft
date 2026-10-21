// Every examples/<folder>/game.js, discovered at build time — a new example folder shows up in the gallery, the
// playground picker, play.html?game=<folder> and replays without touching the site.
import { LocalGameModule } from 'tablecraft';

const sources = import.meta.glob('../../examples/*/game.js', { query: '?raw', import: 'default' });
const thumbs = import.meta.glob('../../examples/*/thumb.{png,jpg,webp}', { query: '?url', import: 'default', eager: true });

export const REPO = 'https://github.com/table-craft/table-craft';
export const DEFAULT_EXAMPLE = 'treasure-road';
const FEATURED = ['treasure-road', 'supply-lines', 'coin-flip-duel'];

const folderOf = (path) => path.split('/').slice(-2, -1)[0];
const rank = (f) => { const i = FEATURED.indexOf(f); return i < 0 ? FEATURED.length : i; };

export const EXAMPLES = Object.keys(sources).map(folderOf).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

export const hasExample = (folder) => EXAMPLES.includes(folder);
export const sourceUrl = (folder) => `${REPO}/blob/main/examples/${folder}/game.js`;
export const thumbOf = (folder) => Object.entries(thumbs).find(([p]) => folderOf(p) === folder)?.[1] || null;

const cache = new Map();
export function loadSource(folder) {
  const key = Object.keys(sources).find((p) => folderOf(p) === folder);
  if (!key) return Promise.reject(new Error(`Unknown example "${folder}"`));
  if (!cache.has(folder)) cache.set(folder, sources[key]());
  return cache.get(folder);
}

// "supply-lines" → "Supply Lines" (used when a module has no meta.name)
export const titleCase = (folder) => folder.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// meta of a game module: evaluates it with the browser runtime (trusted, bundled examples only)
export function metaOf(source, folder = '') {
  try {
    const m = new LocalGameModule(source).meta || {};
    return { ...m, name: m.name || titleCase(folder) };
  } catch (e) {
    return { name: titleCase(folder), error: e.message };
  }
}

export function playerRange(meta = {}) {
  const min = Math.max(1, Number(meta.minPlayers) || 1);
  const max = Math.max(min, Math.min(8, Number(meta.maxPlayers) || Math.max(min, 4)));
  return { min, max };
}

export function playersLabel(meta) {
  const { min, max } = playerRange(meta);
  return min === max ? `${min} player${min === 1 ? '' : 's'}` : `${min}–${max} players`;
}
