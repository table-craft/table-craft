// A loaded game module. The sandbox is pluggable: the server uses node:vm (separate realm + timeouts),
// the browser runner uses a Function scope. Everything that crosses the boundary is JSON-copied, so game state is
// always plain data and modules can never keep references to host objects.
import { KIT_SOURCE } from './kit.js';
import { makeRandom } from './random.js';
import { msg } from './messages.js';

export const json = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const CTX = 'T._ctx(__random, __fx, __args.now || 0)';

// sandbox: { set(name, value), get(name), exec(code, filename), run(expr) }
export class GameModuleBase {
  constructor(code, sandbox) {
    this.sb = sandbox;
    sandbox.set('module', { exports: {} });
    sandbox.set('exports', {});
    sandbox.set('clone', (o) => JSON.parse(JSON.stringify(o)));
    sandbox.set('console', { log: () => {}, warn: () => {}, error: () => {} });
    sandbox.set('T', sandbox.run(KIT_SOURCE, 'tablecraft-kit.js'));
    for (const k of ['__mod', '__args', '__fx', '__random', '__name']) sandbox.set(k, null); // declared up front: scoped sandboxes must not leak globals
    sandbox.exec(`${code}\n;__mod = module.exports;`, 'game.js');
    const mod = sandbox.get('__mod');
    if (!mod || typeof mod.setup !== 'function' || typeof mod.view !== 'function' || typeof mod.moves !== 'object') {
      throw new Error(msg('mustExport'));
    }
    this.meta = json(mod.meta || {});
  }

  has(fn) { return typeof this.sb.get('__mod')[fn] === 'function'; }
  hasMove(name) { const m = this.sb.get('__mod').moves; return !!m && typeof m[name] === 'function'; }

  _call(expr, args) {
    this.sb.set('__args', json(args));
    this.sb.set('__fx', []);
    const out = this.sb.run(expr);
    return out === undefined ? undefined : json(out);
  }

  _fx() { return json(this.sb.get('__fx')); }

  // → { state, rng, fx }
  setup(players, seed, options = {}, now = Date.now()) {
    const rnd = makeRandom(seed);
    this.sb.set('__random', rnd.api);
    const state = this._call(`__mod.setup(Object.assign(${CTX}, { players: __args.players, options: __args.options, random: __random }))`, { players, options, now });
    return { state, rng: rnd.state(), fx: this._fx() };
  }

  // input: { playerId, player, args, now } → { state, rng, fx } | { error }
  move(state, name, input, rngState) {
    if (!this.hasMove(name)) return { error: msg('unknownMove', name) };
    const rnd = makeRandom(rngState);
    this.sb.set('__random', rnd.api);
    this.sb.set('__name', name);
    const out = this._call(`__mod.moves[__name](__args.state, Object.assign(${CTX}, { playerId: __args.playerId, player: __args.player, args: __args.args || {}, random: __random }))`,
      { state, ...input, now: input.now || Date.now() });
    if (out && out.error && Object.keys(out).length === 1) return { error: String(out.error) };
    if (!out || typeof out !== 'object') return { error: msg('noState') };
    return { state: out, rng: rnd.state(), fx: this._fx() };
  }

  view(state, player) {
    return this._call('__mod.view(__args.state, { playerId: __args.player && __args.player.id, player: __args.player })', { state, player });
  }

  endIf(state) {
    if (!this.has('endIf')) return null;
    return this._call('__mod.endIf(__args.state)', { state });
  }

  // Every legal move for this player right now: [{ name, args, label?, free? }]
  actions(state, player) {
    if (!this.has('actions')) return null;
    const out = this._call('__mod.actions(__args.state, { playerId: __args.player.id, player: __args.player })', { state, player });
    return Array.isArray(out) ? out.filter((a) => a && typeof a.name === 'string') : [];
  }

  // Optional heuristic bot; null when the module has none.
  bot(state, player, actions, seed) {
    if (!this.has('bot')) return null;
    const rnd = makeRandom(seed);
    this.sb.set('__random', rnd.api);
    return this._call('__mod.bot(__args.state, { playerId: __args.player.id, player: __args.player, actions: __args.actions, random: __random })', { state, player, actions });
  }

  // Optional heuristic score of the position for one player (higher is better); used by the balance lab's greedy
  // bot and for lead-change / comeback metrics. null when the module has no score().
  score(state, player) {
    if (!this.has('score')) return null;
    const out = this._call('__mod.score(__args.state, { playerId: __args.player.id, player: __args.player })', { state, player });
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  }

  // Optional rule invariants: list of violated rules.
  invariants(state) {
    if (!this.has('invariants')) return [];
    const out = this._call('__mod.invariants(__args.state)', { state });
    return Array.isArray(out) ? out.filter(Boolean).map(String) : [];
  }
}
