// @ts-check
/// <reference types="tablecraft/game" />
/* global T, clone */
// The stricter JS form: `@satisfies` also checks what functions return (view() scenes, endIf() results), which a
// plain `@type` on `module.exports` only uses for autocomplete. Lines marked `@ts-expect-error` must be rejected.

/** @typedef {{ order: string[], points: Record<string, number>, bids: import('tablecraft/game').SecretSlot<number>, round: number }} State */

module.exports = /** @satisfies {import('tablecraft/game').GameModule<State>} */ ({
  meta: { name: 'Sealed Points', minPlayers: 2, maxPlayers: 5 },

  setup({ players }) {
    const order = players.map((p) => p.id);
    return { order, points: Object.fromEntries(order.map((id) => [id, 0])), bids: T.secret.create(order), round: 1 };
  },

  moves: {
    bid(s, { playerId, args }) {
      if (!T.secret.commit(s.bids, playerId, Number(args.amount))) return { error: 'Too late' };
      if (T.secret.allIn(s.bids)) {
        const win = T.auction.sealed(T.secret.reveal(s.bids), { order: s.order });
        if (win) s.points[win.id] += win.price;
        s.bids = T.secret.create(s.order);
        s.round += 1;
      }
      return clone(s);
    },
    // @ts-expect-error a move must return the state or { error }
    oops(s) { s.round += 1; },
  },

  // @ts-expect-error unknown layout below (`@satisfies` reports return-value errors on the method)
  view(s, { playerId }) {
    const mine = T.secret.view(s.bids, playerId, '?');
    return {
      type: 'tabletop',
      scene: {
        zones: [{ id: 'pot', layout: 'circle' }],
        objects: [{ id: 'pot-coins', kind: 'token', shape: 'coin', zone: 'pot', count: s.round }],
      },
      hud: { title: 'Sealed Points', status: `Round ${s.round}`, log: Object.entries(mine).map(([id, b]) => `${id}: ${b ?? '…'}`) },
    };
  },

  // @ts-expect-error winners must be a list of player ids
  endIf(s) {
    return s.round > 5 ? { winners: s.order[0], reason: 'Five rounds played' } : null;
  },

  actions(s, { playerId }) {
    return T.secret.pending(s.bids).includes(playerId) ? T.range(4).map((amount) => ({ name: 'bid', args: { amount } })) : [];
  },
});
