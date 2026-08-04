import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COLORS,
  DEFAULT_SIZE_INDEX,
  ERASER_CURSOR_BORDER,
  ERASER_CURSOR_FILL,
  ERASER_SIZES,
  IMAGE_DROP_WIDTH,
  MAX_SCALE,
  MIN_BRUSH_CURSOR_PX,
  MIN_POINT_DISTANCE_PX,
  MIN_SCALE,
  PEN_CURSOR_FILL,
  PEN_SIZES,
  WHEEL_ZOOM_SENSITIVITY,
  ZOOM_STEP,
} from './constants';
import { imageUrlFromDataTransfer, loadImageSize } from './images';
import type { SaveStatus } from './persistence';
import { clamp, compositeFor, drawGrid, paintPath, redrawInk, screenToWorld } from './render';
import { compactStroke } from './simplify';
import type {
  BoardDocument,
  BoardEdit,
  BoardImage,
  Point,
  ScreenPoint,
  SizeIndex,
  Stroke,
  Tool,
  Viewport,
} from './types';
import { useBoardSync } from './useBoardSync';

/**
 * Marks the floating UI surfaces — toolbar, image drawer. Used to keep the board
 * from treating a pointer that is over chrome as a pointer over the canvas.
 */
export const CHROME_SELECTOR = '[data-chrome]';

