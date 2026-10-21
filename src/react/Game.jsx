// High-level React API: useMatch() turns any MatchClient (createLocalMatch / connectRoom) into props for
// <Tabletop>, and <TablecraftGame> renders lobby + table + end screen for it.
import { useMemo, useSyncExternalStore } from 'react';
import Tabletop from './Tabletop';
import UiNode from './UiNode';
import { buildStrings } from './i18n';
import { Icon } from './hud/icons';

const noop = () => () => {};

export function useMatch(client) {
  const snap = useSyncExternalStore(client ? client.subscribe : noop, client ? client.getSnapshot : () => null, () => null);
  const tableProps = useMemo(() => (snap && client ? {
    view: snap.view, fx: snap.fx, assets: snap.assets, you: snap.you, result: snap.result, serverOffset: snap.serverOffset || 0,
    onMove: (m) => client.move(m.name, m.args),
    pace: snap.pace,
    onPace: snap.you && snap.host === snap.you.id && snap.canBots ? (p) => client.setPace(p) : undefined,
  } : null), [snap, client]);
  return { snapshot: snap, tableProps, isHost: !!(snap?.you && snap.host === snap.you.id) };
}

export function Lobby({ client, snapshot: s, locale = 'en', strings, name }) {
  const S = useMemo(() => buildStrings(locale, strings), [locale, strings]);
  const seats = s.meta?.seats?.length ? s.meta.seats : [{ id: null, label: S.player, max: 99 }];
  const isHost = s.you && s.host === s.you.id;
  return (
    <div className="tc-lobby">
      <div className="tc-lobby-h">
        <div><div className="tc-lobby-k">{S.lobby}</div><h2>{s.meta?.name || 'Tablecraft'}</h2>{s.meta?.description && <p>{s.meta.description}</p>}</div>
        {isHost && <button className="tc-btn primary" onClick={() => client.start()}><Icon name="play" size={15} /> {S.start}</button>}
      </div>
      <div className="tc-lobby-k">{S.pickSeat}</div>
      <div className="tc-seats">
        {seats.map((seat) => {
          const ps = s.players.filter((p) => p.seat === seat.id);
          const mine = s.you?.seat === seat.id && s.you;
          return (
            <div key={seat.id || 'any'} className={`tc-seat ${mine ? 'mine' : ''}`}>
              <div className="tc-seat-h"><b>{seat.label}</b><span>{ps.length}/{seat.max || '∞'}</span></div>
              <div className="tc-seat-p">{ps.map((p) => p.name).join(', ') || <i>{S.empty}</i>}</div>
              <div className="tc-seat-a">
                <button className="tc-ui-btn" disabled={!!mine} onClick={() => client.join(seat.id, name)}>{mine ? S.here : S.sit}</button>
                {isHost && s.canBots && (!seat.max || ps.length < seat.max) && <button className="tc-ui-btn" onClick={() => client.addBot(seat.id)}><Icon name="bot" size={14} /> {S.addBot}</button>}
                {isHost && ps.filter((p) => p.id.startsWith('bot_')).map((p) => <button key={p.id} className="tc-ui-btn" onClick={() => client.removeBot(p.id)}>✕ {p.name}</button>)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="tc-lobby-f">{isHost ? S.hostHint : S.guestHint}{s.code && s.code !== 'LOCAL' && <> · <code>{s.code}</code></>}</div>
    </div>
  );
}

// Everything in one component: lobby → 3D table → end screen.
export function TablecraftGame({ client, locale = 'en', strings, name, className, style, headerExtra }) {
  const { snapshot: s, tableProps, isHost } = useMatch(client);
  const S = useMemo(() => buildStrings(locale, strings), [locale, strings]);
  if (!s) return <div className="tc-wrap tc-center">{S.connecting}</div>;
  if (s.status === 'error') return <div className="tc-wrap tc-center">{s.error}</div>;
  if (s.status === 'lobby') return <div className={`tc-wrap tc-lobby-wrap ${className || ''}`} style={style}><Lobby client={client} snapshot={s} locale={locale} strings={strings} name={name} /></div>;
  if (!s.view) return <div className="tc-wrap tc-center">{s.viewError || S.connecting}</div>;
  if (s.view.type !== 'tabletop') { // plain 2D UI nodes: quick prototypes without a 3D scene
    return (
      <div className={`tc-wrap tc-2d ${className || ''}`} style={style}>
        <div className="tc-2d-inner"><UiNode node={s.view} onMove={tableProps.onMove} /></div>
      </div>
    );
  }
  return (
    <Tabletop {...tableProps} locale={locale} strings={strings} className={className} style={style}
      headerExtra={<>{headerExtra}{isHost && s.status !== 'playing' && <div className="tc-toolgroup"><button data-tip={S.newGame} onClick={() => client.restart()}><Icon name="next" /></button></div>}</>} />
  );
}
