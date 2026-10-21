# create-tablecraft

Start a [Tablecraft](https://github.com/table-craft/table-craft) game in seconds: a Vite + React project with a complete,
referee-clean game module you can edit right away.

```bash
npm create tablecraft@latest
```

```bash
pnpm create tablecraft
yarn create tablecraft
bun create tablecraft
```

Answer two questions (project name, template) and follow the printed next steps. Then edit `src/game.js` — the rules,
what each player sees and the bots live in that one file.

## Templates

| Template | What you get |
|---|---|
| `dice` *(default)* | **Dice Duel** — the smallest complete game: one physical die, two players, first to 10. Plays in the browser against a bot. |
| `cards` | **Night Market** — 2–4 players: hidden hands, a deck drawn with `T.draw`, a discard pile and a face-up market. Plays in the browser against bots. |
| `multiplayer` | **Dice Duel** online — a socket.io room server (`server.js`, `createRoomServer`) and a client that joins with `connectRoom`. |

Every template includes `npm run validate`, `npm run simulate` (200 referee games) and `npm run balance` (the balance
lab), plus a `.mcp.json` so [Claude Code](https://claude.com/claude-code) can use the Tablecraft MCP tools in the project.

## Options

```bash
npm create tablecraft@latest my-game -- --template cards       # npm needs the extra `--`
npx create-tablecraft my-game --template multiplayer --yes      # no prompts (CI, scripts)
```

| Flag | |
|---|---|
| `[dir]` | Project directory (default: `my-tablecraft-game`). `.` scaffolds into the current directory. |
| `-t, --template <name>` | `dice`, `cards` or `multiplayer` |
| `-y, --yes` | Don't prompt; use the defaults plus the flags given |
| `-f, --force` | Write into a non-empty directory (files with the same name are overwritten, others are kept) |
| `-h, --help` · `-v, --version` | |

Prompts are skipped automatically when stdin/stdout is not a terminal. Colours follow `NO_COLOR` / `FORCE_COLOR`.
The next steps use the package manager you ran it with (npm, pnpm, yarn or bun).

Requires Node.js 22.12 or newer. No dependencies.

## License

[MIT](LICENSE)
