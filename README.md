# Whiteboard

An infinite-canvas whiteboard: pen and eraser, six colours, three stroke sizes,
undo/redo, pan and zoom (wheel, pinch, or keyboard). Drawings autosave to Supabase
and are restored on load. React + TypeScript + Tailwind, built with Vite and
deployed to Netlify.

Ported from the original single-file `whiteboard.html`, which is kept for reference.

## Getting started

```bash
npm install
cp .env.example .env.local   # optional; without it the board runs in memory
npm run dev                  # http://localhost:5173
```

| Script              | Purpose                            |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Vite dev server with HMR           |
| `npm run build`     | Typecheck, then build to `dist/`   |
| `npm run preview`   | Serve the production build locally |
| `npm run typecheck` | Typecheck only                     |

Requires Node `^20.19` or `>=22.12` (Vite 8).

## Shortcuts

| Key                        | Action        |
| -------------------------- | ------------- |
| `P` / `E`                  | Pen / eraser  |
| Hold `Space`               | Pan           |
| `Ctrl`/`⌘` + `Z`           | Undo          |
| `Ctrl`/`⌘` + `Shift` + `Z` | Redo          |
| `+` / `-`                  | Zoom in / out |
| `0`                        | Reset view    |

Scroll to pan, `Ctrl`/`⌘` + scroll (or pinch) to zoom, middle-drag to pan.
Clearing the board takes two clicks — the first arms the button for ~2.6s.

## Backend (Supabase)

### Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/0001_boards.sql` against it — either paste it into the
   SQL Editor, or `supabase db push` if you use the CLI. It creates the `boards`
   table, its RLS policies, and seeds the default board row.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key
   from _Project Settings → API_.
4. For Netlify, set the same two variables under _Site configuration → Environment
   variables_. They are inlined at build time, so redeploy after changing them.

| Variable                 | Required | Purpose                                     |
| ------------------------ | -------- | ------------------------------------------- |
| `VITE_SUPABASE_URL`      | yes      | Project URL                                 |
| `VITE_SUPABASE_ANON_KEY` | yes      | Anon/publishable key                        |
| `VITE_BOARD_ID`          | no       | Point a deploy at a different board row      |

Both keys ship in the browser bundle; that is expected for an anon key, and RLS is
what actually constrains access.

### How saving works

One row holds the whole board: `strokes` is a `jsonb` array of world-space
polylines. Undo, redo and clear all rewrite the list as a unit, so the client upserts
the entire document rather than tracking per-stroke rows — writes stay atomic and
there is no reconciliation to get wrong.

That only works while the document stays small, and raw pointer input is not: a
pointer samples at 60–120Hz, and dividing by `Viewport.scale` turns every coordinate
into a full-precision double like `123.45678901234567`. So a stroke is compacted once,
when it is committed (`simplify.ts`), which keeps every later save small too:

- Moves landing within `MIN_POINT_DISTANCE_PX` of the last sample are dropped as they
  arrive — they cost bytes and paint nothing.
- The finished path is run through Douglas–Peucker at `SIMPLIFY_TOLERANCE_PX`.
- Coordinates are rounded to `COORD_SUBPIXEL_DIGITS` decimals.

All three are screen-pixel quantities, converted to world space via the scale the
stroke was drawn at, so fidelity stays constant at any zoom — a fixed world-space
tolerance would mangle strokes drawn zoomed in and barely touch strokes drawn zoomed
out. Measured on synthetic 360-sample strokes, the document comes out ~8× smaller with
worst-case deviation under 0.6px at every zoom level. Because the in-memory array
holds the compacted strokes, undo/redo and the ink layer stay in sync with what is
stored; strokes restored from older rows are compacted on load, so the first save
after an edit shrinks them too.

`useBoardSync` loads that row once on mount and then autosaves on a 700ms debounce
after every committed change (stroke finished, undo, redo, clear), flushing early if
the tab is hidden. A failed write retries up to three times.

Two invariants matter:

- **Saving is disabled until the load resolves.** A slow network or a failed read
  can therefore never overwrite a stored board with a blank one. If the load fails,
  the session stays read-only and the indicator reads _Not saved_; reload to retry.
- **Strokes drawn while the load is in flight are kept.** Restored strokes are
  prepended beneath them rather than replacing them.

Rows are parsed defensively (`parseStrokes`): anything that does not match the
current `Stroke` shape is dropped so a stale or hand-edited row cannot break a
frame. The viewport is deliberately *not* persisted — pan and zoom stay per-device.

The top-right indicator reports the state: _Loading_, _Saving_, _Saved_,
_Not saved_, or _Local only_ when no database is configured.

### Limitations

- **No authentication.** Everyone shares one public board, and RLS grants the anon
  role read and write on it. To make boards per-user, add an `owner_id uuid` column
  and swap the policies for `auth.uid() = owner_id` — the SQL notes where.
- **Last write wins.** Two people drawing at once will clobber each other, because
  each saves the full document. Concurrent editing would need Realtime plus either
  per-stroke rows or CRDT-style merging.

## Deploying to Netlify

`netlify.toml` already sets the build command, publish directory, Node version,
an SPA fallback redirect, and long-lived caching for hashed assets. No dashboard
configuration is needed.

**Continuous deploys from Git** (recommended) — push the repo to GitHub/GitLab, then
in Netlify choose _Add new site → Import an existing project_ and pick it. Netlify
reads `netlify.toml`, so accept the detected settings.

**One-off deploy from your machine:**

```bash
npm i -g netlify-cli
netlify deploy --build            # draft URL
netlify deploy --build --prod     # production
```

## Architecture

```
src/
  main.tsx                  React entry
  App.tsx                   Canvas layers + toolbar
  index.css                 Tailwind theme tokens and custom utilities
  env.d.ts                  Typed VITE_* environment variables
  lib/
    supabase.ts             Client (null when unconfigured) and board id
  whiteboard/
    types.ts                Tool, Stroke, Viewport, Point
    constants.ts            Palette, sizes, zoom/grid limits, autosave timing
    render.ts               Pure canvas painting + coordinate transforms
    simplify.ts             Douglas-Peucker + rounding, applied on stroke commit
    persistence.ts          Board load/save queries and row parsing
    useBoardSync.ts         Initial load + debounced autosave
    useWhiteboard.ts        Input handling, view and history state
  components/
    Toolbar.tsx  ColorPicker.tsx  SizePicker.tsx  ClearButton.tsx
    ToolbarButton.tsx  BrushCursor.tsx  Hint.tsx  SaveIndicator.tsx  icons.tsx
supabase/
  migrations/0001_boards.sql  Table, RLS policies, seed row
```

Two stacked canvases: a dot grid underneath and an ink layer above, so the eraser
can composite with `destination-out` and reveal the grid rather than painting over it.

Board state (viewport, strokes, in-flight pointers) lives in a mutable ref inside
`useWhiteboard`, not in React state. It changes on every `pointermove`, and
re-rendering the tree at that rate would drop frames. Only values the UI actually
displays — selected tool, colour, size, zoom percentage, undo/redo availability —
are React state. The brush cursor is likewise positioned by writing directly to its
DOM node.

Strokes store points in **world space**, so they stay put under pan and zoom; screen
coordinates are derived at paint time. An in-progress stroke is drawn incrementally
segment by segment, while committed strokes are repainted as single polylines on
view changes. Committing a stroke repaints it immediately, both because compaction
has just replaced its points and so that what is on screen matches what gets stored;
the live and redrawn forms used to differ by a few antialiased pixels along the joins.
