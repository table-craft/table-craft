// Type tests for every entry point, written like a real host app. `npm run typecheck` compiles this file; it is
// never run. Lines marked `@ts-expect-error` are mistakes the declarations must reject.
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

import {
  createLocalMatch, connectRoom, createReplay, replayMatch, describeMove, analyzeBalance, sweepParameter, compareReports,
  auditViews, simulate, summarize, validate, LocalGameModule, Match, T, makeRandom, checkScene, PACE, botDelay,
  visibleFx, isBotId, setLocale, addLocale, VERSION,
} from '@table-craft/table-craft';
import type { BalanceReport, Fx, GameModule, MoveCtx, Snapshot, View, Zone } from '@table-craft/table-craft';
import type { SceneObject, Hud, UiNode as UiNodeSpec, EndResult, Move } from '@table-craft/table-craft/game';
import {
  Tabletop, TablecraftGame, Lobby, useMatch, UiNode, ReplayViewer, buildStrings, LOCALES, StringsContext,
} from '@table-craft/table-craft/react';
import { TabletopWorld, TableAudio, layoutScene, footprint, cardSize, CARD_SIZES, TERRAIN, hexCenter, FaceStore, PRESETS, fontsReady } from '@table-craft/table-craft/engine';
import { mountGame, createLocalMatch as embedLocal } from '@table-craft/table-craft/embed';
import * as server from '@table-craft/table-craft/server';
import { createTablecraftMcp } from '@table-craft/table-craft/mcp';

// ------------------------------------------------------------------ a typed game module in TypeScript

interface Pilot { id: string; name: string; fuel: number; at: string }
interface State { pilots: Pilot[]; turn: number; die: number; log: string[]; over: boolean }

const roll: Move<State> = (s, ctx) => {
  const p = s.pilots[s.turn];
  if (p.id !== ctx.playerId) return { error: 'Not your turn' };
  const r = ctx.roll(6, { id: 'die', by: p.id });
  s.die = r.index;
  p.fuel += r.face;
  ctx.fx({ type: 'banner', text: `${p.name} rolled ${r.face}`, sub: 'Fuel', ms: 1800 });
  ctx.fx({ type: 'toss', zone: `fuel:${p.id}`, n: r.face, token: { shape: 'coin', color: '#d4a72c' } });
  ctx.fx({ type: 'toast', text: 'Private hint', tone: 'info', to: [p.id] });
  s.turn = T.nextIndex(s.pilots.length, s.turn);
  return s;
};

const game: GameModule<State, { goal?: number }> = {
  meta: { name: 'Fuel Run', minPlayers: 2, maxPlayers: 4, seats: [{ id: 'red', label: 'Red', max: 1 }], variants: [{ id: 'short', label: 'Short' }] },
  setup({ players, options, random, fx, now }) {
    fx({ type: 'sound', name: 'shuffle' });
    const goal: number = options.content?.goal ?? 20;
    void goal; void now;
    return { pilots: random.shuffle(players).map((p) => ({ id: p.id, name: p.name, fuel: 0, at: '0,0' })), turn: 0, die: 0, log: [], over: false };
  },
  moves: {
    roll,
    // a move may narrow its args
    jump(s, ctx: MoveCtx<{ to: string }>) {
      const path = T.hex.path(s.pilots[0].at, ctx.args.to, (cell) => (cell === '9,9' ? false : 1));
      if (!path) return { error: 'No route' };
      s.pilots[0].at = ctx.args.to;
      return s;
    },
  },
  view(s, { playerId }) {
    const objects: SceneObject[] = [
      { id: 'die', kind: 'die', zone: 'tray', value: s.die, click: { name: 'roll' } },
      { id: 'map:0,0', kind: 'hex', zone: 'map', cell: '0,0', terrain: 'mountain', face: { title: 'Peak' } },
      { id: 'route', kind: 'link', from: 'map:0,0', to: { cell: '1,0', corner: 2 }, style: 'segments', segments: 3 },
      { id: 'clock', kind: 'timer', zone: 'tray', endsAt: 1_700_000_000_000, duration: 30 },
      { id: 'card', kind: 'card', zone: 'hand', face: { title: 'Boost', corners: { tl: 2 }, chips: [{ label: '2 fuel' }] }, faceUp: true, size: 'poker' },
      ...s.pilots.map((p): SceneObject => ({ id: `pawn:${p.id}`, kind: 'token', shape: 'meeple', zone: 'map', cell: p.at })),
    ];
    const zones: Zone[] = [
      { id: 'tray', layout: 'row', at: [0, 0], label: 'Tray', mat: true },
      { id: 'map', layout: 'hex', hex: 5, orient: 'flat', at: [0, -20] },
      { id: 'hand', seat: playerId, layout: 'fan', at: [0, 6] },
    ];
    const hud: Hud = {
      title: 'Fuel Run',
      players: s.pilots.map((p, i) => ({ id: p.id, name: p.name, active: i === s.turn, me: p.id === playerId, stats: [{ label: 'Fuel', value: p.fuel, key: true }] })),
      prompt: { type: 'col', children: [{ type: 'text', text: 'Roll!', size: 'lg' }, { type: 'button', label: 'Roll', move: { name: 'roll' }, variant: 'primary' }] },
      panels: [{ id: 'rules', title: 'Rules', side: 'left', node: { type: 'log', entries: ['Roll to fly'] } }],
      log: s.log.slice(-40),
    };
    return { type: 'tabletop', scene: { env: { preset: 'night', particles: null }, table: { shape: 'round', surface: 'felt-blue' }, zones, objects, camera: { preset: 'top' } }, hud };
  },
  endIf(s) {
    return s.over ? T.score.result(s.pilots, { keys: ['fuel', '-id'], reason: (r) => `${r[0].id} wins` }) : null;
  },
  actions(s, { playerId }) {
    return s.pilots[s.turn].id === playerId ? [{ name: 'roll' }] : [];
  },
  bot(_s, { actions, random }) {
    return random.pick(actions);
  },
  score(s, { playerId }) {
    return s.pilots.find((p) => p.id === playerId)?.fuel ?? 0;
  },
  invariants(s) {
    return [s.pilots.some((p) => p.fuel < 0) && 'negative fuel'];
  },
};
void game;

