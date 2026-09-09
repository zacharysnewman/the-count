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

None. The four channels below were closed together in the backend, which is the only
reason hiding the value means anything — closing any three of them would have achieved
nothing. `the-count-backend/HARDENING.md` #8 has the detail.

1. ~~`counter` sent verbatim.~~ The frame now carries `targetImage`, a server-rendered
   PNG data URI of the goal, and no numeric counter at all. `renderTargetImage()` drops
   it into an `<img>` and does nothing else with it. Keep it that way — do not add a
   text alternative or any client-side transcription (see the accessibility note below).
   The image is plain upright digits and makes no attempt to resist OCR; that is a
   deliberate backend decision, so the bar it sets is "a bot needs a recognition
   pipeline", not "a bot cannot read it".
2. ~~Score sum.~~ The broadcast leaderboard is a periodic snapshot, not live totals. A
   player's own score arrives privately in a `you` frame.
3. ~~Frame counting.~~ State arrives on a fixed cadence whether or not anything changed,
   with a freshly randomised image every tick, so frames cannot be counted or compared.
4. ~~Per-event attribution.~~ No `playerUuid` in broadcasts, so no client can keep its
   own tally.

**The practical rule for this repo: do not ask the server for anything it does not already
send.** A field that would make the UI nicer is the whole attack if it is a function of
the counter. Adding one is a backend change and belongs in that repo's audit.

## Other standing notes

- The counter image is a **fixed 400x80 canvas at a constant byte size for every value**.
  Both are anti-leak measures in the server renderer — dimensions and payload length each
  used to reveal the digit count. Nothing here should crop, trim whitespace from, or
  otherwise size the element from the image content; style it from the fixed aspect ratio
  only. `.counterImg` is capped at `30rem`.
- **Do not cache or diff `targetImage` across frames.** The server randomises every render
  precisely so consecutive frames are never byte-identical; a client-side "skip if
  unchanged" optimisation would rebuild the frame-counting leak that randomisation exists
  to prevent, and would never hit anyway.
- The player key is identity: holding it *is* being that player. It is shown once in the
  key modal and stored locally. Never log it, never put it in a URL, never send it
  anywhere but the game socket.
- Leaderboard rows are built with `textContent`, never `innerHTML` — `playerName` is
  attacker-controlled and the server sanitises it, but this is the layer that actually
  matters for XSS. Keep it that way.
- **Accessibility is a known, unresolved exclusion.** The goal is an image with no text
  alternative, so a screen reader user cannot play. There is no way to expose the value to
  assistive technology without exposing it to a script — that is the entire mechanism.
  The answer, when there is one, is a separate accessible mode, not an `alt` attribute.
  The digits are no longer rotated, which helps low-vision sighted players a great deal
  and does nothing whatsoever for screen reader users.
- The React client in the-count-backend renders the same `targetImage` and shares this
  contract. Keep protocol changes in sync across both.
