// One table: lobby → playing → finished. Pure state machine (no timers, no network) shared by the socket.io
// room server and the in-browser local match; hosts call nextBot()/applyDeadline() on their own schedule.
import { makeRandom, randomSeed } from './random.js';
import { chooseBotMove, isBotId, PACE } from './pace.js';
import { msg } from './messages.js';

const fail = (key, ...a) => { throw new Error(msg(key, ...a)); };
const short = () => Math.random().toString(16).slice(2, 8);

export class Match {
  // mod: a loaded GameModule / LocalGameModule
  constructor(mod, { seed = randomSeed(), content = {}, options = {}, pace = 'normal', clock = () => Date.now() } = {}) {
    this.mod = mod;
    this.seed = seed; this.content = content; this.options = options;
    this.pace = PACE[pace] ? pace : 'normal';
    this.clock = clock;
    this.players = []; this.host = null;
    this.status = 'lobby'; this.state = null; this.rng = null; this.result = null;
    this.moves = []; this.startedAt = null;
  }

  get meta() { return this.mod.meta || {}; }
  get canBots() { return this.mod.has('actions'); }
  get seats() { return this.meta.seats || []; }
  player(id) { return this.players.find((p) => p.id === id) || null; }
  hasBots() { return this.players.some((p) => isBotId(p.id)); }

  // ------------------------------------------------------------ lobby
  join(id, { name, seat = null, userId = null } = {}) {
    if (this.status !== 'lobby') fail('started');
    const seatDef = this.seats.find((x) => x.id === seat) || null;
    if (this.seats.length && !seatDef) fail('badSeat');
    if (seatDef?.max && this.players.filter((p) => p.seat === seat && p.id !== id).length >= seatDef.max) fail('seatFull');
    if (!this.player(id) && this.players.length >= (this.meta.maxPlayers || 99)) fail('gameFull');
    this.players = this.players.filter((p) => p.id !== id);
    const p = { id, name: name || id, seat: seatDef?.id || null, team: seatDef?.team || null, role: seatDef?.role || null, userId };
    this.players.push(p);
    if (!this.host) this.host = id;
    return p;
  }

  leave(id) { if (this.status === 'lobby') this.players = this.players.filter((p) => p.id !== id); }

  addBot(seat = null) {
    if (this.status !== 'lobby') fail('lobbyOnly');
    if (!this.canBots) fail('noBots');
    if (this.players.length >= (this.meta.maxPlayers || 99)) fail('gameFull');
    const taken = (sid) => this.players.filter((p) => p.seat === sid).length;
    const free = (x) => !x.max || taken(x.id) < x.max;
    const seatDef = this.seats.find((x) => x.id === seat && free(x)) || this.seats.find(free) || null;
    if (this.seats.length && !seatDef) fail('noSeat');
    const bot = { id: `bot_${short()}`, name: msg('bot', this.players.filter((p) => isBotId(p.id)).length + 1), seat: seatDef?.id || null, team: seatDef?.team || null, role: seatDef?.role || null, userId: null };
    this.players.push(bot);
    return bot;
  }

  removeBot(id) {
    if (this.status !== 'lobby') fail('lobbyOnly');
    this.players = this.players.filter((p) => !(isBotId(p.id) && p.id === id));
  }

  setPace(p) { if (!PACE[p]) fail('badPace'); this.pace = p; }

  // ------------------------------------------------------------ game
  start() {
    if (this.players.length < (this.meta.minPlayers || 1)) fail('minPlayers', this.meta.minPlayers);
    const now = this.clock();
    const { state, rng, fx } = this.mod.setup(this.players, this.seed, { content: this.content, ...this.options }, now);
    this.state = state; this.rng = rng; this.status = 'playing'; this.result = null; this.moves = []; this.startedAt = now;
    return [{ type: 'sound', name: 'shuffle' }, ...(fx || [])];
  }

  restart() {
    this.status = 'lobby'; this.state = null; this.result = null; this.moves = []; this.startedAt = null;
    this.seed = randomSeed();
  }

  // Applies a move for a player (human, bot or timer); throws with the module's error message when rejected.
  apply(player, name, args = {}) {
    if (this.status !== 'playing') fail('notPlaying');
    if (typeof name !== 'string' || !name) fail('invalidMove');
    let r;
    try { r = this.mod.move(this.state, name, { playerId: player.id, player, args, now: this.clock() }, this.rng); } catch (e) { r = { error: msg('moduleError', e.message) }; }
    this.moves.push({ at: this.clock(), playerId: player.id, name, args, error: r.error || undefined });
    if (r.error) throw new Error(r.error);
    this.state = r.state; this.rng = r.rng;
    const end = this.mod.endIf(this.state);
    if (end) { this.status = 'finished'; this.result = end; }
    return r.fx || [];
  }

  move(playerId, name, args) {
    const player = this.player(playerId);
    if (!player) fail('notPlayer');
    return this.apply(player, name, args);
  }

  // One bot move (the first bot, in random order, that has a legal main action). → { player, name, fx } | null
  nextBot(seed = randomSeed()) {
    if (this.status !== 'playing' || !this.canBots) return null;
    const rand = makeRandom(seed).api;
    for (const b of rand.shuffle(this.players.filter((p) => isBotId(p.id)))) {
      let choice = null;
      try { choice = chooseBotMove(this.mod, this.state, b, rand); } catch { choice = null; }
      if (!choice) continue;
      try { return { player: b, name: choice.name, fx: this.apply(b, choice.name, choice.args) }; } catch { /* rejected bot move stays in the move log */ }
    }
    return null;
  }

  deadline() { return this.status === 'playing' && this.state?.$deadline?.at && this.state.$deadline.move ? this.state.$deadline : null; }

  // Sand timer ran out: apply the timed move as its player (or the system).
  applyDeadline() {
    const d = this.deadline();
    if (!d) return null;
    const player = this.player(d.playerId) || { id: 'system', name: msg('timer') };
    return this.apply(player, d.move, d.args || {});
  }

  view(playerId) {
    if (!this.state) return { view: null, error: null };
    const p = this.player(playerId) || { id: 'spectator', name: msg('spectator'), role: 'spectator' };
    try { return { view: this.mod.view(this.state, p), error: null }; } catch (e) { return { view: null, error: e.message }; }
  }

  // The inputs that reproduce this game (see replayMatch / createReplay); null before start.
  record() {
    if (this.startedAt == null) return null;
    return JSON.parse(JSON.stringify({
      seed: this.seed, players: this.players, options: { content: this.content, ...this.options }, moves: this.moves, startedAt: this.startedAt,
    }));
  }

  // Everything a client needs to render this table for `playerId` (without fx).
  snapshot(playerId) {
    const { view, error } = this.view(playerId);
    return {
      status: this.status, players: this.players, host: this.host, meta: this.meta, you: this.player(playerId),
      view, viewError: error, result: this.result, moves: this.moves.length, pace: this.pace, canBots: this.canBots,
    };
  }
}
