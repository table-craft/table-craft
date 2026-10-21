// View audit: plays bot games and inspects every player's view after every move — hidden-information leaks, scene
// errors, rejected actions, stuck states and readability (labels, log lines, active player). Isomorphic: pass a loaded
// module (server GameModule or browser LocalGameModule).
import { checkScene } from './scene.js';
import { chooseBotMove } from './pace.js';
import { makeRandom } from './random.js';
import { testPlayers } from './referee.js';

// lines appended since `prev` (hud.log is usually a sliding window of the last N lines)
function newLines(prev, cur) {
  let j = Math.min(prev.length, cur.length);
  for (; j > 0; j--) { let ok = true; for (let i = 0; i < j; i++) if (cur[i] !== prev[prev.length - j + i]) { ok = false; break; } if (ok) break; }
  return cur.slice(j);
}

// Plays bot games and inspects every player's view after every move.
export function auditViews(mod, { games = 3, players, seed = 1, content = {}, maxMoves = 400 } = {}) {
  if (!mod.has('actions')) throw new Error('audit_views needs actions() to play games with bots.');
  const meta = mod.meta || {};
  const findings = new Map();
  const note = (sev, code, msg, where) => { const k = `${code}:${msg}`; const f = findings.get(k); if (f) f.count++; else findings.set(k, { severity: sev, code, message: msg, first: where, count: 1 }); };
  let views = 0; let logLines = 0; let namedLines = 0;
  for (let g = 0; g < games; g++) {
    const n = players || Math.max(meta.minPlayers || 2, Math.min(meta.maxPlayers || 2, 2 + (g % 3)));
    const ps = testPlayers(meta, n);
    const rand = makeRandom(seed + g * 101).api;
    let { state, rng } = mod.setup(ps, seed + g, { content }, 1_700_000_000_000);
    let now = 1_700_000_000_000; let prevLog = [];
    for (let m = 0; m <= maxMoves; m++) {
      const seen = new Map(); // object id → { up: viewers seeing it face-up, downFace: viewers sent its face while face-down }
      const track = (id) => { if (!seen.has(id)) seen.set(id, { up: new Set(), downFace: new Set() }); return seen.get(id); };
      for (const p of ps) {
        const v = mod.view(state, p); views++;
        const where = { game: g, move: m, viewer: p.id };
        if (!v || v.type !== 'tabletop') { note('warn', 'not_tabletop', 'view() did not return a tabletop view', where); continue; }
        checkScene(v).forEach((e) => note('error', 'scene', e, where));
        const zones = new Map((v.scene.zones || []).map((z) => [z.id, z]));
        for (const o of v.scene.objects || []) {
          const z = zones.get(o.zone);
          if (o.kind === 'card' || o.kind === 'deck') {
            if (o.faceUp === false && o.face != null) track(o.id).downFace.add(p.id);
            else if (o.faceUp !== false && o.face != null) track(o.id).up.add(p.id);
          }
          if (o.kind === 'card' && z?.seat && z.seat !== p.id && z.layout === 'fan' && o.faceUp !== false) {
            note('warn', 'leak_opponent_hand', `opponent hand zone "${z.id}" shows face-up cards to ${p.id}`, { ...where, object: o.id });
          }
          if (o.kind === 'card' && z && !z.seat && !z.label && o.faceUp !== false) note('info', 'unlabelled_zone', `centre zone "${z.id}" has cards but no label (Spotlight caption "→ …" will be missing)`, where);
        }
        if (!(v.hud?.players || []).some((x) => x.active) && !(v.scene.seats || []).some((s) => s.active) && !mod.endIf(state) && !state.$deadline) note('info', 'no_active_player', 'no player is marked active (turn indicator stays empty)', where);
      }
      // Face data for a face-down card is fine when only privileged players get it (you know your own hidden card).
      // It is a leak when someone sees the card face-up while another player gets its face although it is face-down
      // for them, or when every player gets the face of a card nobody sees face-up.
      if (ps.length > 1) {
        for (const [id, { up, downFace }] of seen) {
          if (!downFace.size) continue;
          const leakedTo = up.size ? [...downFace].filter((v) => !up.has(v)) : downFace.size === ps.length ? [...downFace] : [];
          for (const v of leakedTo) note('error', 'leak_face_down', `"${id}" is face-down for ${v} but its face data is still sent to ${v} — omit face for players who must not see it`, { game: g, move: m, viewer: v, object: id });
        }
      }
      const view0 = mod.view(state, ps[0]);
      const log = view0?.hud?.log || [];
      if (!view0?.hud?.log) note('warn', 'no_log', 'hud.log is missing (the game log and Spotlight captions rely on it)', { game: g, move: m });
      for (const line of newLines(prevLog, log)) { logLines++; if (ps.some((p) => String(line).includes(p.name))) namedLines++; }
      prevLog = log;
      if (mod.endIf(state)) break;
      const movers = ps.filter((p) => (mod.actions(state, p) || []).some((a) => !a.free));
      if (!movers.length) {
        const d = state.$deadline;
        if (!d) { note('error', 'stuck', 'nobody can move and the game has not ended', { game: g, move: m }); break; }
        now = Math.max(now, d.at);
        const r = mod.move(state, d.move, { playerId: d.playerId, player: ps.find((p) => p.id === d.playerId) || { id: 'system' }, args: d.args, now }, rng);
        if (r.error) { note('error', 'deadline_rejected', `sand-timer move ${d.move} rejected: ${r.error}`, { game: g, move: m }); break; }
        ({ state, rng } = r); continue;
      }
      const p = rand.pick(movers);
      const c = chooseBotMove(mod, state, p, rand);
      now += 1500;
      const r = mod.move(state, c.name, { playerId: p.id, player: p, args: c.args, now }, rng);
      if (r.error) { note('error', 'rejected', `actions() offered ${c.name} ${JSON.stringify(c.args)} but move() said: ${r.error}`, { game: g, move: m, player: p.id }); break; }
      ({ state, rng } = r);
    }
  }
  if (logLines && namedLines / logLines < 0.5) note('info', 'log_without_names', `${logLines - namedLines} of ${logLines} log lines mention no player name (Spotlight cannot attribute those moves)`, {});
  const list = [...findings.values()].sort((a, b) => ['error', 'warn', 'info'].indexOf(a.severity) - ['error', 'warn', 'info'].indexOf(b.severity));
  return { games, views, logLines, findings: list };
}
