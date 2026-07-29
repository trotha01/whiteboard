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

/** World -> screen transform: `screen = world * scale + offset`. */
export interface Viewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Index into `PEN_SIZES` / `ERASER_SIZES`. */
export type SizeIndex = 0 | 1 | 2;
