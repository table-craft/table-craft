// Settings, controls help and the end-of-game scoreboard.
import { Icon } from './icons';
import { useStrings } from '../i18n';

const Seg = ({ value, options, onChange }) => (
  <div className="tc-seg">
    {options.map(([v, label]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>)}
  </div>
);

export function SettingsPanel({ settings, set, muted, onMute, pace, onPace, onClose }) {
  const S = useStrings();
  return (
    <div className="tc-pop tc-settings" onClick={(e) => e.stopPropagation()}>
      <div className="tc-pop-h"><Icon name="settings" size={16} /><b>{S.settingsTitle}</b><button className="tc-iconbtn" onClick={onClose} title={S.close}><Icon name="close" size={15} /></button></div>
      <label className="tc-field"><span>{S.sound}</span>
        <div className="tc-row">
          <button className="tc-iconbtn" onClick={onMute} title={muted ? S.unmute : S.mute}><Icon name={muted ? 'mute' : 'sound'} size={16} /></button>
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={(e) => set({ volume: Number(e.target.value) })} disabled={muted} />
        </div>
      </label>
      <label className="tc-field"><span>{S.animSpeed}</span>
        <Seg value={settings.anim} onChange={(v) => set({ anim: v })} options={[['cinematic', S.cinematic], ['normal', S.normal], ['fast', S.fast]]} />
      </label>
      <label className="tc-field"><span>{S.spotlight} <small>{S.spotlightHint}</small></span>
        <Seg value={settings.spot} onChange={(v) => set({ spot: v })} options={[['center', S.big], ['side', S.side], ['off', S.off]]} />
      </label>
      <label className="tc-check"><input type="checkbox" checked={settings.spotSelf} onChange={(e) => set({ spotSelf: e.target.checked })} /> {S.spotSelf}</label>
      <label className="tc-check"><input type="checkbox" checked={settings.autoFocus} onChange={(e) => set({ autoFocus: e.target.checked })} /> {S.autoFocus}</label>
      <label className="tc-field"><span>{S.quality}</span>
        <Seg value={settings.quality} onChange={(v) => set({ quality: v })} options={[['high', S.high], ['low', S.performance]]} />
      </label>
      {onPace && (
        <label className="tc-field"><span>{S.botPace} <small>{S.botPaceHint}</small></span>
          <Seg value={pace || 'normal'} onChange={onPace} options={[['slow', S.slow], ['normal', S.normal], ['fast', S.fast]]} />
        </label>
      )}
    </div>
  );
}

export function HelpPanel({ onClose }) {
  const S = useStrings();
  return (
    <div className="tc-pop tc-help" onClick={(e) => e.stopPropagation()}>
      <div className="tc-pop-h"><Icon name="help" size={16} /><b>{S.controls}</b><button className="tc-iconbtn" onClick={onClose} title={S.close}><Icon name="close" size={15} /></button></div>
      <div className="tc-help-grid">
        {S.helpRows.map(([k, d]) => [<span key={`k${k}`} className="tc-kbd">{k}</span>, <span key={`d${k}`}>{d}</span>])}
      </div>
    </div>
  );
}

// endIf() result: { winner | winners, reason, scores: { playerId: points } | ranking: [{ id, place, name, score }] }
export function ResultModal({ result, players = [], youId, onClose }) {
  const S = useStrings();
  if (!result) return null;
  const r = typeof result === 'object' ? result : { reason: String(result) };
  const byId = new Map(players.map((p) => [p.id, p]));
  const winIds = Array.isArray(r.winners) ? r.winners : r.winner ? String(r.winner).split(',') : [];
  const winners = winIds.map((id) => byId.get(id)?.name || id).filter(Boolean);
  const iWon = youId && winIds.includes(youId);
  let rows = [];
  if (Array.isArray(r.ranking)) rows = r.ranking.map((x, i) => ({ place: x.place ?? i + 1, name: x.name ?? byId.get(x.id)?.name ?? x.id, score: x.score, color: byId.get(x.id)?.color }));
  else if (r.scores && typeof r.scores === 'object') {
    rows = Object.entries(r.scores).map(([k, v]) => ({ name: byId.get(k)?.name || k, score: v, color: byId.get(k)?.color }))
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)).map((x, i) => ({ ...x, place: i + 1 }));
  }
  const nameColor = (n) => players.find((p) => p.name === n)?.color;
  return (
    <div className="tc-modal" onClick={onClose}>
      <div className="tc-result" onClick={(e) => e.stopPropagation()}>
        <div className="tc-result-crest"><Icon name="trophy" size={34} /></div>
        <div className="tc-result-k">{S.gameOver}</div>
        <h2>{iWon ? S.youWon : winners.length ? S.won(winners.join(' & ')) : S.result}</h2>
        {r.reason && <p>{r.reason}</p>}
        {rows.length > 0 && (
          <ol className="tc-rank">
            {rows.map((x, i) => (
              <li key={i} className={x.place === 1 ? 'first' : ''} style={{ '--pc': x.color || nameColor(x.name) || '#8b93a7' }}>
                <span className="tc-rank-p">{x.place}</span><span className="tc-rank-n">{x.name}</span><b>{x.score ?? ''}</b>
              </li>
            ))}
          </ol>
        )}
        <button className="tc-btn primary" onClick={onClose}><Icon name="eye" size={16} /> {S.inspectTable}</button>
      </div>
    </div>
  );
}
