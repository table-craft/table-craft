// <Tabletop>: the 3D table + HUD for one player's view ({ type: 'tabletop', scene, hud } from the game's view()).
// HUD layers: top bar (title · turn indicator · tools), players, Spotlight (other players' moves), game log,
// decision dock (hud.prompt), banner/toast queues, card close-up and the end-of-game scoreboard.
import { useEffect, useMemo, useRef, useState } from 'react';
import UiNode from './UiNode';
import { TabletopWorld } from '../engine/world';
import { TableAudio } from '../engine/audio';
import { Icon } from './hud/icons';
import Spotlight from './hud/Spotlight';
import GameLog from './hud/GameLog';
import { CardCanvas, CardInspector } from './hud/CardCanvas';
import { SettingsPanel, HelpPanel, ResultModal } from './hud/Panels';
import { StringsContext, buildStrings } from './i18n';
import './tablecraft.css';

let sharedAudio = null;
const audioInstance = () => (sharedAudio ||= new TableAudio());

const SET_KEY = 'tablecraft:settings';
const DEFAULTS = { anim: 'normal', spot: 'center', spotSelf: false, quality: 'high', volume: 0.8, autoFocus: false, logOpen: false };
const ANIM = { cinematic: 1.45, normal: 1, fast: 0.65 };
const loadSettings = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SET_KEY) || '{}') }; } catch { return { ...DEFAULTS }; } };
const LOG_MAX = 400;
const BANNER_MIN = 700;
const bannerMs = (b) => Math.min(6000, b.ms || 2600);
let keySeq = 0;
const nk = () => ++keySeq;
const isBotId = (id) => typeof id === 'string' && id.startsWith('bot_');

// verb for card movements detected from scene diffs
function verbOf(items, actorId, V) {
  const reasons = new Set(items.map((i) => i.reason));
  const n = items.length;
  if (reasons.size > 1) return V.mixed;
  const it = items[0];
  if (actorId && it.toSeat && items.every((i) => i.toSeat && i.toSeat !== actorId) && it.reason !== 'flip') return V.give(n);
  switch (it.reason) {
    case 'discard': return V.discard(n);
    case 'flip': return V.flip(n);
    case 'enter': return it.toSeat ? V.take(n) : V.deal(n);
    case 'move':
      if (it.fromSeat && !it.toSeat) return V.play(n);
      if (!it.fromSeat && it.toSeat) return V.take(n);
      if (it.fromSeat && it.toSeat) return V.give(n);
      return V.moveCard(n);
    default: return V.show(n);
  }
}

// "T3 · ..." prefixes become a round chip; "— Round 3 —" lines become dividers
function lineEntry(raw, myName) {
  let text = String(raw ?? ''); let tag = null;
  const m = text.match(/^(T\d+|Tur \d+|R\d+)\s*[·:|-]\s*(.*)$/);
  if (m) { tag = m[1]; text = m[2]; }
  const r = text.match(/^[—–-]{1,3}\s*(.+?)\s*[—–-]{1,3}$/);
  if (r) return { key: nk(), t: Date.now(), kind: 'round', text: r[1] };
  return { key: nk(), t: Date.now(), kind: 'line', text, tag, mine: !!myName && text.includes(myName) };
}

function Preview({ world, hover }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    const c = hover && world?.preview(hover.id);
    if (c) { c.className = 'tc-preview-canvas'; el.appendChild(c); }
  }, [world, hover?.id, hover && JSON.stringify(hover.spec?.face), hover?.spec?.faceUp]); // eslint-disable-line
  return <div className="tc-preview" ref={ref} />;
}

const cardItem = (id, sp) => {
  const up = sp.kind === 'deck' ? !!sp.faceUp : sp.faceUp !== false;
  return { id, face: sp.face, back: sp.back, size: sp.size, faceUp: up && sp.face != null, tip: sp.tip };
};

