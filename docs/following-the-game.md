# Following the game

A digital table has a problem a real one doesn't: you can't watch other players' hands move. Bots make it worse —
they act in a fraction of a second, on the far side of the table. Tablecraft is designed so that **everyone can
follow every move**, whether they are playing, waiting or spectating.

## Spotlight

When another player reveals or plays a card, the Spotlight shows it at the top of the screen — large and readable —
with who did it, what they did and, when available, the line from your game log:

> **Bot 2** played a card  
> *Bot 2, Marseille: delivered Olive Oil, +3*  
> [card] → Discard

Entries queue up and are shown **one at a time**. Hover to pause, pin to keep, press **Space** to skip, click the card
to enlarge it. The card also glows on the table so the eye connects the two. If moves pile up (fast bots), entries get
shorter so the table never falls behind. Players choose *Large*, *Side* or *Off* in the settings, and whether to see
their own moves too.

### What is detected

Nothing to configure — the client compares consecutive views:

| Change | Shown as |
|---|---|
| a face-down card becomes face-up in the same place | "revealed a card" |
| a card arrives face-up from a deck (`enterFrom`) into the centre | "put a card on the table" |
| a card moves from a seat to the centre (or a hidden card appears face-up elsewhere) | "played a card" |
| a card moves from the centre into a seat | "took a card" |
| a card moves from one seat to another | "gave a card" |
| a face-up `deck` (discard pile) gets a new top card | "discarded a card" |

Moves into **your own** hand are skipped — you already see them.

### Helping it

The actor and the caption are inferred. A few habits make them exact:

1. **Write one log line per action with the player's name and the card's title.** If a new line mentions the card's
   title, that line's player is the actor and the line becomes the Spotlight text.
2. **Keep ids stable** — the same physical card has the same id when it moves.
3. **Label centre zones** (`label: 'Market'`) — that's the "→ Market" caption.
4. **Use `enterFrom`** for cards that come out of a deck.

For anything the diff can't infer — a secret role revealed at the end, a card shown to the table without moving — use
an explicit reveal:

```js
ctx.fx({ type: 'reveal', ids: ['role:p3'], by: 'p3', title: 'revealed their role', text: 'Bo was the Traitor!' });
```

## Game log

Press **L** (or the list icon) for the game log: the whole match as a timeline.

- `hud.log` lines, with rounds as dividers and player names in their colours
- every Spotlight entry with card thumbnails (click to enlarge)
- dice results ("Bo rolled: 5")
- banners as section headers
- filters (*All · Moves · Cards · Dice*), an unread counter, copy-to-clipboard for playtest notes

You only send the last ~40 lines; the client keeps the history.

## Pace

Bots wait before moving so people can keep up. The base delay depends on the room's pace; effects add time:

| | Slow | Normal | Fast |
|---|---|---|---|
| base | 3.4 s | 2.2 s | 0.9 s |
| after a dice roll | +2.5 s | +1.9 s | +0.7 s |
| after a banner | + its duration × 1.3 | + its duration | × 0.35 |
| after a reveal | +2.3 s | +1.8 s | +0.6 s |

The room's host changes the pace from the table settings (it applies to everyone). Server-side: `match.setPace()`,
`createRoom({ pace })` or `createLocalMatch({ pace })`.

## Turn cues

- The turn indicator at the top: "Turn: Bo · · ·" or a gold **Your turn**.
- When your turn starts: a soft chime, a brief "Your turn" card, the decision dock glows and expands, and — if the player
  enabled it — the camera turns to their area.
- The active seat glows on the table and in the player list.

## Watching vs. playing

Spectators get `view(state, { playerId: 'spectator' })` — only public information — with the same Spotlight, log and
cues. That's the view to design your public table around.
