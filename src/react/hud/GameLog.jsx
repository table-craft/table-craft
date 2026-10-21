// Game log: hud.log lines + events seen by the engine (revealed cards, dice results, banners) on a single
// timeline. Player names are highlighted in their colors; card thumbnails enlarge on click.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardCanvas } from './CardCanvas';
import { Icon } from './icons';
import { useStrings } from '../i18n';

const FILTERS = ['all', 'moves', 'cards', 'dice'];
const inFilter = (f, e) => f === 'all' || (f === 'cards' ? e.kind === 'spot' : f === 'dice' ? e.kind === 'roll' : e.kind !== 'spot' && e.kind !== 'roll');
const hhmm = (t, loc) => new Date(t).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function logText(e, S) {
  if (e.kind === 'spot') return `${e.actor?.name || S.table} ${e.verb}: ${e.items.map((i) => i.title || i.caption || '').filter(Boolean).join(', ')}`;
  if (e.kind === 'roll') return `${e.actor?.name || S.dice} ${S.rolled}: ${e.values.join(' · ')}`;
  if (e.kind === 'banner') return `== ${e.text}${e.sub ? ` — ${e.sub}` : ''} ==`;
  return e.text;
}

export default function GameLog({ entries, players, world, onInspect, onClose }) {
  const S = useStrings();
  const loc = S.dateLocale;
  const [filter, setFilter] = useState('all');
  const [stuck, setStuck] = useState(true);
  const box = useRef(null);
  const list = useMemo(() => entries.filter((e) => inFilter(filter, e)), [entries, filter]);

  // single regex to color player names (longer names first)
  const names = useMemo(() => {
    const ps = (players || []).filter((p) => p.name);
    const byName = new Map(ps.map((p) => [p.name, p]));
    const re = ps.length ? new RegExp(`(${[...byName.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})`, 'g') : null;
    return { re, byName };
  }, [players]);
  const colorize = (text) => {
    if (!names.re || !text) return text;
    return String(text).split(names.re).map((part, i) => {
      const p = names.byName.get(part);
      return p ? <b key={i} className="tc-name" style={{ '--pc': p.color || '#c8a24a' }}>{part}</b> : part;
    });
  };

  // stays pinned to bottom when at bottom (even if late thumbnails grow the height); released when user scrolls up
  const stuckRef = useRef(true); stuckRef.current = stuck;
  const auto = useRef(0);
  const toBottom = () => { const el = box.current; if (el) { auto.current = performance.now(); el.scrollTop = el.scrollHeight; } };
  useEffect(() => { if (stuck) toBottom(); }, [list.length, stuck]);
  useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => { if (stuckRef.current) toBottom(); });
    for (const c of el.children) ro.observe(c);
    ro.observe(el);
    return () => ro.disconnect();
  }, [list.length]);
  const onScroll = () => {
    const el = box.current; if (!el || performance.now() - auto.current < 150) return;
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };
  const copy = () => { navigator.clipboard?.writeText(entries.map((e) => `[${hhmm(e.t, loc)}] ${logText(e, S)}`).join('\n')).catch(() => {}); };

  return (
    <div className="tc-log">
      <div className="tc-log-h">
        <Icon name="log" size={16} /><b>{S.logTitle}</b>
        <span className="tc-log-n">{entries.length}</span>
        <div className="tc-log-tools">
          <button className="tc-iconbtn" title={S.copyLog} onClick={copy}><Icon name="copy" size={15} /></button>
          <button className="tc-iconbtn" title={S.closeLog} onClick={onClose}><Icon name="close" size={15} /></button>
        </div>
      </div>
      <div className="tc-seg tc-log-f">
        {FILTERS.map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{S.filters[f]}</button>)}
      </div>
      <div className="tc-log-b" ref={box} onScroll={onScroll}>
        {!list.length && <div className="tc-log-empty">{S.logEmpty}</div>}
        {list.map((e) => {
          if (e.kind === 'round' || e.kind === 'banner') {
            return <div key={e.key} className="tc-log-round"><span>{e.text}</span>{e.sub && <small>{e.sub}</small>}</div>;
          }
          if (e.kind === 'spot') {
            return (
              <div key={e.key} className="tc-log-spot" style={{ '--pc': e.actor?.color || '#c8a24a' }}>
                <div className="tc-log-row"><Icon name="cards" size={14} /><span><b className="tc-name">{e.actor?.name || S.table}</b> {e.verb}</span><time>{hhmm(e.t, loc)}</time></div>
                {e.text && <div className="tc-log-sub">{colorize(e.text)}</div>}
                <div className="tc-log-thumbs">
                  {e.items.slice(0, 8).map((it, i) => <CardCanvas key={`${it.id}:${i}`} world={world} item={it} height={62} onClick={() => onInspect(it)} title={it.caption || S.enlarge} />)}
                  {e.items.length > 8 && <span className="tc-log-more">+{e.items.length - 8}</span>}
                </div>
              </div>
            );
          }
          if (e.kind === 'roll') {
            return <div key={e.key} className="tc-log-row roll"><Icon name="dice" size={14} /><span><b className="tc-name" style={{ '--pc': e.actor?.color }}>{e.actor?.name || S.dice}</b> {S.rolled}: <b className="tc-roll">{e.values.join(' · ')}</b></span><time>{hhmm(e.t, loc)}</time></div>;
          }
          return (
            <div key={e.key} className={`tc-log-row ${e.tone || ''} ${e.mine ? 'mine' : ''}`}>
              {e.tag ? <em>{e.tag}</em> : <i className="tc-log-dot" />}
              <span>{colorize(e.text)}</span>
              <time>{hhmm(e.t, loc)}</time>
            </div>
          );
        })}
      </div>
      {!stuck && <button className="tc-log-jump" onClick={() => setStuck(true)}><Icon name="down" size={14} /> {S.newEntries}</button>}
    </div>
  );
}