// ------------------------------------------------------------------ mistakes the types must catch

const badView: GameModule<State> = {
  setup: () => ({ pilots: [], turn: 0, die: 0, log: [], over: false }),
  moves: {
    // @ts-expect-error a move must return the state or { error } — not nothing
    noop(_s, _ctx) { },
    wrongFx(s, ctx) {
      // @ts-expect-error unknown fx type
      ctx.fx({ type: 'confetti', text: 'yay' });
      // @ts-expect-error banner needs its text
      ctx.fx({ type: 'banner' });
      return s;
    },
  },
  // @ts-expect-error view() must return a node with a `type` ({ type: 'tabletop', scene, hud })
  view: () => ({ scene: { zones: [] } }),
};
void badView;

// @ts-expect-error unknown zone layout
const badZone: Zone = { id: 'z', layout: 'rows' };
// @ts-expect-error unknown object kind
const badObject: SceneObject = { id: 'o', kind: 'meeple' };
// @ts-expect-error unknown token shape
const badShape: SceneObject = { id: 't', kind: 'token', shape: 'triangle' };
// @ts-expect-error unknown UI node type
const badNode: UiNodeSpec = { type: 'slider' };
// @ts-expect-error unknown environment preset
const badEnv: View = { type: 'tabletop', scene: { env: { preset: 'desert' } } };
// @ts-expect-error `winners` is a list of ids
const badEnd: EndResult = { winners: 'p1' };
// @ts-expect-error unknown majority tie rule
T.area.majority({ a: 3, b: 3 }, [5, 3], { tie: 'share' });
// @ts-expect-error T.turns.current takes the turn-order object, not a list
T.turns.current(['p1', 'p2']);
void [badZone, badObject, badShape, badNode, badEnv, badEnd];

// ------------------------------------------------------------------ the rules kit outside modules