interface PanStart {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

interface PinchStart {
  dist: number;
  mid: ScreenPoint;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Mutable, render-agnostic board state. Kept off React state on purpose: this is
 * touched on every pointermove and re-rendering the tree that often would drop frames.
 */
interface Engine {
  view: Viewport;
  strokes: Stroke[];
  images: BoardImage[];
  /**
   * Every committed change in the order it was made. `strokes` and `images` are
   * what gets rendered; this is what undo walks backwards, so a stroke drawn
   * after an image is dropped unwinds before that image does.
   */
  done: BoardEdit[];
  undone: BoardEdit[];
  current: Stroke | null;
  lastScreen: Point | null;
  isPanning: boolean;
  panStart: PanStart | null;
  spacePressed: boolean;
  pointers: Map<number, ScreenPoint>;
  pinchStart: PinchStart | null;
  rafScheduled: boolean;
  width: number;
  height: number;
}

function createEngine(): Engine {
  return {
    view: { scale: 1, offsetX: 0, offsetY: 0 },
    strokes: [],
    images: [],
    done: [],
    undone: [],
    current: null,
    lastScreen: null,
    isPanning: false,
    panStart: null,
    spacePressed: false,
    pointers: new Map(),
    pinchStart: null,
    rafScheduled: false,
    width: 0,
    height: 0,
  };
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: ScreenPoint, b: ScreenPoint): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export interface WhiteboardApi {
  dotCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  inkCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Wrapper the viewport transform is written to; holds one `<img>` per image. */
  imageLayerRef: React.RefObject<HTMLDivElement | null>;
  brushCursorRef: React.RefObject<HTMLDivElement | null>;
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  /** Placed images, mirrored into React state so the layer can render them. */
  images: readonly BoardImage[];
  tool: Tool;
  setTool: (tool: Tool) => void;
  color: string;
  setColor: (color: string) => void;
  sizeIndex: SizeIndex;
  setSizeIndex: (index: SizeIndex) => void;
  zoomPercent: number;
  canUndo: boolean;
  canRedo: boolean;
  hasDrawn: boolean;
  saveStatus: SaveStatus;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

export function useWhiteboard(): WhiteboardApi {
  const dotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageLayerRef = useRef<HTMLDivElement | null>(null);
  const brushCursorRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine>(createEngine());

  const [images, setImages] = useState<readonly BoardImage[]>([]);
  const [tool, setToolState] = useState<Tool>('pen');
  const [color, setColorState] = useState<string>(COLORS[0]);
  const [sizeIndex, setSizeIndexState] = useState<SizeIndex>(DEFAULT_SIZE_INDEX);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Native listeners are attached once, so they read the live values through refs
  // rather than closing over a stale render's props.
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(sizeIndex);

  const strokeWidth = useCallback(
    () => (toolRef.current === 'eraser' ? ERASER_SIZES : PEN_SIZES)[sizeRef.current],
    [],
  );

  const contexts = useCallback(() => {
    const dot = dotCanvasRef.current?.getContext('2d');
    const ink = inkCanvasRef.current?.getContext('2d');
    return dot && ink ? { dot, ink } : null;
  }, []);

  const scheduleRedraw = useCallback(() => {
    const engine = engineRef.current;
    if (engine.rafScheduled) return;
    engine.rafScheduled = true;
    requestAnimationFrame(() => {
      engine.rafScheduled = false;

      // The image layer is DOM, so it rides the same transform the canvases bake
      // into their drawing instead of repositioning each `<img>` individually.
      // Written here rather than through React: `view` changes every pointermove.
      const layer = imageLayerRef.current;
      if (layer) {
        const { offsetX, offsetY, scale } = engine.view;
        layer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
      }

      const ctx = contexts();
      if (!ctx) return;
      drawGrid(ctx.dot, engine.view, engine.width, engine.height);
      redrawInk(ctx.ink, engine.strokes, engine.view, engine.width, engine.height);
      setZoomPercent(Math.round(engine.view.scale * 100));
    });
  }, [contexts]);

  /** Size the backing stores to the device pixel ratio so ink stays crisp. */
  const resize = useCallback(() => {
    const engine = engineRef.current;
    engine.width = window.innerWidth;
    engine.height = window.innerHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    for (const canvas of [dotCanvasRef.current, inkCanvasRef.current]) {
      if (!canvas) continue;
      canvas.width = Math.round(engine.width * dpr);
      canvas.height = Math.round(engine.height * dpr);
      canvas.style.width = `${engine.width}px`;
      canvas.style.height = `${engine.height}px`;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    scheduleRedraw();
  }, [scheduleRedraw]);

  const syncHistory = useCallback(() => {
    const { done, undone, images } = engineRef.current;
    setCanUndo(done.length > 0);
    setCanRedo(undone.length > 0);
    setHasDrawn(done.length > 0);
    // A new array identity each time is what tells React the layer changed; the
    // engine mutates `images` in place.
    setImages([...images]);
  }, []);

  const getDocument = useCallback(
    (): BoardDocument => ({
      strokes: engineRef.current.strokes,
      images: engineRef.current.images,
    }),
    [],
  );

  /**
   * Content restored from the database goes underneath anything added while the
   * load was still in flight, matching the order it was committed in.
   *
   * Rows written before strokes were compacted on commit still hold raw pointer
   * samples, so fold them down here at 100% zoom; the next save then shrinks the
   * stored document instead of preserving it forever.
   */
  const applyDocument = useCallback(
    (restored: BoardDocument) => {
      const engine = engineRef.current;
      const compacted = restored.strokes.map((stroke) => compactStroke(stroke, 1));
      engine.strokes = [...compacted, ...engine.strokes];
      engine.images = [...restored.images, ...engine.images];

      // Restored content stays undoable, as it was before images existed. The
      // relative order of the two lists is not recorded in the document, so
      // images are seeded first — undo then peels off strokes before images.
      const restoredEdits: BoardEdit[] = [
        ...restored.images.map((image): BoardEdit => ({ kind: 'image', image })),
        ...compacted.map((stroke): BoardEdit => ({ kind: 'stroke', stroke })),
      ];
      engine.done = [...restoredEdits, ...engine.done];
      engine.undone = [];

      syncHistory();
      scheduleRedraw();
    },
    [scheduleRedraw, syncHistory],
  );

  const { status: saveStatus, markDirty } = useBoardSync({ getDocument, applyDocument });

  const updateCursor = useCallback(() => {
    const engine = engineRef.current;
    const panMode = toolRef.current === 'pan' || engine.spacePressed || engine.isPanning;
    document.body.style.cursor = panMode ? (engine.isPanning ? 'grabbing' : 'grab') : 'none';
  }, []);

  const setTool = useCallback(
    (next: Tool) => {
      toolRef.current = next;
      setToolState(next);
      updateCursor();
    },
    [updateCursor],
  );

  const setColor = useCallback(
    (next: string) => {
      colorRef.current = next;
      setColorState(next);
      document.documentElement.style.setProperty('--active-color', next);
      // Picking a colour implies you want to draw with it.
      if (toolRef.current === 'eraser') setTool('pen');
    },
    [setTool],
  );

  const setSizeIndex = useCallback((next: SizeIndex) => {
    sizeRef.current = next;
    setSizeIndexState(next);
  }, []);

  /** Records a committed change so it can be undone, and drops the redo branch. */
  const commit = useCallback(
    (edit: BoardEdit) => {
      const engine = engineRef.current;
      engine.done.push(edit);
      engine.undone = [];
      syncHistory();
    },
    [syncHistory],
  );

  const undo = useCallback(() => {
    const engine = engineRef.current;
    const last = engine.done.pop();
    if (!last) return;

    // Every edit is an append, so a stroke is always the last one drawn; an
    // image needs removing by identity because later strokes do not displace it.
    if (last.kind === 'stroke') engine.strokes.pop();
    else engine.images = engine.images.filter((image) => image.id !== last.image.id);

    engine.undone.push(last);
    syncHistory();
    scheduleRedraw();
    markDirty();
  }, [markDirty, scheduleRedraw, syncHistory]);

  const redo = useCallback(() => {
    const engine = engineRef.current;
    const restored = engine.undone.pop();
    if (!restored) return;

    if (restored.kind === 'stroke') engine.strokes.push(restored.stroke);
    else engine.images = [...engine.images, restored.image];

    engine.done.push(restored);
    syncHistory();
    scheduleRedraw();
    markDirty();
  }, [markDirty, scheduleRedraw, syncHistory]);

  const clear = useCallback(() => {
    const engine = engineRef.current;
    engine.strokes = [];
    engine.images = [];
    engine.done = [];
    engine.undone = [];
    syncHistory();
    scheduleRedraw();
    markDirty();
  }, [markDirty, scheduleRedraw, syncHistory]);

  /**
   * Places a dropped image centred on the pointer. The source is decoded first
   * so the image is committed at its true aspect ratio rather than appearing at
   * a guessed shape and reflowing a moment later — and so a drag that turned out
   * not to be an image at all is rejected before it reaches the board.
   */
  const addImage = useCallback(
    async (src: string, clientX: number, clientY: number) => {
      const engine = engineRef.current;

      let natural: { width: number; height: number };
      try {
        natural = await loadImageSize(src);
      } catch (error) {
        console.warn('[whiteboard] ignored dropped image', error);
        return;
      }

      // Sized in screen pixels and converted to world units, so a drop lands at
      // the same apparent size whatever the board is zoomed to.
      const width = IMAGE_DROP_WIDTH / engine.view.scale;
      const height = width * (natural.height / natural.width);
      const [worldX, worldY] = screenToWorld(clientX, clientY, engine.view);

      engine.images = [
        ...engine.images,
        {
          id: crypto.randomUUID(),
          src,
          x: worldX - width / 2,
          y: worldY - height / 2,
          width,
          height,
        },
      ];

      const placed = engine.images[engine.images.length - 1];
      if (placed) commit({ kind: 'image', image: placed });
      markDirty();
    },
    [commit, markDirty],
  );

  /** Zoom about a screen anchor, keeping the world point under it fixed. */
  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const { view } = engineRef.current;
      const nextScale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
      const applied = nextScale / view.scale;
      view.offsetX = cx - (cx - view.offsetX) * applied;
      view.offsetY = cy - (cy - view.offsetY) * applied;
      view.scale = nextScale;
      scheduleRedraw();
    },
    [scheduleRedraw],
  );

  const zoomIn = useCallback(() => {
    const engine = engineRef.current;
    zoomAt(engine.width / 2, engine.height / 2, ZOOM_STEP);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    const engine = engineRef.current;
    zoomAt(engine.width / 2, engine.height / 2, 1 / ZOOM_STEP);
  }, [zoomAt]);

  const resetView = useCallback(() => {
    const engine = engineRef.current;
    engine.view = { scale: 1, offsetX: engine.width / 2, offsetY: engine.height / 2 };
    scheduleRedraw();
  }, [scheduleRedraw]);

  const showBrushCursor = useCallback(
    (clientX: number, clientY: number) => {
      const el = brushCursorRef.current;
      if (!el) return;
      const isEraser = toolRef.current === 'eraser';
      const size = Math.max(strokeWidth() * engineRef.current.view.scale, MIN_BRUSH_CURSOR_PX);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${clientX}px`;
      el.style.top = `${clientY}px`;
      el.style.borderColor = isEraser ? ERASER_CURSOR_BORDER : colorRef.current;
      el.style.backgroundColor = isEraser ? ERASER_CURSOR_FILL : PEN_CURSOR_FILL;
      el.style.display = 'block';
    },
    [strokeWidth],
  );

  const hideBrushCursor = useCallback(() => {
    const el = brushCursorRef.current;
    if (el) el.style.display = 'none';
  }, []);

  useEffect(() => {
    const inkCanvas = inkCanvasRef.current;
    if (!inkCanvas) return;

    const engine = engineRef.current;
    const inkCtx = inkCanvas.getContext('2d');

    /** Draw the in-progress stroke incrementally; a full redraw per move is too slow. */
    const paintSegment = (points: readonly Point[]) => {
      const stroke = engine.current;
      if (!inkCtx || !stroke) return;
      paintPath(
        inkCtx,
        points,
        stroke.width * engine.view.scale,
        stroke.color,
        compositeFor(stroke.tool),
      );
    };

    const startStroke = (clientX: number, clientY: number) => {
      const isEraser = toolRef.current === 'eraser';
      engine.current = {
        tool: isEraser ? 'eraser' : 'pen',
        // Erased pixels are removed, not tinted, so the colour is irrelevant.
        color: isEraser ? '#000' : colorRef.current,
        width: strokeWidth(),
        points: [screenToWorld(clientX, clientY, engine.view)],
      };
      engine.strokes.push(engine.current);
      commit({ kind: 'stroke', stroke: engine.current });
      paintSegment([[clientX, clientY]]);
      engine.lastScreen = [clientX, clientY];
    };

    const extendStroke = (clientX: number, clientY: number) => {
      if (!engine.current || !engine.lastScreen) return;
      // A sub-pixel move stores a point that paints nothing. Leave `lastScreen`
      // alone when rejecting one, so a slow drag still accumulates toward the
      // next accepted sample instead of dropping points indefinitely.
      const [lastX, lastY] = engine.lastScreen;
      if (Math.hypot(clientX - lastX, clientY - lastY) < MIN_POINT_DISTANCE_PX) return;
      engine.current.points.push(screenToWorld(clientX, clientY, engine.view));
      paintSegment([engine.lastScreen, [clientX, clientY]]);
      engine.lastScreen = [clientX, clientY];
    };

    const endStroke = () => {
      // The stroke was pushed onto `strokes` at the start, so finishing one —
      // even an abandoned pinch — is a committed change worth persisting.
      const committed = engine.current;
      engine.current = null;
      engine.lastScreen = null;
      if (!committed) return;

      // Compact once, here: undo, redo and every later save then inherit the
      // smaller path for free. The live stroke was painted segment by segment
      // from the raw samples, so repaint to put on screen exactly what will be
      // stored — `scheduleRedraw` coalesces it into a single frame.
      const compacted = compactStroke(committed, engine.view.scale);
      const index = engine.strokes.indexOf(committed);
      if (index !== -1) engine.strokes[index] = compacted;

      // The edit log holds the pre-compaction object it was given at stroke
      // start; repoint it, or redo would restore the uncompacted path. Searched
      // from the end rather than assumed last: an image drop resolves
      // asynchronously and may have landed mid-stroke.
      for (let i = engine.done.length - 1; i >= 0; i -= 1) {
        const edit = engine.done[i];
        if (edit?.kind === 'stroke' && edit.stroke === committed) {
          edit.stroke = compacted;
          break;
        }
      }

      scheduleRedraw();

      markDirty();
    };

    const onResize = () => resize();

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY));
      } else {
        engine.view.offsetX -= e.deltaX;
        engine.view.offsetY -= e.deltaY;
        scheduleRedraw();
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onPointerDown = (e: PointerEvent) => {
      inkCanvas.setPointerCapture(e.pointerId);
      engine.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Second finger down: abandon any stroke and switch to pinch zoom.
      if (engine.pointers.size >= 2) {
        endStroke();
        engine.isPanning = false;
        const [a, b] = [...engine.pointers.values()];
        if (a && b) {
          engine.pinchStart = {
            dist: distance(a, b),
            mid: midpoint(a, b),
            scale: engine.view.scale,
            offsetX: engine.view.offsetX,
            offsetY: engine.view.offsetY,
          };
        }
        return;
      }

      if (e.button === 2) return;

      // Middle-drag pans regardless of the selected tool.
      if (toolRef.current === 'pan' || engine.spacePressed || e.button === 1) {
        engine.isPanning = true;
        engine.panStart = {
          x: e.clientX,
          y: e.clientY,
          offsetX: engine.view.offsetX,
          offsetY: engine.view.offsetY,
        };
        updateCursor();
        hideBrushCursor();
        return;
      }

      startStroke(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (engine.pointers.has(e.pointerId)) {
        engine.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      const pinch = engine.pinchStart;
      if (engine.pointers.size >= 2 && pinch) {
        const [a, b] = [...engine.pointers.values()];
        if (!a || !b) return;
        const mid = midpoint(a, b);
        const factor = distance(a, b) / (pinch.dist || 1);
        const nextScale = clamp(pinch.scale * factor, MIN_SCALE, MAX_SCALE);
        const applied = nextScale / pinch.scale;
        // Zoom about the original midpoint, then follow that midpoint as it drifts.
        engine.view.offsetX =
          pinch.mid.x - (pinch.mid.x - pinch.offsetX) * applied + (mid.x - pinch.mid.x);
        engine.view.offsetY =
          pinch.mid.y - (pinch.mid.y - pinch.offsetY) * applied + (mid.y - pinch.mid.y);
        engine.view.scale = nextScale;
        scheduleRedraw();
        return;
      }

      if (engine.isPanning && engine.panStart) {
        engine.view.offsetX = engine.panStart.offsetX + (e.clientX - engine.panStart.x);
        engine.view.offsetY = engine.panStart.offsetY + (e.clientY - engine.panStart.y);
        scheduleRedraw();
        return;
      }

      if (engine.current) extendStroke(e.clientX, e.clientY);

      if (e.pointerType !== 'touch') {
        const overChrome = Boolean(
          document.elementFromPoint(e.clientX, e.clientY)?.closest(CHROME_SELECTOR),
        );
        const brushVisible =
          !engine.isPanning && toolRef.current !== 'pan' && !engine.spacePressed && !overChrome;
        if (brushVisible) showBrushCursor(e.clientX, e.clientY);
        else hideBrushCursor();
      }
    };

    const onPointerRelease = (e: PointerEvent) => {
      engine.pointers.delete(e.pointerId);
      if (engine.pointers.size < 2) engine.pinchStart = null;
      if (engine.pointers.size === 0) {
        if (engine.isPanning) {
          engine.isPanning = false;
          engine.panStart = null;
          updateCursor();
        }
        endStroke();
      }
    };

    const onPointerLeave = (e: PointerEvent) => {
      if (e.target === document.documentElement) hideBrushCursor();
    };

    /** A drop is only offered on the board itself, never over the drawer. */
    const overChrome = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest(CHROME_SELECTOR) !== null;

    // Without preventDefault here the browser refuses the drop entirely and
    // navigates to the dragged URL instead.
    const onDragOver = (e: DragEvent) => {
      if (overChrome(e.target)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDrop = (e: DragEvent) => {
      if (overChrome(e.target) || !e.dataTransfer) return;
      e.preventDefault();
      const src = imageUrlFromDataTransfer(e.dataTransfer);
      // Not an image drag — text, a file from the desktop, a plain link. Leaving
      // it alone is better than putting something broken on a shared board.
      if (!src) return;
      void addImage(src, e.clientX, e.clientY);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !engine.spacePressed) {
        engine.spacePressed = true;
        updateCursor();
        hideBrushCursor();
        e.preventDefault();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (e.ctrlKey || e.metaKey) return;

      switch (e.key) {
        case 'p':
          setTool('pen');
          break;
        case 'e':
          setTool('eraser');
          break;
        case '+':
        case '=':
          zoomIn();
          break;
        case '-':
        case '_':
          zoomOut();
          break;
        case '0':
          resetView();
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      engine.spacePressed = false;
      updateCursor();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerRelease);
    window.addEventListener('pointercancel', onPointerRelease);
    window.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    inkCanvas.addEventListener('pointerdown', onPointerDown);
    inkCanvas.addEventListener('contextmenu', onContextMenu);

    resize();
    // Start with the world origin centred so there is room to pan in any direction.
    engine.view.offsetX = engine.width / 2;
    engine.view.offsetY = engine.height / 2;
    document.documentElement.style.setProperty('--active-color', colorRef.current);
    updateCursor();
    syncHistory();
    scheduleRedraw();

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      inkCanvas.removeEventListener('pointerdown', onPointerDown);
      inkCanvas.removeEventListener('contextmenu', onContextMenu);
      document.body.style.cursor = '';
    };
  }, [
    addImage,
    commit,
    hideBrushCursor,
    markDirty,
    redo,
    resetView,
    resize,
    scheduleRedraw,
    setTool,
    showBrushCursor,
    strokeWidth,
    syncHistory,
    undo,
    updateCursor,
    zoomAt,
    zoomIn,
    zoomOut,
  ]);

  return {
    dotCanvasRef,
    inkCanvasRef,
    imageLayerRef,
    brushCursorRef,
    toolbarRef,
    images,
    tool,
    setTool,
    color,
    setColor,
    sizeIndex,
    setSizeIndex,
    zoomPercent,
    canUndo,
    canRedo,
    hasDrawn,
    saveStatus,
    undo,
    redo,
    clear,
    zoomIn,
    zoomOut,
    resetView,
  };
}
