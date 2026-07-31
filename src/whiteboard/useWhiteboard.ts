import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COLORS,
  DEFAULT_SIZE_INDEX,
  ERASER_CURSOR_BORDER,
  ERASER_CURSOR_FILL,
  ERASER_SIZES,
  MAX_SCALE,
  MIN_BRUSH_CURSOR_PX,
  MIN_POINT_DISTANCE_PX,
  MIN_SCALE,
  PEN_CURSOR_FILL,
  PEN_SIZES,
  WHEEL_ZOOM_SENSITIVITY,
  ZOOM_STEP,
} from './constants';
import type { SaveStatus } from './persistence';
import { clamp, compositeFor, drawGrid, paintPath, redrawInk, screenToWorld } from './render';
import { compactStroke } from './simplify';
import type { Point, ScreenPoint, SizeIndex, Stroke, Tool, Viewport } from './types';
import { useBoardSync } from './useBoardSync';

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
  undone: Stroke[];
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
  brushCursorRef: React.RefObject<HTMLDivElement | null>;
  toolbarRef: React.RefObject<HTMLDivElement | null>;
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
  const brushCursorRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine>(createEngine());

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
    const { strokes, undone } = engineRef.current;
    setCanUndo(strokes.length > 0);
    setCanRedo(undone.length > 0);
    setHasDrawn(strokes.length > 0);
  }, []);

  const getStrokes = useCallback(() => engineRef.current.strokes, []);

  /**
   * Strokes restored from the database go underneath anything drawn while the
   * load was still in flight, matching the order they were committed in.
   *
   * Rows written before strokes were compacted on commit still hold raw pointer
   * samples, so fold them down here at 100% zoom; the next save then shrinks the
   * stored document instead of preserving it forever.
   */
  const applyStrokes = useCallback(
    (restored: Stroke[]) => {
      const engine = engineRef.current;
      const compacted = restored.map((stroke) => compactStroke(stroke, 1));
      engine.strokes = [...compacted, ...engine.strokes];
      engine.undone = [];
      syncHistory();
      scheduleRedraw();
    },
    [scheduleRedraw, syncHistory],
  );

  const { status: saveStatus, markDirty } = useBoardSync({ getStrokes, applyStrokes });

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

  const undo = useCallback(() => {
    const engine = engineRef.current;
    const last = engine.strokes.pop();
    if (!last) return;
    engine.undone.push(last);
    syncHistory();
    scheduleRedraw();
    markDirty();
  }, [markDirty, scheduleRedraw, syncHistory]);

  const redo = useCallback(() => {
    const engine = engineRef.current;
    const restored = engine.undone.pop();
    if (!restored) return;
    engine.strokes.push(restored);
    syncHistory();
    scheduleRedraw();
    markDirty();
  }, [markDirty, scheduleRedraw, syncHistory]);

  const clear = useCallback(() => {
    const engine = engineRef.current;
    engine.strokes = [];
    engine.undone = [];
    syncHistory();
    scheduleRedraw();
    markDirty();
  }, [markDirty, scheduleRedraw, syncHistory]);

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
      engine.undone = [];
      syncHistory();
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
      const index = engine.strokes.indexOf(committed);
      if (index !== -1) engine.strokes[index] = compactStroke(committed, engine.view.scale);
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
        const overToolbar = Boolean(
          toolbarRef.current?.contains(document.elementFromPoint(e.clientX, e.clientY)),
        );
        const brushVisible =
          !engine.isPanning && toolRef.current !== 'pan' && !engine.spacePressed && !overToolbar;
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
      inkCanvas.removeEventListener('pointerdown', onPointerDown);
      inkCanvas.removeEventListener('contextmenu', onContextMenu);
      document.body.style.cursor = '';
    };
  }, [
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
    brushCursorRef,
    toolbarRef,
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