const rnd = makeRandom(42);
const deck = rnd.api.shuffle(['a', 'b', 'c']);
const drawn: string[] = T.draw(deck, [], rnd.api, 2);
const turn = T.turns.create(['p1', 'p2', 'p3'], { start: 'p2', once: true });
const first: string | null = T.turns.next(turn);
const flow = T.flow.create(['draft', 'play'], { rounds: 3 });
const phase: 'draft' | 'play' | null = T.flow.next(flow);
const runs = T.grid.lineRuns(T.grid.rect(7, 6), (k) => (k === '0,0' ? 'red' : null), 4, { diagonal: false });
const runValue: string | undefined = runs[0]?.value;
const auction = T.auction.create(['p1', 'p2'], { kind: 'dutch', price: 10, step: 2, exclude: ['p2'] });
const declined: boolean = T.auction.decline(auction, 'p1');
const price: number | null = T.auction.lower(auction);
const sealed = T.auction.sealed({ p1: 4, p2: 6 }, { price: 'second' });
const vote = T.vote.result({ p1: 'ja', p2: 'nein', p3: 'ja' }, { need: 'majority' });
const roles = T.roles.deal(['p1', 'p2', 'p3'], { 3: ['spy', 'loyal', 'loyal'] }, rnd.api);
const known = T.roles.known(roles.roles, 'p1', { spy: ['spy'] });
const zonesBuilt = T.deckbuild.create(['copper', 'estate'], rnd.api, 5);
const played: string | undefined = T.deckbuild.play(zonesBuilt, (c) => c === 'copper');
const risk: number = T.bag.odds({ white: 4, red: 2 }, 2, (d) => d.white >= 2);
const yahtzee: boolean = T.dice.matches(T.dice.roll(rnd.api, 5), { groups: [5] });
const tricks = T.tricks.winner([{ id: 'p1', card: { suit: 'h', rank: 3 } }, { id: 'p2', card: { suit: 'h', rank: 9 } }], { trump: 's' });
const pending = T.pending.actions([{ playerId: 'p1', kind: 'target', options: ['p2', 'p3'] }], 'p1');
const fewestMajority: Record<string, number> = T.area.majority({ p1: 0, p2: 1 }, [5], { fewest: true });
const majority: Record<string, number> = T.area.score(T.area.tally([{ region: 'n', owner: 'p1' }]), [5, 3, 1], { tie: 'down', fewest: true });
void [drawn, first, phase, runValue, price, sealed?.price, vote.winner, known, played, risk, yahtzee, tricks?.id, pending[0]?.args?.choice, fewestMajority, majority];

// ------------------------------------------------------------------ tablecraft: clients, referee, balance, replays

const source = 'module.exports = { setup: () => ({}), moves: {}, view: () => ({ type: "text", text: "hi" }) };';
const mod = new LocalGameModule<State>(source);
const report = simulate(mod, { games: 50, botMode: 'mixed', seed: 1 });
if (!report.skipped) { const stuck: number = report.stuck; void stuck; }
const text: string = summarize(report);
const smoke = validate(mod, { requireActions: true, content: {} });
const balance: BalanceReport = analyzeBalance(mod, { games: 200, botMix: ['module', 'greedy'] });
const sweep = sweepParameter(mod, { path: 'options.target', values: [15, 20, 25], games: 100 });
const deltas = compareReports(balance, sweep[0].report);
const audit = auditViews(mod, { games: 2 });
// @ts-expect-error unknown bot profile
analyzeBalance(mod, { botMix: ['smart'] });
// @ts-expect-error sweep paths start with content. or options.
sweepParameter(mod, { path: 'meta.name', values: [] });
void [text, smoke.tabletop, deltas[0]?.delta, audit.findings[0]?.code, VERSION, PACE.fast, botDelay('fast', [] as Fx[]), visibleFx([], 'p1'), isBotId('bot_x'), checkScene(null)];
setLocale('tr'); addLocale('de', { notPlaying: 'Das Spiel läuft nicht', minPlayers: (n: number) => `Mindestens ${n}` });

const local = createLocalMatch({ source, players: ['Ada', 'bot', { bot: true, seat: 'red' }], pace: 'fast', options: { variant: 'short' } });
local.subscribe((snap: Snapshot) => {
  if (snap.status === 'error') { const why: string = snap.error; void why; return; }
  const view = snap.view;
  if (view?.type === 'tabletop') void view.scene.zones;
});
void local.move('roll', {}).then((r) => { if (!r.ok) console.log(r.error); });
const record = local.record();
const replay = record ? createReplay({ source, ...record, viewer: 'you' }) : null;
replay?.step(-1); replay?.setSpeed(2);
const run = replayMatch(mod, { seed: 1, moves: [{ playerId: 'p1', name: 'roll', at: 0 }] });
const line: string = describeMove(run.frames[1]?.move, []);
// @ts-expect-error createLocalMatch needs a module source or a loaded module
createLocalMatch({ players: ['Ada'] });
void line;

