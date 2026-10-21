# Roadmap

Where Tablecraft is heading. Nothing here is a promise or a date — it is the order we would like to work in. Ideas and
votes are welcome in [Discussions](https://github.com/table-craft/table-craft/discussions); pick up anything marked
`help wanted` in the issues.

## Now — 0.2

- **Mechanics library** in the rules kit: drafting, auctions, worker placement, area majorities, trick-taking, set
  collection, deck-building, decision stacks and more ([docs/mechanics.md](docs/mechanics.md)).
- **TypeScript types** for the module contract, scene, HUD, fx and `T` — autocomplete in plain JS game files.
- **`npm create tablecraft`** starter projects.
- **Playground** with a live editor, examples gallery, shareable replays and a visual balance report.

## Next

- Mechanics follow-ups found while writing the examples: `T.auction` Dutch `decline()` bookkeeping and auctioneer
  exclusion, worker ids in `T.workers`, `T.market.refill` without reshuffling, `T.area` minority scoring, a `kind`
  filter for `T.sets.ofAKind`.
- View audit for the HUD: flag opponents' private stats and tips, not only card faces.
- `--time` for `tablecraft simulate` / `balance`, and a cheaper per-call sandbox for long games.
- Persistent rooms: pluggable storage (Redis / SQLite) so rooms survive restarts and scale across instances.
- Reconnect with seat tokens and spectator links.
- Undo / take-back for moves that reveal no information.
- Smarter bots: Monte-Carlo search over `actions()` with a move budget, opt-in per game.
- Asynchronous play (turn notifications, long-running rooms).
- Touch-first table controls and a screen-reader friendly text view of every scene.
- More scene primitives: square-grid boards, polyomino tiles, player mats with slots, bags.

## Later

- Visual card/board designer that writes `content` JSON.
- Print-and-play export (cards, boards, rules sheet) from the same content.
- Localised rules sheets generated from the module and its log lines.
- Tournament mode and Elo ratings for bot strategies in the balance lab.

## Non-goals

- A general-purpose 3D game engine. Tablecraft renders tabletops: cards, boards, tiles, tokens, dice.
- Physics as game logic. The server decides every result; physics only shows it.
