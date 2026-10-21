# %PROJECT_NAME%

**Dice Duel** — two players take turns rolling one die; first to 10 points wins. Built with [Tablecraft](https://github.com/table-craft/table-craft): you write the rules
in one JavaScript module, Tablecraft builds the 3D table, the bots and the referee.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ — host it anywhere
```

The game runs entirely in the browser: you against a bot. Click the glowing die.

## Files

| File | What it is |
|---|---|
| `src/game.js` | **The game.** Rules, what each player sees, bots. This is the file you edit. |
| `src/main.jsx` | Mounts the table: `<TablecraftGame>` with a match from `createLocalMatch()`. |
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
