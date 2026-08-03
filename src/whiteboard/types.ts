/** Every mode the toolbar can put the board into. */
export type Tool = 'pen' | 'eraser' | 'pan';

/** The subset of tools that actually commit marks to the ink layer. */
export type DrawingTool = Exclude<Tool, 'pan'>;

/** `[x, y]`, in either world or screen space depending on context. */
export type Point = [x: number, y: number];

export interface ScreenPoint {
  x: number;
  y: number;
}

/** A committed mark. Points are stored in world space so they survive pan/zoom. */
export interface Stroke {
  tool: DrawingTool;
  color: string;
  /** World-space width; multiply by `Viewport.scale` to paint. */
  width: number;
  points: Point[];
}

/**
 * An image placed on the board. Rendered as a real `<img>` on its own DOM layer
 * rather than painted into the ink canvas: the source is cross-origin (which
 * would taint the canvas) and the eraser composites with `destination-out`,
 * which would rub out anything drawn there.
 */
export interface BoardImage {
  /** Stable identity so undo can pull one back out of the middle of the list. */
  id: string;
  /** Absolute `https:` URL. Never a `blob:`/`data:` URL — those outlive nothing. */
  src: string;
  /** World-space top-left corner. */
  x: number;
  y: number;
  /** World-space size, already scaled to the source's aspect ratio. */
  width: number;
  height: number;
}

/**
 * One undoable change. Strokes and images live in separate arrays because they
 * render on different layers, so the interleaved order the user actually made
 * them in is recorded here instead of being implied by a single list.
 */
export type BoardEdit =
  | { kind: 'stroke'; stroke: Stroke }
  | { kind: 'image'; image: BoardImage };

/** The whole persisted board. */
export interface BoardDocument {
  strokes: Stroke[];
  images: BoardImage[];
}

/** World -> screen transform: `screen = world * scale + offset`. */
export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Index into `PEN_SIZES` / `ERASER_SIZES`. */
export type SizeIndex = 0 | 1 | 2;
