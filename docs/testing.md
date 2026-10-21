# Bots & referee

Three optional exports turn a game module into something machines can play — and check.

```js
actions(state, { playerId }) { return [{ name: 'roll' }, { name: 'play', args: { card: 'c7' } }]; },
bot(state, { playerId, actions, random }) { return actions.find((a) => a.name === 'play') || actions[0]; },
invariants(state) { return totalCards(state) === 52 ? [] : ['card count changed']; },
```

## `actions()`

List **every legal move for this player right now**, with concrete arguments. That's the contract the rest builds on:

- every listed action must succeed when applied;
- negotiation-style moves that don't advance the game are `free: true`;
- if no player has a non-free action, `endIf()` is null and no sand timer is pending, the game is stuck.

With `actions()` exported, the lobby shows **Add bot**, and hosts let bots fill seats.

## `bot()`

Optional. Pick one of `actions` with any heuristic. `random` is seeded. If it returns something that isn't a valid
action, a random non-free action is used instead — a weak bot is still a working bot.

## Referee

```js
import { simulate, summarize, validate, simulateAsync } from 'tablecraft/server';

const report = simulate(source, {
  games: 200,            // default 20
  players: 3,            // default: cycles minPlayers…maxPlayers
  botMode: 'mixed',      // 'module' (your bot), 'random', or 'mixed' (alternating)
  content, variant, seed: 1, maxMoves: 4000, timeLimitMs: 60000,
});
console.log(summarize(report));
```

The referee plays full games and stops each one at the first problem:

| Report field | Means |
|---|---|
| `errors` | the module threw (setup, move, endIf, actions) |
| `rejected` | `actions()` offered a move that `move()` rejected |
| `stuck` / `stuckAt` | nobody could move but the game had not ended |
| `invariants` | `invariants()` returned violations |
| `views` | `view()` threw, returned no `type`, or the scene is broken (duplicate ids, unknown zones, bad `enterFrom`/`anchor`) |
| `capped` | a game hit `maxMoves` (probably an endless loop) |
| `finished`, `avgMoves`, `winsBySeat`, `byPlayers` | balance hints |

Each entry carries the game number, move number, player, phase, move name and args — enough to reproduce it with the
same `seed`.

`validate(source, { requireActions })` is a quick smoke test (setup, every player's view, scene checks, plus a short
referee run when `actions()` exists) that throws a readable error — use it before saving or publishing a module.

`simulate` and `validate` take module source text or a loaded `GameModule`. `simulateAsync(source, opts)` runs the
referee in a worker thread so a busy server keeps serving tables; it takes **source text only** and resolves to the
report plus `summary`.

## Balance

A clean referee report means the rules work, not that they are fair. Next, run the [balance lab](balance.md):
seat and first-player advantage, game length, forced decisions, lead changes, comebacks and dominant strategies —
`npx tablecraft balance my-game.js --bots module,greedy`.

## In CI

```js
// test/rules.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate, summarize } from 'tablecraft/server';

test('rules hold over 500 games', () => {
  const rep = simulate(fs.readFileSync('games/my-game.js', 'utf8'), { games: 500 });
  assert.ok(rep.ok, summarize(rep));
});
```

## AI-written games

The referee was built for machine-written prototypes: `summarize(report)` is compact, factual feedback you can hand back
to a model ("`actions()` offered `buy {card:'c12'}` in phase `market` but `move()` said *Not enough gold*"). Loop until
the report is clean.
