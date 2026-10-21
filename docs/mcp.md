# AI assistants (MCP)

Tablecraft ships a [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI assistant — Claude Code,
Claude Desktop, or any MCP client — can write a game, check it with the referee, audit what each player sees and step
through a match move by move. It runs locally over stdio and has no dependencies beyond Tablecraft itself.

```bash
npx tablecraft mcp
```

## Connect

**Claude Code** — for one project, add `.mcp.json` at the project root (commit it to share with your team):

```json
{
  "mcpServers": {
    "tablecraft": { "command": "npx", "args": ["-y", "tablecraft", "mcp"] }
  }
}
```

or from the terminal: `claude mcp add tablecraft -- npx -y tablecraft mcp`.

**Claude Desktop** — add the same entry under `mcpServers` in `claude_desktop_config.json`.

File paths in tool calls are resolved against the server's working directory (your project root in Claude Code).

## Tools

| Tool | What it does |
|---|---|
| `get_docs` | This documentation, page by page (`game-module`, `scene`, `hud`, `fx`, `rules-kit`, `testing`, …) |
| `get_template` | A complete, referee-clean starter: `coin-flip-duel` (smallest) or `treasure-road` (hidden hands, deck, die, track, timer) |
| `validate_game` | Loads the module, runs setup, renders every player's view and checks the scene; a short referee pass when `actions()` exists |
| `simulate_game` | The [referee](testing.md): many bot games; errors, rejected actions, stuck games, invariant violations, broken views — each reproducible |
| `audit_views` | Plays bot games and inspects every view after every move (see below) |
| `analyze_balance` | The [balance lab](balance.md): seat and first-player advantage, length, forced decisions, lead changes, comebacks, dominant bot strategies |
| `sweep_parameter` | Runs the balance lab once per candidate value of one number (`content.…` / `options.…`) and tabulates the differences |
| `start_match` | An in-memory match you drive yourself; players are `p1`, `p2`, … |
| `get_state` | Overview with every player's legal actions — or, with `playerId`, a text rendering of exactly what that player sees |
| `play_move` | Play a move as any player; returns the fx or the rejection message |
| `run_bots` | Fast-forward with bots (and expiring sand timers) until the end, a stuck state, or until a given player can move |
| `end_match` | Free a match |

Every game tool takes the module as `source` (text) or `path` (file), and optional game data as `content` (object) or
`contentPath` (JSON file).

### `audit_views`

Checks the things that are easy to get wrong and hard to see in your own browser:

| Severity | Finding |
|---|---|
| error | **Hidden-information leak**: a face-down card or deck whose `face` is still sent to that player |
| error | Scene errors, actions that `move()` rejects, stuck states, rejected sand-timer moves |
| warn | An opponent's hand (`fan` zone of another seat) shown face-up; `hud.log` missing |
| info | Centre zones holding cards without a `label` (no "→ Market" caption in the [Spotlight](following-the-game.md)); log lines that name no player; nobody marked active |

## Resources and prompts

- Resources: `tablecraft://docs/<page>` for every docs page and `tablecraft://examples/<game>` for the templates.
- Prompts: **new_game** (idea → referee-clean, followable module, step by step) and **fix_referee_report** (reproduce each
  problem with a debug match, fix the root cause, re-run until clean).

## A typical session

> "Make a 2–4 player card game about tea plantations: draft cards, harvest with dice, first to 20 leaves wins.
> Save it to games/tea.js."

The assistant reads `game-module`, takes `treasure-road` as a reference, writes `games/tea.js`, then loops
`validate_game` → `simulate_game` → `audit_views` → `analyze_balance`, using `start_match` / `run_bots` / `get_state` to reproduce anything
the referee reports — until all three are clean.

## From the terminal

The same checks are available without an assistant:

```bash
npx tablecraft validate games/tea.js
npx tablecraft simulate games/tea.js --games 200 --players 3
npx tablecraft audit games/tea.js --content data/tea.json
npx tablecraft balance games/tea.js --bots module,greedy --sweep options.target=15,20,25
```

`simulate` and `audit` exit with a non-zero code when they find errors, so they work as CI steps.

## Safety

Game modules run in Tablecraft's `node:vm` sandbox with per-call time limits, the same runtime as the room server. The
MCP server reads the files you point it at and never writes files; matches live in memory. As with the room server,
only run modules you trust — `node:vm` is not a boundary against hostile code.
