# Effects (fx)

State changes animate by themselves: cards fly and flip, decks grow and shrink, coins drop onto stacks — all from
comparing views. Effects are for the moments that are **not** state.

```js
ctx.fx({ type: 'banner', text: 'Winter is coming', sub: 'Round 5', color: '#7fb3d5' });
ctx.fx({ type: 'toast', text: 'Bo offers you a trade', tone: 'info', to: [bo.offerTo] });  // private
```

Add `to: [playerIds]` to any effect to show it only to those players.

| type | Fields | What happens |
|---|---|---|
| `roll` | emitted by `ctx.roll` / `ctx.rollMany` (`{ id, by, zone, to }`) | the scene die with that `id` is thrown from the roller's seat with real physics and settles on the server's result; the face floats up and goes into the game log. Pass `to: [playerIds]` for a private roll |
| `banner` | `text`, `sub?`, `color?`, `sound?` (`gong`), `ms?` (2600) | a cinematic band across the table — round starts, phase changes, the winner. Banners queue, never overlap |
| `toast` | `text`, `tone: 'info' \| 'good' \| 'bad'`, `ms?`, `sound?: false` | a short notification with an icon and a progress bar |
| `sound` | `name`, `vol?` (0–1, default 1) | play a built-in sound or a `scene.sounds` key |
| `shake` | `strength?` (0.7), `sound?` (`storm`) | camera shake — storms, explosions, betrayals |
| `toss` | `zone` or `target`, `from?` (playerId or objId), `n`, `token: { shape, color, face }` | tokens physically tossed onto the table (gold paid, damage dealt) |
| `highlight` | `ids`, `color?`, `ms?` | pulse a glow under objects |
| `reveal` | `ids`, `by?`, `title?`, `text?` | put objects on the [Spotlight](following-the-game.md) for everyone |
| `focus` | `zone` / `id` / `preset: 'table' \| 'me' \| 'top' \| 'center'` | move the camera (`center`: a fixed 45° view of the table's centre, not fitted to the HUD) |

## Sounds

Built in (procedural, no files): `slide`, `flip`, `deal`, `shuffle`, `tap`, `clink`, `clack`, `dice`, `chime`, `turn`,
`notify`, `reveal`, `good`, `bad`, `error`, `whoosh`, `gong`, `win`, `storm`, `tick`, `alarm`, `hover`.

Override any of them — or add your own names — with `scene.sounds: { name: assetKey | url }`.

## Pacing

Hosts wait longer before the next bot move after `roll` (~1.9 s), `banner` (its duration), `reveal` (~1.8 s) and
`shake`/`toss` (~0.9 s), so the table never races ahead of the people watching it. See
[Following the game](following-the-game.md#pace).
