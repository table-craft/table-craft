// <ReplayViewer>: a recorded game on the 3D table with a transport bar — play/pause, step, speed, scrubber with
// markers (rejected moves, banners), the current move and whose eyes you watch through.
import { useEffect, useMemo, useRef, useState } from 'react';
import Tabletop from './Tabletop';
import { useMatch } from './Game';
import { buildStrings } from './i18n';
import { Icon } from './hud/icons';

const SPEEDS = [0.5, 1, 2, 4];

export function ReplayViewer({ replay, locale = 'en', strings, height = '78vh', className = '', style }) {
  const S = useMemo(() => buildStrings(locale, strings), [locale, strings]);
  const { snapshot: s, tableProps } = useMatch(replay);

  // The table animates the difference between two views. That is right for one move forward, wrong for jumps,
  // steps back or a new viewer (it would invent "moves" in the Spotlight and the log). For those the table keeps
  // showing the previous frame and is then rebuilt at the target frame (debounced while scrubbing).
  const [shown, setShown] = useState({ epoch: 0, props: tableProps });
  const last = useRef({ index: 0, viewer: null });
  const rebuild = useRef(null);
  useEffect(() => {
    if (!s || !tableProps) return;
    const prev = last.current;
    const forwardOne = s.index === prev.index + 1 && s.viewer === prev.viewer;
    const same = s.index === prev.index && s.viewer === prev.viewer;
    last.current = { index: s.index, viewer: s.viewer };
    if (forwardOne || same) { clearTimeout(rebuild.current); setShown((x) => ({ ...x, props: tableProps })); return; }
    clearTimeout(rebuild.current);
    const props = { ...tableProps, fx: null };
    rebuild.current = setTimeout(() => setShown((x) => ({ epoch: x.epoch + 1, props })), s.viewer !== prev.viewer ? 0 : 140);
  }, [tableProps]); // eslint-disable-line
  useEffect(() => () => clearTimeout(rebuild.current), []);

  // ← → step, Space play/pause (unless the table used it to skip a Spotlight entry)
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); replay.step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); replay.step(-1); }
      else if (e.key === ' ') { e.preventDefault(); if (replay.getSnapshot()?.playing) replay.pause(); else replay.play(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replay]);
  useEffect(() => () => replay?.dispose?.(), [replay]);

  if (!s) return null;
  if (s.status === 'error') return <div className="tc-wrap tc-center">{s.error}</div>;
  const lastIndex = Math.max(1, s.length - 1);
  const pct = (i) => `${(i / lastIndex) * 100}%`;
  const label = s.frame?.index ? s.frame.label : S.rpSetup;

  return (
    <div className={`tc-replay ${className}`} style={{ height, ...style }}>
      <Tabletop key={shown.epoch} {...(shown.props || tableProps)} onMove={() => {}} locale={locale} strings={strings} className="tc-replay-table"
        headerExtra={<div className="tc-replay-tag"><Icon name="play" size={12} /> {S.replay}</div>} />
      <div className="tc-replay-bar">
        {!s.ok && s.error && <div className="tc-replay-warn"><Icon name="alert" size={14} /> {S.rpDiverged(String(s.error).match(/\d+/)?.[0] || '?')}</div>}
        <div className="tc-replay-row">
          <div className="tc-replay-btns">
            <button className="tc-iconbtn" title={S.rpBack} onClick={() => replay.step(-1)} disabled={s.index === 0}><Icon name="next" size={16} className="tc-flip" /></button>
            <button className="tc-replay-play" title={s.playing ? S.rpPause : S.rpPlay} onClick={() => (s.playing ? replay.pause() : replay.play())}>
              <Icon name={s.playing ? 'pause' : 'play'} size={16} />
            </button>
            <button className="tc-iconbtn" title={S.rpForward} onClick={() => replay.step(1)} disabled={s.index >= s.length - 1}><Icon name="next" size={16} /></button>
          </div>
          <div className="tc-replay-track">
            <div className="tc-replay-marks">
              {s.timeline.map((t) => (t.rejected || t.banner) && (
                <i key={t.index} className={t.rejected ? 'rej' : 'ban'} style={{ left: pct(t.index) }} title={t.rejected ? `${t.label} — ${S.rpRejected}` : t.banner} />
              ))}
            </div>
            <input type="range" min="0" max={s.length - 1} value={s.index} onChange={(e) => replay.seek(Number(e.target.value))} aria-label={S.rpMove(s.index, s.length - 1)} />
          </div>
          <div className="tc-replay-info">
            <span className="tc-replay-n">{S.rpMove(s.index, s.length - 1)}</span>
            <span className={`tc-replay-move ${s.frame?.rejected ? 'rej' : ''}`} title={label}>{label}{s.frame?.rejected ? ` · ${S.rpRejected}` : ''}</span>
          </div>
        </div>
        <div className="tc-replay-row tc-replay-opts">
          <label>{S.rpSpeed}
            <div className="tc-seg">{SPEEDS.map((x) => <button key={x} className={s.speed === x ? 'on' : ''} onClick={() => replay.setSpeed(x)}>{x}×</button>)}</div>
          </label>
          <label>{S.rpViewer}
            <select value={s.viewer} onChange={(e) => replay.setViewer(e.target.value)}>
              {s.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="spectator">{S.rpSpectator}</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

export default ReplayViewer;