export default function Tabletop({ view, fx, assets, onMove, you, serverOffset = 0, result, headerExtra, pace, onPace, locale = 'en', strings, className = '', style }) {
  const S = useMemo(() => buildStrings(locale, strings), [locale, strings]);
  const wrap = useRef(null);
  const canvas = useRef(null);
  const world = useRef(null);
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState(null);
  const [inspect, setInspect] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const bannerNow = useRef(null);   // the banner on screen (sync, so banners in one fx batch see each other)
  const bannerNext = useRef(null);  // timer for a banner waiting for the current one's minimum read time
  const [spots, setSpots] = useState([]);
  const [log, setLog] = useState([]);
  const [unread, setUnread] = useState(0);
  const [settings, setSettings] = useState(loadSettings);
  const [muted, setMuted] = useState(() => audioInstance().muted);
  const [panels, setPanels] = useState({});
  const [pop, setPop] = useState(null); // 'settings' | 'help'
  const [full, setFull] = useState(false);
  const [promptMin, setPromptMin] = useState(false);
  const [turnSplash, setTurnSplash] = useState(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [, force] = useState(0);
  const scene = view?.scene;
  const hud = view?.hud || {};

  // player lookup: hud.players + scene.seats (name/color)
  const people = useMemo(() => {
    const m = new Map();
    for (const s of scene?.seats || []) m.set(s.id, { id: s.id, name: s.name || s.id, color: s.color });
    for (const p of hud.players || []) m.set(p.id, { ...m.get(p.id), id: p.id, name: p.name || m.get(p.id)?.name || p.id, color: p.color || m.get(p.id)?.color });
    return m;
  }, [scene?.seats, hud.players]);
  const activeIds = useMemo(() => {
    const a = (hud.players || []).filter((p) => p.active).map((p) => p.id);
    return a.length ? a : (scene?.seats || []).filter((s) => s.active).map((s) => s.id);
  }, [hud.players, scene?.seats]);

  // called via ref so the world event handler sees the latest closure
  const ctx = useRef({});
  ctx.current = { people, you, settings, hud, logOpen: settings.logOpen, S };
  const prevActive = useRef(null);
  const recentLines = useRef([]); // lines added to the log in this update (for spotlight actor/caption)
  const moveRef = useRef(onMove); moveRef.current = onMove;
  const spotsRef = useRef(spots); spotsRef.current = spots;

  const addLog = (entries) => {
    const list = Array.isArray(entries) ? entries : [entries];
    if (!list.length) return;
    setLog((l) => [...l, ...list].slice(-LOG_MAX));
    if (!ctx.current.logOpen) setUnread((u) => u + list.filter((e) => e.kind !== 'round' && e.kind !== 'banner').length);
  };
  const who = (id) => (id ? ctx.current.people.get(id) || { id, name: id } : null);

  // new log line naming the card → its player is the actor, the line is the caption
  const lineFor = (title) => {
    if (!title) return null;
    const line = recentLines.current.find((l) => l.includes(title));
    if (!line) return null;
    let best = null;
    for (const p of ctx.current.people.values()) {
      const i = p.name ? line.indexOf(p.name) : -1;
      if (i >= 0 && (!best || i < best.i)) best = { i, id: p.id };
    }
    return { line, actorId: best?.id || null };
  };
  const onlyNamed = () => {
    const ids = new Set();
    for (const l of recentLines.current) for (const p of ctx.current.people.values()) if (p.name && l.includes(p.name)) ids.add(p.id);
    return ids.size === 1 ? [...ids][0] : null;
  };

  const handleSpot = (e) => {
    const { you: me, settings: st } = ctx.current;
    const groups = new Map();
    const texts = new Map();
    const named = onlyNamed();
    for (const it of e.items || []) {
      const hit = lineFor(it.face?.title);
      const actorId = e.by || it.fromSeat || hit?.actorId || named || it.toSeat || prevActive.current || null;
      if (hit?.line && !texts.has(actorId)) texts.set(actorId, lineEntry(hit.line).text);
      const caption = it.zoneLabel ? `→ ${it.zoneLabel}` : it.toSeat ? `→ ${who(it.toSeat)?.name || ''}` : '';
      if (!groups.has(actorId)) groups.set(actorId, []);
      groups.get(actorId).push({ ...it, caption, title: it.face?.title || '' });
    }
    const now = Date.now();
    for (const [actorId, items] of groups) {
      const mine = !!actorId && actorId === me?.id;
      const entry = { key: nk(), t: now, kind: 'spot', actor: who(actorId), actorId, verb: e.title || verbOf(items, actorId, ctx.current.S.verbs), text: e.text || texts.get(actorId) || null, items, mine, auto: !e.explicit };
      const ids = new Set(items.map((i) => i.id));
      const dup = (x) => x.kind === 'spot' && x.auto && now - x.t < 500 && x.items.some((i) => ids.has(i.id));
      if (e.explicit) setLog((l) => l.filter((x) => !dup(x)));
      addLog(entry);
      if (st.spot === 'off' || (mine && !e.explicit && !st.spotSelf)) continue;
      setSpots((q) => [...(e.explicit ? q.filter((x, i) => i === 0 || !dup(x)) : q), entry].slice(-12));
    }
  };

  const onEvent = (e) => {
    const audio = audioInstance();
    switch (e.type) {
      case 'ready': setReady(true); return;
      case 'banner': queueBanner({ ...e, key: nk() }); addLog({ key: nk(), t: Date.now(), kind: 'banner', text: e.text, sub: e.sub }); return;
      case 'toast': {
        const t = { ...e, key: nk() };
        setToasts((l) => [...l.slice(-3), t]);
        if (e.sound !== false) audio.play(e.tone === 'bad' ? 'bad' : e.tone === 'good' ? 'good' : 'notify', { vol: 0.8 });
        setTimeout(() => setToasts((l) => l.filter((x) => x !== t)), e.ms || 4200);
        if (!ctx.current.hud.log) addLog({ key: nk(), t: Date.now(), kind: 'line', text: e.text, tone: e.tone });
        return;
      }
      case 'rolled': addLog({ key: nk(), t: Date.now(), kind: 'roll', actor: who(e.by), values: e.values || [] }); return;
      case 'spot': handleSpot(e); return;
      default: return;
    }
  };
  const onEventRef = useRef(onEvent); onEventRef.current = onEvent;

  useEffect(() => {
    const audio = audioInstance();
    const w = new TabletopWorld(canvas.current, {
      audio,
      youLabel: () => ctx.current.S.youSuffix,
      onMove: (m) => moveRef.current?.(m),
      onHover: (h) => {
        if (!h?.pinned) { setHover(h); return; }
        const sp = h.spec;
        if (sp.kind === 'card' || sp.kind === 'deck') setInspect(cardItem(h.id, sp));
        else { const c = w.preview(h.id); if (c) setInspect({ id: h.id, canvas: c, tip: sp.tip }); }
      },
      onEvent: (e) => onEventRef.current(e),
    });
    world.current = w;
    const st = loadSettings();
    w.setAnimScale(ANIM[st.anim] || 1);
    if (st.quality !== 'high') w.setQuality(st.quality);
    if (typeof window !== 'undefined') window.__tablecraft = w; // devtools: inspect the scene from the console
    force((x) => x + 1);
    return () => { w.dispose(); world.current = null; };
  }, []);

  // settings: persist + apply to engine
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  useEffect(() => {
    try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    world.current?.setAnimScale(ANIM[settings.anim] || 1);
    audioInstance().setVolume(settings.volume);
  }, [settings]);
  const firstQuality = useRef(true);
  useEffect(() => { if (firstQuality.current) { firstQuality.current = false; return; } world.current?.setQuality(settings.quality); }, [settings.quality]);
  useEffect(() => { if (settings.spot === 'off') setSpots([]); }, [settings.spot]);
  useEffect(() => { if (settings.logOpen) setUnread(0); }, [settings.logOpen]);

  useEffect(() => { world.current?.setAssets(assets); }, [assets]);
  useEffect(() => { if (world.current) world.current.serverOffset = serverOffset; }, [serverOffset]);

  // hud.log diff → new log lines (BEFORE scene sync: the line comes before the card thumbnail)
  const prevLog = useRef(null);
  useEffect(() => {
    const cur = hud.log;
    if (!Array.isArray(cur)) return;
    const prev = prevLog.current;
    prevLog.current = cur.slice();
    const myName = you?.name;
    if (!prev) { addLog(cur.map((l) => lineEntry(l, myName))); setUnread(0); return; }
    let j = Math.min(prev.length, cur.length);
    for (; j > 0; j--) {
      let ok = true;
      for (let i = 0; i < j; i++) if (cur[i] !== prev[prev.length - j + i]) { ok = false; break; }
      if (ok) break;
    }
    const added = cur.slice(j);
    recentLines.current = added.map((l) => String(l));
    if (added.length) addLog(added.map((l) => lineEntry(l, myName)));
  }, [hud.log]); // eslint-disable-line

  useEffect(() => { if (scene && world.current) world.current.sync(scene, { youId: you?.id }); }, [scene, you?.id]);
  useEffect(() => { if (fx?.list?.length && world.current) world.current.playFx(fx.list); }, [fx?.seq]); // eslint-disable-line
  // active player: updated AFTER scene sync (spotlight actor = active player before the move)
  useEffect(() => { prevActive.current = activeIds.length === 1 ? activeIds[0] : activeIds.find((id) => id !== you?.id) || activeIds[0] || null; }, [activeIds, you?.id]);

  // when it becomes my turn: chime + "Your turn" + (optional) camera
  const meActive = !!(hud.players || []).find((p) => p.me && p.active) || !!hud.myTurn;
  const wasActive = useRef(meActive);
  useEffect(() => {
    if (meActive && !wasActive.current) {
      audioInstance().play('turn');
      setTurnSplash(nk());
      if (settings.autoFocus) world.current?.setCamera('me');
      setPromptMin(false);
    }
    wasActive.current = meActive;
  }, [meActive]); // eslint-disable-line
  useEffect(() => { if (!turnSplash) return undefined; const t = setTimeout(() => setTurnSplash(null), 1700); return () => clearTimeout(t); }, [turnSplash]);

  // banners never overlap and never hold back a newer one: each stays readable for at least BANNER_MIN ms, then the
  // newest takes over (a countdown banner must not delay "GO!" in a speed game)
  function queueBanner(b) {
    clearTimeout(bannerNext.current);
    const show = () => { bannerNow.current = { ...b, shownAt: Date.now() }; setBanner(bannerNow.current); };
    const cur = bannerNow.current;
    const wait = cur ? BANNER_MIN - (Date.now() - cur.shownAt) : 0;
    if (wait > 0) bannerNext.current = setTimeout(show, wait); else show();
  }
  useEffect(() => {
    if (!banner) return undefined;
    audioInstance().play(banner.sound || 'gong');
    const t = setTimeout(() => { if (bannerNow.current?.key === banner.key) { bannerNow.current = null; setBanner(null); } }, bannerMs(banner));
    return () => clearTimeout(t);
  }, [banner?.key]); // eslint-disable-line
  useEffect(() => () => clearTimeout(bannerNext.current), []);

  // Spotlight: when a new entry appears, the cards glow on the table too
  const spot = spots[0];
  useEffect(() => {
    if (!spot) return;
    audioInstance().play('reveal', { vol: 0.7 });
    world.current?.flash(spot.items.map((i) => i.id), spot.actor?.color || '#7fd3ff', 2200);
  }, [spot?.key]); // eslint-disable-line
  const spotDone = (key) => setSpots((q) => q.filter((x) => x.key !== key));

  // game end
  const hadResult = useRef(!!result);
  useEffect(() => {
    if (result && !hadResult.current) {
      setResultOpen(true);
      const r = typeof result === 'object' ? result : {};
      const won = you?.id && (Array.isArray(r.winners) ? r.winners : String(r.winner || '').split(',')).includes(you.id);
      setTimeout(() => audioInstance().play(won ? 'win' : 'gong'), 400);
    }
    if (!result) setResultOpen(false);
    hadResult.current = !!result;
  }, [result]); // eslint-disable-line

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen(); else wrap.current?.requestFullscreen?.(); };
  const cam = (p) => world.current?.setCamera(p);
  const send = (m) => { audioInstance().play('tap'); onMove(m); };
  const toggleMute = () => { const m = !audioInstance().muted; setMuted(m); audioInstance().setMuted(m); };
  const toggleLog = () => set({ logOpen: !ctx.current.settings.logOpen });

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (!wrap.current?.isConnected) return;
      switch (e.key) {
        case '1': cam('table'); break;
        case '2': cam('me'); break;
        case '3': cam('top'); break;
        case 'l': case 'L': toggleLog(); break;
        case 'm': case 'M': toggleMute(); break;
        case 'f': case 'F': toggleFull(); break;
        case '?': setPop((p) => (p === 'help' ? null : 'help')); break;
        case ' ': if (spotsRef.current.length) { e.preventDefault(); setSpots((q) => q.slice(1)); } break;
        case 'Escape': setPop(null); setInspect(null); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line

  // decision panel height: the right column (log) ends above it
  const promptRef = useRef(null);
  const topRef = useRef(null);
  useEffect(() => {
    const w = wrap.current;
    if (!w) return undefined;
    const measure = () => {
      const el = promptRef.current;
      const wr = w.getBoundingClientRect();
      w.style.setProperty('--tc-prompt-h', `${el ? el.offsetHeight : 0}px`);
      // HUD margins for the camera: the table is framed into the area the HUD leaves free
      // title + toolbar only: the small turn pill may overlap the far rim (it wraps to its own row on narrow tables)
      const bars = topRef.current ? [...topRef.current.querySelectorAll('.tc-title, .tc-tools')] : [];
      const top = bars.length ? Math.max(...bars.map((b) => b.getBoundingClientRect().bottom)) - wr.top + 6 : 0;
      let bottom = 0;
      if (el) {
        const pr = el.getBoundingClientRect();
        const covered = wr.bottom - pr.top + 8;
        bottom = pr.width / wr.width > 0.85 ? covered : Math.min(covered, wr.height * 0.32) * 0.45; // corner dock: partly
      }
      world.current?.setInsets({ top, bottom });
    };
    const ro = new ResizeObserver(measure);
    [w, topRef.current, promptRef.current].forEach((x) => x && ro.observe(x));
    measure();
    return () => ro.disconnect();
  }, [!!hud.prompt, promptMin, ready]); // eslint-disable-line

  const sidePanels = hud.panels || [];
  const isOpen = (p) => panels[p.id] ?? !!p.open;
  const panel = (p) => (
    <div key={p.id} className={`tc-panel ${isOpen(p) ? 'open' : ''}`}>
      <button className="tc-panel-h" onClick={() => setPanels({ ...panels, [p.id]: !isOpen(p) })}>{p.icon && <span className="tc-panel-i">{p.icon}</span>}{p.title}<Icon name={isOpen(p) ? 'down' : 'up'} size={14} className="tc-panel-c" /></button>
      {isOpen(p) && <div className="tc-panel-b"><UiNode node={p.node} onMove={send} /></div>}
    </div>
  );
  const active = activeIds.map((id) => people.get(id)).filter(Boolean);
  const hoverCard = hover && (hover.spec?.kind === 'card' || hover.spec?.kind === 'deck');
  const hoverOther = hover && !hoverCard && (hover.spec?.kind === 'board' || (hover.spec?.kind === 'token' && hover.spec?.face));
  const wrapW = wrap.current?.clientWidth || 1000;
  const hoverSide = hover && hover.x > wrapW / 2 ? 'tc-hover-l' : 'tc-hover-r';
  const hItem = hoverCard ? cardItem(hover.id, hover.spec) : null;
  const playersList = hud.players || [];

  return (
    <StringsContext.Provider value={S}>
    <div className={`tc-wrap ${full ? 'tc-full' : ''} ${ready ? 'ready' : ''} ${className}`} style={style} ref={wrap} onClick={() => pop && setPop(null)}>
      <canvas ref={canvas} className="tc-canvas" />
      <div className="tc-vignette" />
      {!ready && <div className="tc-loading"><div className="tc-spinner" /><span>{S.loading}</span></div>}

      <div className="tc-top" ref={topRef}>
        <div className="tc-title">
          {hud.title && <b>{hud.title}</b>}
          {hud.status && <span>{hud.status}</span>}
        </div>
        <div className="tc-turn-wrap">
          {meActive ? (
            <div className="tc-turn me"><span className="tc-pulse" />{S.yourTurn}</div>
          ) : active.length > 0 ? (
            <div className="tc-turn" style={{ '--pc': active[0].color || '#c8a24a' }}>
              <span className="tc-avatar sm" style={{ '--pc': active[0].color || '#c8a24a' }}>{isBotId(active[0].id) ? <Icon name="bot" size={13} /> : active[0].name.charAt(0).toLocaleUpperCase('tr')}</span>
              <span>{S.turnOf} <b>{active.map((p) => p.name).join(', ')}</b></span>
              <span className="tc-dots"><i /><i /><i /></span>
            </div>
          ) : null}
        </div>
        <div className="tc-tools" onClick={(e) => e.stopPropagation()}>
          {headerExtra}
          <div className="tc-toolgroup">
            <button data-tip={S.camTable} onClick={() => cam('table')}><Icon name="table" /></button>
            <button data-tip={S.camMe} onClick={() => cam('me')}><Icon name="me" /></button>
            <button data-tip={S.camTop} onClick={() => cam('top')}><Icon name="top" /></button>
          </div>
          <div className="tc-toolgroup">
            <button data-tip={S.log} className={settings.logOpen ? 'on' : ''} onClick={toggleLog}><Icon name="log" />{unread > 0 && !settings.logOpen && <span className="tc-badge-n">{unread > 99 ? '99+' : unread}</span>}</button>
            <button data-tip={muted ? S.unmute : S.mute} onClick={toggleMute}><Icon name={muted ? 'mute' : 'sound'} /></button>
            <button data-tip={S.settings} className={pop === 'settings' ? 'on' : ''} onClick={() => setPop(pop === 'settings' ? null : 'settings')}><Icon name="settings" /></button>
            <button data-tip={S.help} className={pop === 'help' ? 'on' : ''} onClick={() => setPop(pop === 'help' ? null : 'help')}><Icon name="help" /></button>
            <button data-tip={full ? S.exitFullscreen : S.fullscreen} onClick={toggleFull}><Icon name={full ? 'unfull' : 'full'} /></button>
          </div>
          {pop === 'settings' && <SettingsPanel settings={settings} set={set} muted={muted} onMute={toggleMute} pace={pace} onPace={onPace} onClose={() => setPop(null)} />}
          {pop === 'help' && <HelpPanel onClose={() => setPop(null)} />}
        </div>
      </div>

      <div className="tc-side tc-side-l">
        {playersList.length > 0 && (
          <div className="tc-players">
            {playersList.map((p) => (
              <div key={p.id} className={`tc-player ${p.active ? 'active' : ''} ${p.me ? 'me' : ''} ${p.out ? 'out' : ''}`} style={{ '--pc': p.color || '#c8642b' }}>
                <span className="tc-avatar" style={{ '--pc': p.color || '#c8642b' }}>{isBotId(p.id) ? <Icon name="bot" size={15} /> : (p.name || '?').charAt(0).toLocaleUpperCase('tr')}</span>
                <div className="tc-pbody">
                  <div className="tc-pname">
                    <span className="tc-pn">{p.name}</span>
                    {p.me && <span className="tc-tag me">{S.you}</span>}
                    {p.active && <span className="tc-tag act">{S.active}</span>}
                    {(p.badges || []).map((b, i) => <span key={i} className="tc-badge">{b}</span>)}
                  </div>
                  {p.stats?.length > 0 && <div className="tc-stats">{p.stats.map((s, i) => <span key={i} className={s.key ? 'key' : 'tc-res'} title={s.title || s.label} style={{ '--sc': s.color || '#64748b' }}><em>{s.icon || s.label}</em>{s.value}</span>)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {sidePanels.filter((p) => p.side === 'left').map(panel)}
      </div>

      <div className="tc-side tc-side-r">
        {sidePanels.filter((p) => p.side !== 'left').map(panel)}
        {settings.logOpen && <GameLog entries={log} players={[...people.values()]} world={world.current} onInspect={setInspect} onClose={toggleLog} />}
      </div>

      {spot && settings.spot !== 'off' && (
        // on your turn the Spotlight moves aside: the centre of the table and every click stay yours
        <Spotlight entry={spot} world={world.current} queued={spots.length - 1} mode={meActive ? 'side' : settings.spot} scale={ANIM[settings.anim] || 1} onDone={spotDone} onInspect={setInspect} />
      )}

      {hud.prompt && (
        <div ref={promptRef} className={`tc-prompt ${promptMin ? 'min' : ''} ${hud.promptTone || ''} ${meActive ? 'myturn' : ''}`}>
          <div className="tc-prompt-h" onClick={() => setPromptMin(!promptMin)}>
            {meActive && hud.promptTone !== 'wait' && <span className="tc-pulse" />}
            <b>{hud.promptTitle || (hud.promptTone === 'wait' ? S.waiting : meActive ? S.yourTurn : S.decision)}</b>
            <button className="tc-iconbtn" title={promptMin ? '▴' : '▾'}><Icon name={promptMin ? 'up' : 'down'} size={15} /></button>
          </div>
          {!promptMin && <div className="tc-prompt-b"><UiNode node={hud.prompt} onMove={send} /></div>}
        </div>
      )}

      <div className="tc-toasts">
        {toasts.map((t) => (
          <div key={t.key} className={`tc-toast ${t.tone || 'info'}`} style={{ '--ms': `${t.ms || 4200}ms` }}>
            <Icon name={t.tone === 'good' ? 'check' : t.tone === 'bad' ? 'alert' : 'info'} size={17} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {banner && (
        <div key={banner.key} className="tc-banner" style={{ '--bc': banner.color || '#c8a24a', '--bms': `${bannerMs(banner)}ms` }}>
          <div className="tc-banner-band">
            <b>{banner.text}</b>
            {banner.sub && <span>{banner.sub}</span>}
          </div>
        </div>
      )}
      {turnSplash && <div key={turnSplash} className="tc-turn-splash"><span>{S.yourTurn}</span></div>}

      {hoverCard && hItem && !inspect && (
        <div className={`tc-hover ${hoverSide}`}>
          <CardCanvas world={world.current} item={hItem} height={Math.min(380, Math.round((wrap.current?.clientHeight || 700) * 0.46))} maxWidth={340} />
          {hover.spec?.tip && <div className="tc-hover-tip">{hover.spec.tip}</div>}
          <div className="tc-hover-k">{hover.spec?.click && !hover.spec?.disabled ? S.clickToMove : S.clickToZoom}</div>
        </div>
      )}
      {hoverOther && !inspect && (
        <div className={`tc-hover ${hoverSide}`}><Preview world={world.current} hover={hover} />{hover.spec?.tip && <div className="tc-hover-tip">{hover.spec.tip}</div>}</div>
      )}
      {hover?.spec?.tip && !hoverCard && !hoverOther && !inspect && <div className="tc-tip" style={{ left: hover.x + 16, top: hover.y + 16 }}>{hover.spec.tip}</div>}

      {result && !resultOpen && <button className="tc-result-pill" onClick={() => setResultOpen(true)}><Icon name="trophy" size={16} /> {S.result}</button>}
      {result && resultOpen && <ResultModal result={result} players={playersList.length ? playersList : [...people.values()]} youId={you?.id} onClose={() => setResultOpen(false)} />}
      {inspect && <CardInspector world={world.current} item={inspect} onClose={() => setInspect(null)} />}
    </div>
    </StringsContext.Provider>
  );
}
