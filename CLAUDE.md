# The Count — Frontend

Static frontend (`index.html`, `script.js`, `style.css`) deployed to
dropkickarcade.com/the-count. Connects over WebSocket to the Render game server; all
game state is authoritative on the server.

## Information leakage: the broadcast rule

The anti-bot design depends on a client not being able to derive the answer by any route
other than the one the game intends. The governing rule:

> **Anything you broadcast that is a deterministic function of the hidden value is the
> hidden value.**

Removing a value from one field accomplishes nothing if another field — or the timing,
size, or mere existence of a message — lets a client reconstruct it.

### When to apply this

Check the rule on **every change to the client/server message contract or to what the
client renders**: a new field consumed from a frame, a new stat shown in the UI, a change
to how state updates are handled.

**If a change introduces or preserves a channel that violates the rule, say so immediately
and prominently, before continuing with the rest of the task.** Do not quietly work around
it or leave it for a summary at the end.

Client-side concealment is not a control. Anything the client receives is available to
anyone running a script against the socket, whether or not the UI displays it. Real
enforcement lives in the server; the only thing that matters here is what the server is
asked to send.

### Channels to audit

- **Field contents** — any value from which the hidden one can be computed.
- **Aggregates** — sums, totals, counts, progress bars, milestones.
- **Message existence and timing** — a frame sent only when the hidden value changes leaks
  that change by arriving, even with the value stripped out.
- **Per-event attribution** — broadcasting *who* just scored lets any client keep a tally.

### Known live instances

1. `counter` arrives verbatim in the `init` and `state` frames. Currently by design.
2. **Score sum.** Every player's exact score is in every frame, and those scores sum to
   `counter` — so the counter is recoverable even if the field itself is removed.
3. **Frame counting.** A `state` frame is pushed on every successful submission, so counting
   frames tracks the counter exactly without reading any field.
4. **Per-event attribution.** `playerUuid` in the increment broadcast identifies who scored.

## Other standing notes

- `generateUniqueNumbers()` / `populateCounter()` in `script.js` render the real counter among
  nine `opacity: 0` decoys. This stops no bot — bots read the WebSocket frame and never touch
  the DOM — while breaking screen readers and copy/paste. It should be deleted; do not extend
  this approach.
- The React client in the-count-backend renders the counter plainly, so the two frontends do
  not behave the same way. Keep protocol changes in sync across both.
- The number inputs use `step="10"`, so the spinner jumps by ten.
