import {
  BOARD_COLOR,
  DOT_COLOR,
  DOT_RADIUS,
  GRID_BASE,
  GRID_MAX_SPACING,
  GRID_MIN_SPACING,
} from './constants';
import type { DrawingTool, Point, Stroke, Viewport } from './types';

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function worldToScreen([x, y]: Point, view: Viewport): Point {
  return [x * view.scale + view.offsetX, y * view.scale + view.offsetY];
}

export function screenToWorld(clientX: number, clientY: number, view: Viewport): Point {
  return [(clientX - view.offsetX) / view.scale, (clientY - view.offsetY) / view.scale];
}

/** Erasing punches holes in the ink layer so the dot grid below shows through. */
export function compositeFor(tool: DrawingTool): GlobalCompositeOperation {
  return tool === 'eraser' ? 'destination-out' : 'source-over';
}

/** Pick a world-space dot pitch whose on-screen spacing stays legible at any zoom. */
function gridPitch(scale: number): number {
  let pitch = GRID_BASE;
  while (pitch * scale < GRID_MIN_SPACING) pitch *= 2;
  while (pitch * scale > GRID_MAX_SPACING) pitch /= 2;
  return pitch;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: Viewport,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, width, height);

  const pitch = gridPitch(view.scale);
  const [worldLeft, worldTop] = screenToWorld(0, 0, view);
  const [worldRight, worldBottom] = screenToWorld(width, height, view);
  const startX = Math.floor(worldLeft / pitch) * pitch;
  const startY = Math.floor(worldTop / pitch) * pitch;

  ctx.fillStyle = DOT_COLOR;
  for (let x = startX; x <= worldRight; x += pitch) {
    const sx = x * view.scale + view.offsetX;
    for (let y = startY; y <= worldBottom; y += pitch) {
      const sy = y * view.scale + view.offsetY;
      ctx.beginPath();
      ctx.arc(sx, sy, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Paints screen-space points; a lone point becomes a dot so taps leave a mark. */
export function paintPath(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  widthPx: number,
  color: string,
  composite: GlobalCompositeOperation,
): void {
  const [first, ...rest] = points;
  if (!first) return;

  ctx.save();
  ctx.globalCompositeOperation = composite;

  if (rest.length === 0) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(first[0], first[1], widthPx / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of rest) ctx.lineTo(x, y);
    ctx.stroke();
  }

  ctx.restore();
}

export function redrawInk(
  ctx: CanvasRenderingContext2D,
  strokes: readonly Stroke[],
  view: Viewport,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    const points = stroke.points.map((point) => worldToScreen(point, view));
    paintPath(ctx, points, stroke.width * view.scale, stroke.color, compositeFor(stroke.tool));
  }
}
