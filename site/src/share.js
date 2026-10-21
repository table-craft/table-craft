// Links that carry their own data: text → deflate (CompressionStream) → base64url, in the URL hash so it never
// reaches a server. Prefix "z" = deflated, "u" = plain UTF-8 (browsers without CompressionStream).

const toB64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function packText(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return `u${toB64url(bytes)}`;
  return `z${toB64url(await pipe(bytes, new CompressionStream('deflate')))}`;
}

export async function unpackText(packed) {
  const kind = packed[0]; const body = fromB64url(packed.slice(1));
  if (kind === 'u') return new TextDecoder().decode(body);
  if (kind !== 'z') throw new Error('Unknown link format');
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed links');
  return new TextDecoder().decode(await pipe(body, new DecompressionStream('deflate')));
}

export const packJson = (o) => packText(JSON.stringify(o));
export const unpackJson = async (s) => JSON.parse(await unpackText(s));

// "#code=…&x=1" → { code: '…', x: '1' } (values are base64url, so no decoding needed)
export function readHash() {
  const out = {};
  for (const part of location.hash.replace(/^#/, '').split('&')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

export const pageUrl = (page) => new URL(page, location.href).href.replace(/[?#].*$/, '');

// Replay links. A record is { v, game?: <example folder>, src?: <module source>, seed, players, options, moves,
// startedAt }. Examples are referenced by folder; edited code travels inline.
export async function replayLink(record, { game, source } = {}) {
  const moves = record.moves.map((m) => {
    const o = { at: m.at, playerId: m.playerId, name: m.name };
    if (m.args && Object.keys(m.args).length) o.args = m.args;
    if (m.error) o.error = m.error;
    return o;
  });
  const rec = { v: 1, ...(game ? { game } : { src: source }), seed: record.seed, players: record.players, options: record.options, startedAt: record.startedAt, moves };
  return `${pageUrl('replay.html')}#r=${await packJson(rec)}`;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

// small toast at the bottom of the page
let toastEl = null; let toastTimer = null;
export function toast(text, kind = 'ok') {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'site-toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
  toastEl.textContent = text; toastEl.dataset.kind = kind; toastEl.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600);
}