const match = new Match(mod, { seed: 7, pace: 'slow' });
match.join('u1', { name: 'Ada' }); match.addBot();
const fx: Fx[] = match.start();
const next = match.nextBot();
void [fx, next?.name, match.snapshot('u1').canBots, match.deadline()?.at];

const room = connectRoom({ io, url: 'https://play.example.com', room: 'AB12CD', name: 'Ada', auth: { token: 't' } });
room.socket.on('connect', () => {});
void room.join('red', 'Ada');

// ------------------------------------------------------------------ tablecraft/react

function App() {
  const { snapshot, tableProps, isHost } = useMatch(local);
  if (!snapshot || snapshot.status === 'error' || !tableProps) return <TablecraftGame client={room} locale="tr" strings={{ yourTurn: 'Go!', verbs: { play: (n) => `played ${n}` } }} style={{ height: '100vh' }} />;
  if (snapshot.status === 'lobby') return <Lobby client={local} snapshot={snapshot} />;
  return (
    <StringsContext.Provider value={buildStrings('en')}>
      <Tabletop {...tableProps} headerExtra={isHost ? <span>host</span> : null} className="mine" />
      <UiNode node={{ type: 'button', label: 'Pass', move: { name: 'pass' } }} onMove={(m) => local.move(m.name, m.args)} />
      {replay && <ReplayViewer replay={replay} height="80vh" />}
      {/* @ts-expect-error TablecraftGame needs a client */}
      <TablecraftGame locale="en" />
    </StringsContext.Provider>
  );
}
void LOCALES.tr.yourTurn;
export const app = <App />;

// ------------------------------------------------------------------ tablecraft/embed & tablecraft/engine

const mounted = mountGame(document.getElementById('table')!, { client: embedLocal({ source }), locale: 'en', style: { height: '80vh' } });
mounted.update({ locale: 'tr' }); mounted.unmount();

const canvas = document.querySelector('canvas')!;
const world = new TabletopWorld(canvas, {
  audio: new TableAudio(),
  onMove: (intent) => local.move(intent.name, intent.args),
  onHover: (h) => { if (h) console.log(h.id, h.spec.kind); },
  onEvent: (e) => { if (e.type === 'rolled') console.log(e.values.join(', ')); else if (e.type === 'banner') console.log(e.text); },
});
const scene = { zones: [{ id: 'tray', layout: 'row' as const, at: [0, 0] as const }], objects: [{ id: 'die', kind: 'die' as const, zone: 'tray' }] };
world.sync(scene, { youId: 'you' });
world.playFx([{ type: 'shake', strength: 1 }]);
world.setCamera('top');
const layout = layoutScene(scene, 'you');
void [layout.objects.get('die')?.x, footprint({ id: 'c', kind: 'card' }).w, cardSize({ size: 'tarot' })[0], CARD_SIZES.mini, TERRAIN.sea.height, hexCenter(1, 0, 5), new FaceStore(), PRESETS.winter.surface, fontsReady(500)];

// ------------------------------------------------------------------ tablecraft/server & tablecraft/mcp

const http = createServer();
const ioServer = new Server(http);
const rooms = server.createRoomServer(ioServer.of('/tablecraft'), {
  identify: async (socket) => (socket.handshake.auth.token ? { id: `u_${String(socket.handshake.auth.token)}`, name: 'Ada' } : null),
  onEvent: (r, e) => { if (e.type === 'finish') console.log(r.code, e.result?.reason); },
});
const code: string = rooms.createRoom({ source, pace: 'normal', assets: { card_wind: '/wind.png' } });
rooms.getRoom(code)?.match.status;
const serverModule = new server.GameModule<State>(source, { timeout: 250 });
const refereeReport = server.simulate(source, { games: 20 });
const balanceFromSource = server.analyzeBalance(serverModule, { games: 10 });
const viaWorker = server.simulateAsync(source, { games: 5 }).then((r) => (r.skipped ? r.error : r.summary));
server.configure({ locale: 'tr' });
const msg: string = server.msg('notPlaying');
const smokeServer = server.validate(source);
const auditServer = server.audit(serverModule, { games: 1 });
void [refereeReport.ok, balanceFromSource.warnings, viaWorker, msg, smokeServer.players, auditServer.views, server.CALL_TIMEOUT, server.T.range(3)];
// @ts-expect-error the server simulate takes source text or a loaded module
server.simulate(42);

const mcp = createTablecraftMcp();
mcp.tool('ping', { description: 'Ping' }, () => 'pong');
void mcp.handle('tools/list');
