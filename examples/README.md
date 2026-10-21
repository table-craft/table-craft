# Examples

| | |
|---|---|
| [`coin-flip-duel`](coin-flip-duel/game.js) | The 40-line game from [Getting started](../docs/getting-started.md) |
| [`treasure-road`](treasure-road/game.js) | A complete small game: hidden hands, deck and discard, physical die, pawns on a track, coins, sand timer, bots and invariants. Powers the landing-page demo |
| [`supply-lines`](supply-lines/game.js) | A hex-map game: terrain tiles, cities on hex corners, routes to claim between them, depots on cells, `T.hex` and `T.findPath`. Open any of them with `play.html?game=<folder>` or in the playground |
| [`four-in-a-row`](four-in-a-row/game.js) | Drop Four: a square-grid board, gravity, `T.grid.lineRuns` for four in a row, a bot that wins and blocks |
| [`liars-dice`](liars-dice/game.js) | Liar's Dice: hidden dice rolled privately, bids and challenges, bots using `T.dice.odds` |
| [`tricks`](tricks/game.js) | Lantern Tricks: trick-taking with trumps and exact bids — `T.tricks`, `T.flow`, `T.score` |
| [`spice-draft`](spice-draft/game.js) | Spice Bazaar: simultaneous pick-and-pass drafting (`T.secret`, `T.draft`), set collection and majorities |
| [`harbor-workers`](harbor-workers/game.js) | Harbor Workers: worker placement in phases (`T.flow`, `T.workers`), a sliding contract market, a decision stack |
| [`auction-house`](auction-house/game.js) | Auction House: open, once-around, sealed and Dutch auctions with hidden money (`T.auction`, `T.secret`) |
| [`server`](server/) | Self-hosted multiplayer: socket.io room server + client. `npm run example:server` |

Try any game without writing UI: open the playground (`npm run site:dev` → `/play.html`) or run the referee:

```bash
node -e "import('tablecraft/server').then(async (t) => console.log(t.summarize(t.simulate(require('fs').readFileSync('examples/treasure-road/game.js', 'utf8'), { games: 100 }))))"
```
