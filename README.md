# Whiteboard

An infinite-canvas whiteboard: pen and eraser, six colours, three stroke sizes,
undo/redo, pan and zoom (wheel, pinch, or keyboard). React + TypeScript + Tailwind,
built with Vite and deployed to Netlify.

Ported from the original single-file `whiteboard.html`, which is kept for reference.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
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
  whiteboard/
    types.ts                Tool, Stroke, Viewport, Point
    constants.ts            Palette, sizes, zoom and grid limits
    render.ts               Pure canvas painting + coordinate transforms
    useWhiteboard.ts        Input handling, view and history state
  components/
    Toolbar.tsx  ColorPicker.tsx  SizePicker.tsx  ClearButton.tsx
    ToolbarButton.tsx  BrushCursor.tsx  Hint.tsx  icons.tsx
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
view changes. That makes a redrawn stroke differ from the live one by a few
antialiased pixels along the joins — cosmetic, and inherited from the original.
