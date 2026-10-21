# Tablecraft documentation

Start with **[Getting started](getting-started.md)** — it takes you from an empty folder to a playable 3D game
against bots. Then read **[Concepts](concepts.md)** once; everything else is reference.

## Guides

- [Getting started](getting-started.md) — install, write a tiny game, play it locally, then online
- [Concepts](concepts.md) — host, match, views, intents and effects
- [Following the game](following-the-game.md) — Spotlight, game log and pacing, and how to write games that read well
- [Bots & referee](testing.md) — make your rules testable and keep them correct
- [Balance lab](balance.md) — seat and first-player advantage, length, forced decisions, comebacks, dominant strategies
- [AI assistants (MCP)](mcp.md) — let Claude and other assistants write, test and debug games with you

## Reference

- [Game module](game-module.md) — the contract every game implements
- [Scene](scene.md) — zones, objects (cards, decks, dice, tokens, boards, timers, text), faces and art
- [HUD](hud.md) — title, players, prompt dock, panels, log and 2D UI nodes
- [Effects (fx)](fx.md) — dice, banners, toasts, sounds, tosses, highlights, reveals, camera
- [Rules kit `T`](rules-kit.md) — helpers available inside game modules
- [Mechanics](mechanics.md) — a catalog of board-game mechanics and the `T` helpers that implement them
- [Client](client.md) — `<TablecraftGame>`, `<Tabletop>`, `useMatch`, `mountGame`, engine, theming, locales
- [Server](server.md) — runtime, `createRoomServer`, wire protocol, hosting and security

## Cheat sheet

```js
module.exports = {
  meta: { name, minPlayers, maxPlayers, description?, seats?, variants? },
  setup(ctx) { return state; },                        // ctx: players, options, random, fx, roll, rollMany, now
  moves: { name(state, ctx) { return state | { error }; } },   // ctx: playerId, player, args, random, fx, roll, now
  view(state, { playerId }) { return { type: 'tabletop', scene, hud }; },
  endIf(state) { return null | { winners, reason, ranking? }; },
  actions(state, { playerId }) { return [{ name, args?, free? }]; },   // bots + referee
  bot(state, { playerId, actions, random }) { return actions[0]; },     // optional
  invariants(state) { return []; },                                     // optional
};
```
