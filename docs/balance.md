# Balance lab

The [referee](testing.md) tells you the rules *work*. The balance lab tells you whether they are *fair and tense*: it
plays hundreds of complete games with bots and measures seat advantage, game length, how often players have a real
choice, whether the leader can be caught, and whether one way of playing beats everything else.

```bash
npx tablecraft balance games/tea.js --games 300 --bots module,greedy
```

```
300/300 games finished
length        avg 19.1 · median 18 · p10 8 · p90 32 moves
first player  +15.6% vs fair share (±4.3%)
decisions     1.4 options on average · 65.3% forced · ties 0%
tension       2.24 lead changes per game · comebacks 30.6%
bots          module 39.6% · greedy 40.6%

! [warn] first player wins more than a fair share by 15.6%
! [warn] 65.3% of decisions offer only one option — players may feel on rails
```

The balance lab needs [`actions()`](game-module.md); make the referee clean
first — unfinished games distort every number.

## Metrics

| Field | Meaning | Healthy range (rule of thumb) |
|---|---|---|
| `length.avgMoves / medianMoves / p10Moves / p90Moves` | moves per finished game (every applied move, including sand-timer moves) | p90 within ~2× the median |
| `seatWinRate` | win rate by seat index across all games where the seat existed; ties split the win | each seat near 1 / players |
| `firstPlayerAdvantage` | seat 0's win rate minus its fair share, averaged over player counts (solo excluded); `firstPlayerAdvantageSE` is the standard error a fair game would show | within ±4% |
| `tieRate` | share of finished games with more than one winner | depends on the design; > 15% suggests a tie-breaker |
| `decisions.avgChoices` | average number of non-free actions when someone moves | > 2 for most turns |
| `decisions.forcedRate` | share of decisions with exactly one option (rolling, "end turn") | < 40% feels like choosing |
| `leadChanges` | how often the leader changes per game (needs `score()`) | > 1 means a race, not a procession |
| `comebackRate` | share of games won by a player who was **not** leading at two thirds of the game (needs `score()`) | 20–40% |
| `strategies` | win rate per bot profile when you mix profiles | none above ~65% |
| `byPlayers` | the same per player count: `games`, `finished`, `seatWinRate`, `avgMoves`, `firstPlayerAdvantage` | |

Numbers are deterministic for a given `seed`, so two runs of the same module give the same report — compare versions
with confidence.

## Warnings

| Code | Severity | When |
|---|---|---|
| `first_player_advantage` | warn > 8 pp · info > 4 pp | and the difference is clear of noise (> 2.5 standard errors) |
| `seat_imbalance` | warn | a seat is > 10 pp (and > 2.5 SE) from its fair share with ≥ 20 games; skipped when bot profiles are mixed, because who sat where then dominates |
| `forced_decisions` | warn | more than 40% of decisions have one option |
| `long_tail` | warn | p90 length is more than 3× the median |
| `dominant_strategy` | warn | with two or more real profiles (`module`, `greedy`), one wins more than 65% of its games |
| `luck_dominates` | warn | random play wins within 5 pp of a real profile — decisions may not matter (or `bot()` is weak) |
| `skill_matters` | info | a real profile clearly beats random play |
| `many_ties` · `no_comebacks` | info | tie rate > 15% · comebacks < 10% |
| `unfinished` · `errors` · `timed_out` | warn · warn · info | run the referee; raise `timeLimitMs` |

Treat warnings as questions for a playtest, not verdicts: bots are not people. A first-player advantage measured with
bots is real, though — humans rarely play *against* it.

## Bot profiles

| Profile | Plays |
|---|---|
| `module` | your `bot()` (or a random non-free action when it has none) |
| `random` | any non-free action |
| `greedy` | tries up to 24 legal actions one move ahead and keeps the one that maximises your `score()` for the acting player; falls back to `module` without `score()` |

`botMix: ['module', 'greedy']` assigns profiles round-robin to seats and rotates them every game (per player count), so
each profile plays every seat equally often. A profile that wins far more than its share points at a dominant strategy —
or at a weak `bot()`. Add `random` as a baseline: a good game rewards decisions, so real bots should beat it clearly
(`--bots module,random`).

## `score()`

Export an optional position evaluation to unlock the greedy bot and the tension metrics:

```js
score(state, { playerId }) {
  const me = state.players.find((p) => p.id === playerId);
  const best = Math.max(...state.players.filter((p) => p !== me).map((p) => p.points));
  return me.points - best; // higher is better for playerId
},
```

Keep it cheap and honest: victory points, distance to the goal, material — whatever a player would call "being ahead".

## Sweeps

Change one number, keep everything else equal, compare:

```bash
npx tablecraft balance games/tea.js --sweep options.target=15,20,25
npx tablecraft balance games/tea.js --content data/tea.json --sweep content.cards.3.count=2,3,4
```

`path` starts with `content.` (your game data) or `options.` (setup options); array indices are numbers.

## API

```js
import { analyzeBalance, analyzeBalanceAsync, sweepParameter, compareReports } from 'tablecraft/server';

const before = analyzeBalance(oldSource, { games: 300, botMix: ['module', 'greedy'], content });
const after = await analyzeBalanceAsync(newSource, { games: 300, botMix: ['module', 'greedy'], content }); // worker thread
compareReports(before, after);
// [{ metric: 'firstPlayerAdvantage', before: 0.156, after: 0.031, delta: -0.125 }, …]

const runs = sweepParameter(source, { path: 'options.target', values: [15, 20, 25], games: 200 });
// [{ value: 15, report }, …]
```

Options: `games` (200), `players` (default: cycles minPlayers…maxPlayers), `botMix` (`['module']`), `seed` (1),
`content`, `variant`, `options`, `maxMoves` (4000), `timeLimitMs` (60000). The same functions run in the browser on a
`LocalGameModule` (`analyzeBalance` from the core) — results are identical.

`analyzeBalance` and `sweepParameter` take module source text or a loaded module; `analyzeBalanceAsync` takes **source
text only** (it runs in a worker thread).

With an AI assistant, use the MCP tools [`analyze_balance` and `sweep_parameter`](mcp.md).
