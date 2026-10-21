# %PROJECT_NAME%

**Dice Duel**, online — play with friends through your own room server. Built with [Tablecraft](https://github.com/table-craft/table-craft): you write the rules
in one JavaScript module, Tablecraft builds the 3D table, the bots and the referee.

## Run it

```bash
npm install
npm run server     # terminal 1: room server on http://localhost:3001
npm run dev        # terminal 2: open http://localhost:5173
```

Opening the page creates a room and puts its code in the URL (`?room=AB12CD`). Send that URL to a friend (on your local network,
start Vite with `npm run dev -- --host`) or add a bot in the lobby, take your seats and press Start. Every move runs on
the server; each browser only receives its own view.

New rooms load the current `src/game.js`, so after editing the rules just open a fresh page without `?room`.

To deploy, `npm start` builds the client and serves it together with the rooms on one port (`PORT=8080 npm start`).
To host the client elsewhere, build it with `VITE_SERVER_URL=https://your-room-server npm run build` and set
`CORS_ORIGIN` on the server. See [Server](https://github.com/table-craft/table-craft/blob/main/docs/server.md) for authentication, persistence and hosting.

## Files

| File | What it is |
|---|---|
| `src/game.js` | **The game.** Rules, what each player sees, bots. This is the file you edit. |
| `src/main.jsx` | Mounts the table: `<TablecraftGame>` with a match from `connectRoom()`. |
| `server.js` | The room server: socket.io + `createRoomServer()`. Every move runs here. |
| `index.html`, `vite.config.js` | A standard Vite + React app. |
| `.mcp.json` | Lets Claude Code use the Tablecraft MCP tools in this folder. |

## Edit the rules

`src/game.js` is a plain script that assigns `module.exports`; the rules kit is the global `T`
([game module reference](https://github.com/table-craft/table-craft/blob/main/docs/game-module.md)):

- `setup()` returns the starting state — plain JSON. Use `random` / `ctx.roll` for every random number.
- `moves` change the state. Validate everything and return `{ error: 'readable message' }` to reject a move.
- `view(state, { playerId })` returns what **one** player sees: the 3D `scene` ([scene](https://github.com/table-craft/table-craft/blob/main/docs/scene.md)) and the
  2D `hud` ([HUD](https://github.com/table-craft/table-craft/blob/main/docs/hud.md)). Never put an opponent's secrets in it.
- `endIf()` ends the game; `actions()` lists every legal move (bots and the referee use it); `bot()`, `score()`
  and `invariants()` are optional helpers.

Keep object ids stable (the same card keeps its id when it moves) and write one log line per action with the player's
name — that is what makes the table easy to follow.

## Check it with the referee

```bash
npm run validate    # setup, every player's view, scene checks and a short referee pass
npm run simulate    # 200 bot games: errors, rejected actions, stuck games, broken invariants
npm run balance     # balance lab: first-player advantage, game length, forced decisions, comebacks
npx tablecraft audit src/game.js                                   # hidden-information leaks, readability
npx tablecraft balance src/game.js --bots module,greedy --players 3
```

`simulate` and `audit` exit non-zero on problems, so they work as CI steps. See [Bots & referee](https://github.com/table-craft/table-craft/blob/main/docs/testing.md)
and [Balance lab](https://github.com/table-craft/table-craft/blob/main/docs/balance.md).

## Build it with Claude

This project ships a `.mcp.json`, so [Claude Code](https://claude.com/claude-code) picks up the Tablecraft MCP server
(`npx tablecraft mcp`) when you open it here. Claude can then read the docs, validate and simulate `src/game.js`, audit
what each player sees and step through a match move by move. Try:

> "Add a second die and a 'double means roll again' rule to src/game.js, then make the referee and the audit clean."

For Claude Desktop or other clients, add the same entry to their MCP config — see [AI assistants (MCP)](https://github.com/table-craft/table-craft/blob/main/docs/mcp.md).

## Learn more

[Getting started](https://github.com/table-craft/table-craft/blob/main/docs/getting-started.md) · [Concepts](https://github.com/table-craft/table-craft/blob/main/docs/concepts.md) · [Rules kit `T`](https://github.com/table-craft/table-craft/blob/main/docs/rules-kit.md) ·
[Effects](https://github.com/table-craft/table-craft/blob/main/docs/fx.md) · [Following the game](https://github.com/table-craft/table-craft/blob/main/docs/following-the-game.md) · [Client & theming](https://github.com/table-craft/table-craft/blob/main/docs/client.md) ·
[Server](https://github.com/table-craft/table-craft/blob/main/docs/server.md) · [Examples](https://github.com/table-craft/table-craft/tree/main/examples)
