# Phase A — docking

## What Phase A does

ConCon's panel needs to *reserve* horizontal space on the ChatGPT page
rather than sitting on top of the conversation. Without this, the right
~340 px of ChatGPT's content is hidden under our panel, which is both
annoying and reads as "unfinished."

Phase A adds three layout modes, driven by viewport width and a user
collapse preference:

| mode              | trigger                                          | reservation   | panel                       |
| ----------------- | ------------------------------------------------ | ------------- | --------------------------- |
| `docked-expanded` | viewport ≥ 1150 px, user has not collapsed       | 340 px        | full ledger UI              |
| `docked-collapsed`| viewport ≥ 1150 px, user has collapsed via chevron | 48 px         | thin rail with expand button|
| `overlay`         | viewport < 1150 px, OR main container not found  | none          | floats on top                |

The current mode is exposed on `<html data-concon-layout="…">` so any
consumer (including external tooling or user styles) can react to it.

## Why padding on `main`, not `body { margin-right }`

Codex's earlier Phase A design used `body { margin-right: 340px !important }`.
That approach is fragile for two reasons:

1. **Assumes body-derived width.** Modern SPAs frequently use a
   fixed-position root, a portal-rendered layout, or a viewport-relative
   width (`100vw`). In those cases the body margin does nothing and the
   panel remains an overlay by accident.
2. **`!important` on body creates layout collisions** with modals,
   toasts, fixed composers, and share menus that position from viewport
   coordinates.

ConCon's approach instead applies `padding-right` to the specific main
content container found via `selectors.js` (currently `main`). This:

- reflows the conversation column cleanly,
- leaves the left navigation, top header, modals, and the composer
  untouched,
- needs no `!important` — ChatGPT's own flex/grid math handles the rest,
- falls back to overlay silently if the container isn't found (the
  extension degrades to "harmless floating panel" rather than "broken
  page").

## Implementation

- `extension/src/content/dock.js` — mode controller. Exports
  `attachDock()`, `detachDock()`, `toggleCollapsed()`, `refreshDock()`,
  and `onLayoutChange(cb)`.
- `matchMedia('(min-width: 1150px)')` drives the responsive breakpoint;
  a change handler re-applies layout automatically.
- Original `padding-right` value on `main` is stashed via
  `data-concon-original-padding-right` and restored on detach so the
  extension leaves no trace when unloaded.
- `mount.js` calls `attachDock()` after mounting the panel and
  `refreshDock()` on every SPA navigation.
- `panel.js` gets a `›` chevron in the expanded header (collapses) and a
  `‹` chevron in the rail (expands). The panel's outer element toggles
  a `.collapsed` class which hides the toolbar, body, and footer and
  reveals the rail.

## What the rail shows in collapsed mode

- The word `CONCON` printed vertically (writing-mode: vertical-rl) — so
  the user always knows the tool is still present.
- Ledger entry count, vertically.
- A small orange dot when at least one entry is still `proposed` or
  `asserted` (i.e., something is waiting for the user's attention).

## Edge cases

- **Container not found on first attach.** Falls back to overlay. The
  next `refreshDock()` call (triggered by SPA navigation) will re-probe.
- **Container swapped by ChatGPT at runtime** (e.g., app remount).
  `refreshDock()` finds the new container and re-applies. The old
  container's inline style is not restored in this narrow case; this is
  acceptable because the old container has been detached from the DOM.
- **Viewport crosses 1150 px while collapsed.** The `collapsed`
  preference persists; the mode changes to `overlay` if going narrow,
  and back to `docked-collapsed` if going wide again.

## What Phase A does NOT do

- Persist the collapsed state across sessions (in-memory only for v0.1).
- Animate the reservation change smoothly on ChatGPT's side beyond the
  built-in 180 ms transition on `padding-right`. If ChatGPT has its own
  layout transitions, they may briefly conflict.
- Handle multiple ChatGPT tabs opened simultaneously; each tab manages
  its own dock independently.
