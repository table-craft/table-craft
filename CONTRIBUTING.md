# Contributing to Tablecraft

Thanks for helping! Bug reports, games, docs fixes and features are all welcome.

## Setup

```bash
git clone https://github.com/table-craft/table-craft && cd table-craft
npm install
npm test            # runtime, referee, match, mechanics, socket.io room end-to-end
npm run lint        # ESLint (correctness rules only)
npm run typecheck   # the .d.ts files in types/
npm run site:dev    # landing + playground with hot reload — the fastest way to see table changes
```

Node ≥ 22.12.

## Layout

| Path | |
|---|---|
| `src/core` | isomorphic: kit, RNG, `Match`, pacing, referee, scene checks, messages. No DOM, no Node APIs |
| `src/server` | Node: `node:vm` runtime, room server, worker |
| `src/client` | browser: local runtime, `createLocalMatch`, `connectRoom` |
| `src/engine` | three.js table (no React) |
| `src/react` | `<Tabletop>`, HUD, `<TablecraftGame>`, i18n, CSS |
| `src/core/mechanics` | rules-kit mechanics (turns, drafting, auctions, majorities…), one installer per file |
| `types` | hand-written TypeScript declarations for every entry point and the game-module contract |
| `packages/create-tablecraft` | the `npm create tablecraft` starter (published separately) |
| `examples` | games and a self-hosted server |
| `site` | landing page and playground (GitHub Pages) |
| `docs` | documentation |

## Guidelines

- **Determinism first.** Anything in `src/core` must behave the same in Node and in the browser.
- **The rules kit stays self-contained.** `createCore` in `src/core/kit.js` and every `install*` function in
  `src/core/mechanics/` are injected into sandboxes with `Function.prototype.toString()`: no imports, no references to
  module scope — only their `T` argument and JS built-ins. New mechanics need an entry in
  [docs/mechanics.md](docs/mechanics.md) and a test in `test/mechanics.test.js` (the parity test checks the sandbox copy).
- **Game-facing contracts are public API.** Changes to the module contract, scene format, fx or the wire protocol need
  docs and a CHANGELOG entry.
- **UI strings** go through `src/react/i18n.js` (add both `en` and `tr`); engine messages through `src/core/messages.js`.
- Match the surrounding style: small modules, short comments that explain *why*.
- Add or update tests in `test/`. For visual changes, attach a screenshot or short clip to the PR.

## Sharing a game

Games make the best examples. Open a PR under `examples/<your-game>/game.js` with a short header comment; it should pass
`simulate(source, { games: 200 })` cleanly.
