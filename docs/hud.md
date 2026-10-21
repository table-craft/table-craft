# HUD

The `hud` part of a view is the 2D layer over the table. The table is the primary interface — players click cards,
dice and tokens — so keep the HUD for information and for decisions that need parameters.

```js
hud = {
  title: 'Treasure Road',
  status: 'Round 3 · Ada',
  myTurn: true,                                  // optional; otherwise derived from players[].active + me
  players: [{
    id, name, color, active, me, out,
    badges: ['First player'],
    stats: [{ label: 'Gold', value: 3, color: '#b8901f', key: true, icon, title }],
  }],
  prompt: UiNode,                                // decision dock (bottom right)
  promptTone: 'wait',                            // grey dock while waiting for others
  promptTitle: 'Choose a port',
  panels: [{ id, title, icon, side: 'left' | 'right', open: true, node: UiNode }],
  log: ['R1 · Ada rolled a 4.', ...],
}
```

## Players

One card per player: avatar (a robot for bots), name, `you` / `up` tags, badges and stats. Stats with `key: true` are
always visible; others appear for you, the active player and on hover. `out: true` greys a player out. The turn
indicator at the top ("Turn: Bo · · ·" / "Your turn") is driven by `active`.

## Prompt

The dock in the bottom-right corner holds what the viewing player has to decide now: buttons, a form, a short
explanation. It glows when it is your turn and can be minimised. Use `promptTone: 'wait'` while the player is only
watching.

## Panels

Collapsible side panels for reference material — round summary, scoring rules, a trade list. `side: 'left'` stacks
under the players; `'right'` stacks above the game log.

## Log

Send the last ~40 lines as `hud.log`. Tablecraft diffs consecutive views into a **persistent game log** (press **L**),
so players keep the full history even though you only send a window. Conventions that render nicely:

| Line | Rendered as |
|---|---|
| `R3 · Ada played Tailwind.` (or `T3 ·`) | a round chip `R3` + the text |
| `— Round 3 —` | a divider |
| text containing a player's name | the name in that player's colour |

Lines that mention a card's title also caption the [Spotlight](following-the-game.md).

## UI nodes

`prompt`, `panels[].node` — and a whole `view()` if you skip the 3D scene — use declarative nodes:

| `type` | Fields |
|---|---|
| `col`, `row` | `children`, `gap`, `align`, `wrap` |
| `panel` | `title`, `accent`, `children` |
| `text` | `text`, `size: 'sm' \| 'md' \| 'lg' \| 'xl'`, `bold`, `muted`, `color` |
| `badge` | `text`, `bg`, `color` |
| `divider` | — |
| `button` | `label`, `move: { name, args }`, `variant: 'primary' \| 'ghost' \| 'danger'`, `disabled` |
| `form` | `fields: [{ id, label, kind: 'select' \| 'number' \| 'text', options: [{ value, label }], min, max, placeholder }]`, `submit: { label, move: 'name' \| { name, args } }` — values are merged into `args` |
| `scores` | `items: [{ label, value, color }]` |
| `log` | `entries: string[]` |
| `grid` | `cols`, `cellHeight`, `cells: [{ label, sub, bg, color, border, badge, faded, move, disabled }]` |
| `cards` | `cards: [{ title, text, footer, bg, color, selected, move, disabled }]` |

```js
prompt: { type: 'col', children: [
  { type: 'text', text: 'Choose what to trade', bold: true },
  { type: 'form',
    fields: [
      { id: 'give', label: 'Give', kind: 'select', options: [{ value: 'wood', label: 'Wood' }, { value: 'ore', label: 'Ore' }] },
      { id: 'n', label: 'Amount', kind: 'number', min: 1, max: 3 },
    ],
    submit: { label: 'Offer', move: { name: 'offer', args: { to: 'p2' } } } },
] }
```

Form values reach `args` as **strings** — also from `number` fields and from `select` options with number values — and
a field the player left empty is missing. They override fixed `args` with the same key. Convert and check them in the
move: `const n = Number(ctx.args.n); if (!Number.isInteger(n) || n < 1 || n > 3) return { error: 'Pick 1–3' };`
