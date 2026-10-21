// Structural checks for a tabletop view (used by validate() and the referee).
import { msg } from './messages.js';

export function checkScene(v) {
  const problems = [];
  if (!v || v.type !== 'tabletop') return problems;
  const sc = v.scene;
  if (!sc || typeof sc !== 'object') return [msg('sceneMissing')];
  const zones = new Set();
  for (const z of sc.zones || []) {
    if (!z || !z.id) { problems.push(msg('zoneNoId')); continue; }
    if (zones.has(z.id)) problems.push(msg('zoneDup', z.id));
    zones.add(z.id);
  }
  const ids = new Set();
  for (const o of sc.objects || []) {
    if (!o || !o.id || !o.kind) { problems.push(msg('objNoId', JSON.stringify(o).slice(0, 80))); continue; }
    if (ids.has(o.id)) problems.push(msg('objDup', o.id));
    ids.add(o.id);
    if (o.zone && !zones.has(o.zone)) problems.push(msg('objZone', o.id, o.zone));
    if (o.enterFrom && !zones.has(o.enterFrom) && !ids.has(o.enterFrom)) problems.push(msg('objEnter', o.id, o.enterFrom));
  }
  const zoneById = new Map((sc.zones || []).filter((z) => z && z.id).map((z) => [z.id, z]));
  const okPlace = (v, n) => { const p = Array.isArray(v) ? v : String(v).split(','); return p.length >= n && p.slice(0, n).every((x) => Number.isInteger(Number(x)) && String(x).trim() !== ''); };
  const isCorner = (v) => v == null || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < 6);
  for (const o of sc.objects || []) {
    if (!o || !o.id) continue;
    if (o.anchor && !ids.has(o.anchor)) problems.push(msg('objAnchor', o.id, o.anchor));
    if (o.kind === 'link') {
      for (const e of [o.from, o.to]) {
        if (typeof e === 'string' ? !ids.has(e) : !e || typeof e !== 'object') problems.push(msg('linkEnd', o.id, JSON.stringify(e ?? null)));
        else if (typeof e === 'object' && !Array.isArray(e) && (e.zone || o.zone) && !zones.has(e.zone || o.zone)) problems.push(msg('objZone', o.id, e.zone || o.zone));
      }
      continue;
    }
    const z = o.zone && zoneById.get(o.zone);
    if (z && z.layout === 'hex') {
      if (o.cell == null && o.vertex == null && o.edge == null && !o.at) problems.push(msg('hexNoCell', o.id, z.id));
      const bad = (o.cell != null && !okPlace(o.cell, 2)) || (o.vertex != null && !okPlace(o.vertex, 3)) || (o.edge != null && !okPlace(o.edge, 3)) || !isCorner(o.corner) || !isCorner(o.side);
      if (bad) problems.push(msg('hexBadCell', o.id, JSON.stringify({ cell: o.cell, vertex: o.vertex, edge: o.edge, corner: o.corner, side: o.side })));
    }
  }
  return problems.slice(0, 10);
}
