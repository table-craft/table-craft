// Spotlight: cards revealed / played by other players, shown one by one, large and legible. Each entry
// stays long enough to read; pauses on hover, can be pinned, skipped with Space.
// If the queue builds up (fast bot moves) durations shrink so it doesn't lag the table.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardCanvas } from './CardCanvas';
import { Icon } from './icons';
import { useStrings } from '../i18n';

const MAX_SHOWN = 6;

export function spotDuration(entry, queued, scale = 1) {
  if (!entry) return 0;
  const n = Math.min(MAX_SHOWN, entry.items.length);
  const base = 2400 + 550 * n + (entry.text ? 900 : 0);
  return Math.round(base * scale * (queued >= 3 ? 0.55 : queued >= 1 ? 0.8 : 1));
}

export default function Spotlight({ entry, world, queued, mode = 'center', scale = 1, onDone, onInspect }) {
  const S = useStrings();
  const [hover, setHover] = useState(false);
  const [held, setHeld] = useState(false);
  const left = useRef(0);
  const dur = useMemo(() => spotDuration(entry, queued, scale), [entry?.key]); // eslint-disable-line

  useEffect(() => {
    if (!entry) return;
    left.current = dur;
    setHeld(false);
  }, [entry?.key]); // eslint-disable-line

  useEffect(() => {
    if (!entry || hover || held) return undefined;
    const start = performance.now();
    const id = setTimeout(() => onDone(entry.key), Math.max(200, left.current));
    return () => { clearTimeout(id); left.current -= performance.now() - start; };
  }, [entry?.key, hover, held]); // eslint-disable-line

  if (!entry) return null;
  const items = entry.items.slice(0, MAX_SHOWN);
  const more = entry.items.length - items.length;
  const n = items.length;
  const h = mode === 'side' ? (n <= 2 ? 150 : 112) : n <= 2 ? 260 : n <= 4 ? 210 : 160;
  const running = !hover && !held;

  return (
    <div className={`tc-spot tc-spot-${mode}`} style={{ '--ac': entry.actor?.color || '#c8a24a' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="tc-spot-h">
        <span className="tc-avatar sm" style={{ '--pc': entry.actor?.color || '#c8a24a' }}>{(entry.actor?.name || '?').charAt(0).toLocaleUpperCase('tr')}</span>
        <div className="tc-spot-title">
          <b>{entry.actor?.name || S.table}</b>
          <span>{entry.verb}</span>
        </div>
        {queued > 0 && <em className="tc-spot-q" title={S.queued}>+{queued}</em>}
        <div className="tc-spot-tools">
          <button className="tc-iconbtn" title={held ? S.resume : S.hold} onClick={() => setHeld(!held)}><Icon name={held ? 'play' : 'pin'} size={16} /></button>
          <button className="tc-iconbtn" title={S.skip} onClick={() => onDone(entry.key)}><Icon name="next" size={16} /></button>
        </div>
      </div>
      {entry.text && <div className="tc-spot-text">{entry.text}</div>}
      <div className="tc-spot-cards">
        {items.map((it, i) => (
          <figure key={`${it.id}:${i}`} style={{ '--i': i }}>
            <CardCanvas world={world} item={it} height={h} onClick={() => onInspect(it)} title={S.enlarge} />
            {it.caption && <figcaption>{it.caption}</figcaption>}
          </figure>
        ))}
        {more > 0 && <div className="tc-spot-more">+{more}</div>}
      </div>
      <div className="tc-spot-bar"><i key={entry.key} style={{ animationDuration: `${dur}ms`, animationPlayState: running ? 'running' : 'paused' }} /></div>
    </div>
  );
}
