# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/)
and the project uses [Semantic Versioning](https://semver.org/). Until 1.0, minor versions may contain breaking changes.

## [Unreleased]

### Added
- **Dutch auctions:** `T.auction.create` can exclude ineligible bidders, and `T.auction.decline` lowers the price after all eligible bidders decline.
- **Area scoring:** `T.area.majority` supports `{ fewest: true }`, including zero-count players by default.
- **Rules kit:** `T.market.refill` accepts `{ reshuffle: false }` to leave the discard pile out of the deck when refilling.
- **Rules kit:** `T.sets.ofAKind(counts, n, kind?)` can count groups for one kind or a list of kinds.
- **Mechanics library** on the rules kit — [docs/mechanics.md](docs/mechanics.md) catalogs 40+ board-game mechanics and
  the helpers that implement them: `T.turns` (pass to end the round, snake and initiative order), `T.flow` (rounds,
  phases, "finish the round"), `T.pending` (decision/reaction stack), `T.workers`, `T.rondel`, `T.track`, `T.secret`
  (simultaneous commit/reveal), `T.auction` (open, once-around, Dutch, sealed first/second price), `T.vote`, `T.trade`,
  `T.roles`, `T.market`, `T.draft`, `T.deckbuild`, `T.tricks`, `T.dice` and `T.bag` (with exact odds), `T.grid` (square
  grids, line of sight, n-in-a-row, polyominoes), `T.score` (rankings with tie-breakers, ready `endIf` results),
  `T.sets`, `T.area` (majorities with tie rules). Identical in the host and the sandbox.
- **TypeScript declarations** for every entry point and the game-module contract; `@table-craft/table-craft/game` gives plain-JS game
  files autocomplete for `T`, `ctx`, scenes, HUD and fx (`/// <reference types="@table-craft/table-craft/game" />`).
- **`npm create tablecraft`** — starter projects (`dice`, `cards`, `multiplayer`), published as `create-tablecraft`.
- **Playground** on the site: live editor, referee and visual balance report in a worker, share links; an **examples
  gallery**; shareable **replay links**. Code from a shared link only runs after the reader presses Run.
- `Match#record()` and `client.record()` on local matches → `{ seed, players, options, moves, startedAt }`.
- New examples: Spice Bazaar (drafting), Harbor Workers (worker placement), Auction House (auctions), Drop Four
  (square grid), Liar's Dice (private rolls, odds) and Lantern Tricks (trick-taking).
- Project: CODE_OF_CONDUCT, SECURITY (threat model), ROADMAP, issue and PR templates, ESLint, Node 22/24 CI with
  typecheck and coverage, tag-triggered npm publish with provenance.
- Hex maps: `layout: 'hex'` zones (pointy or flat, axial `'q,r'` cells) and `hex` tile objects with terrain presets
  (forest, hills, mountain, city, wasteland, water…), heights, faces on top and an outline glow when selectable.
- Objects in a hex zone are placed on a `cell`, a `corner` / `vertex` or a `side` / `edge`, stand on the highest tile
  they touch and are spread when several share a place.
- `link` objects: roads, routes and supply lines between two objects or hex places (solid, dashed, dotted or
  segmented), clickable through a wider invisible strip.
- Hex tile faces take `rotate` (degrees, clockwise seen from above) to turn only the art, e.g. a coastline towards the sea.
- `ghost: true` draws tokens, tiles and links see-through, for placement previews and unclaimed routes.
- Rules kit: `T.hex` (neighbours, distance, rings, lines, canonical corner/edge keys, corner/edge graph, cell paths),
  `T.findPath` and `T.reachable`.
- Scene checks for hex positions and link ends; `supply-lines` example and MCP template.

### Fixed
- `validate()` always passes `options.content` to `setup` (`{}` when none was given), like matches and the referee do.
- The Spotlight no longer announces face-down cards that land in your own seat (cards dealt, drafted or passed to you).
- Docs now cover every scene prop, fx option and client field the engine reads (zone `hexSize`/`marks`/`y`, link
  `dashed`/`inset`, private rolls with `to`, `sound` volume, snapshot fields, form values arriving as strings).
- The Spotlight, side columns and hover preview used bare modifier classes (`side`, `left`, `right`, `center`) that
  collide with host-page CSS — e.g. an app sidebar's `.side { height: 100vh }` stretched the Spotlight over the whole
  left edge on your turn. They are now `tc-spot-side` / `tc-spot-center`, `tc-side-l` / `tc-side-r` and
  `tc-hover-l` / `tc-hover-r`.
- Seats narrower than a large centre zone (a map) were pulled in over it; zone edges are now sampled when seats are
  placed.

## [0.1.0] — 2026-10-20

First public release.

### Engine
- Server-authoritative game modules: `setup`, `moves`, `view`, `endIf`, plus `actions`, `bot`, `invariants`.
- Two runtimes with identical behaviour: `node:vm` sandbox (server) and a scoped function (browser).
- Seeded, serialisable RNG; rules kit `T` (decks, turn order, resources, sand timers).
- `Match` state machine: lobby, seats, bots, sand timers, pacing.
- Referee: `simulate`, `summarize`, `validate`, `simulateAsync` (worker thread).
- Room server on socket.io with a documented wire protocol; `connectRoom` and `createLocalMatch` clients.

### Table
- three.js table with physics dice (cannon-es), rounded cards, decks, tokens, boards, hourglass timers.
- Lamp lighting, image-based reflections, felt and wood surfaces, six environment presets, procedural sound with reverb.
- Animations from view diffs: arcs, tilt, staggered dealing, flips, token drops.

### HUD
- `<TablecraftGame>`, `<Tabletop>`, `useMatch`, `mountGame`.
- Spotlight for other players' moves, persistent game log, turn indicator and cues, end-of-game scoreboard.
- Settings (volume, animation speed, Spotlight mode, graphics, bot pace), keyboard shortcuts, container-responsive layout.
- English and Turkish built in; themeable with `--tc-*` custom properties.
- Fast games keep the table centre free: a newer banner takes over after 0.7 s instead of queueing, banners sit above
  the table centre, the Spotlight moves aside on your turn and "Your turn" drops from the turn indicator.
- Responsive camera: the table is fitted into the area the HUD leaves free and re-framed on every resize (until the
  player moves the camera); portrait and narrow tables are viewed more from above.

### Replays
- `replayMatch()` re-runs a recorded match deterministically (rejected and sand-timer moves included);
  `createReplay()` turns it into a MatchClient with play / pause / step / seek / viewer / speed controls, and
  `<ReplayViewer>` adds a timeline with markers for rounds and rejected moves.

### Balance lab
- `analyzeBalance()` / `analyzeBalanceAsync()`: seat win rates and first-player advantage (with standard error), length
  distribution, choices per decision and forced decisions, lead changes and comebacks (via the optional `score()` export),
  strategy win rates across bot profiles (`module`, `random`, `greedy`), and warnings with significance checks.
- `sweepParameter()` and `compareReports()` for what-if changes and version-to-version comparison.
- View audit moved to the core (`audit()`); CLI `tablecraft balance`; MCP tools `analyze_balance` and `sweep_parameter`.

### AI assistants
- MCP server (`npx tablecraft mcp`, zero dependencies): docs and templates, `validate_game`, `simulate_game`,
  `audit_views` (hidden-information leaks and readability), step-through debug matches, and `new_game` /
  `fix_referee_report` prompts.
- CLI: `tablecraft validate | simulate | audit` for terminals and CI.

### Site
- Landing page with a playable in-browser demo, a full-screen playground and a documentation site generated from `docs/`
  (search, on-this-page navigation, copyable code, mobile menu).
