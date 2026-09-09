## What changed, and why

## Information leakage

> **Anything you broadcast that is a deterministic function of the hidden value is the
> hidden value.**

Client-side concealment is not a control. Anything the client receives is available to
anyone running a script against the socket, whether or not the UI displays it. The
practical rule here: **do not ask the server for anything it does not already send** — a
field that would make the UI nicer is the whole attack if it is a function of the counter.

- [ ] No new field consumed that is a function of the counter (adding one is a backend
      change, and belongs in that repo's audit)
- [ ] Nothing derives, transcribes or reconstructs the goal from `targetImage`
- [ ] **No structural shortcut to the number** — no SVG, sprite sheet, per-digit asset, or
      blob cached by value. Anything a lookup table can turn into a digit without touching
      a pixel is the attack the raster format exists to prevent.
- [ ] `targetImage` is not cached or diffed across frames. The server randomises every
      render so consecutive frames are never byte-identical; a "skip if unchanged"
      optimisation would rebuild the frame-counting leak and would never hit anyway.

## Safety

- [ ] Leaderboard rows and any player-supplied text are built with `textContent`, never
      `innerHTML` — `playerName` is attacker-controlled, and this is the layer that decides
      whether a name becomes script
- [ ] The player key is never logged, never in a URL, and sent nowhere but the game socket

## Counter image

- [ ] Styled from its fixed aspect ratio only — not cropped, whitespace-trimmed, or sized
      from image content. The constant 400x80 canvas and constant byte size are anti-leak
      measures in the server renderer, not layout choices.

## Accessibility

The goal is an image with no text alternative, so a screen reader user cannot play. There
is no way to expose the value to assistive technology without exposing it to a script.

- [ ] This change does not widen that exclusion further
- [ ] No `alt` text or ARIA label carrying the value was added (the answer is a separate
      accessible mode, not an attribute)

## Protocol

- [ ] In step with the React client in the-count-backend, if the message contract changed
