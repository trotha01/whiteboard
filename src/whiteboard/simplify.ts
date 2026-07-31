import { COORD_SUBPIXEL_DIGITS, SIMPLIFY_TOLERANCE_PX } from './constants';
import { clamp } from './render';
import type { Point, Stroke } from './types';

/**
 * Squared distance from `point` to the infinite line through `a` and `b`.
 * Squared to keep the hot loop free of `Math.sqrt`; the caller compares against
 * a squared tolerance.
 */
function perpendicularDistanceSq(point: Point, a: Point, b: Point): number {
  const [px, py] = point;
  const [ax, ay] = a;
  const dx = b[0] - ax;
  const dy = b[1] - ay;
  const lengthSq = dx * dx + dy * dy;
  // A degenerate segment — a closed stroke, or a repeated sample — has no
  // direction to be perpendicular to, so fall back to the point distance.
  if (lengthSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const cross = (px - ax) * dy - (py - ay) * dx;
  return (cross * cross) / lengthSq;
}

/** A span of the path still to be examined, carrying its own endpoints. */
interface Segment {
  first: number;
  last: number;
  a: Point;
  b: Point;
}

/**
 * Ramer-Douglas-Peucker: drop points that sit within `epsilon` of the chord
 * their neighbours already describe. Pointer sampling is heavily redundant along
 * straight and gently curved runs, so this is where most of the size win comes
 * from. The endpoints are always kept.
 *
 * Iterative rather than recursive — the worklist costs nothing and a
 * pathological stroke cannot blow the call stack.
 */
export function simplifyPath(points: readonly Point[], epsilon: number): Point[] {
  const count = points.length;
  const start = points[0];
  const end = points[count - 1];
  if (count < 3 || !(epsilon > 0) || start === undefined || end === undefined) {
    return [...points];
  }

  const epsilonSq = epsilon * epsilon;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  const pending: Segment[] = [{ first: 0, last: count - 1, a: start, b: end }];

  while (pending.length > 0) {
    const segment = pending.pop();
    if (segment === undefined) break;
    const { first, last, a, b } = segment;

    let farthest = -1;
    let farthestSq = epsilonSq;

    for (let i = first + 1; i < last; i += 1) {
      const point = points[i];
      if (point === undefined) continue;
      const distanceSq = perpendicularDistanceSq(point, a, b);
      if (distanceSq > farthestSq) {
        farthestSq = distanceSq;
        farthest = i;
      }
    }

    // Every interior point is within tolerance, so the chord replaces them all.
    if (farthest === -1) continue;

    const pivot = points[farthest];
    if (pivot === undefined) continue;

    keep[farthest] = 1;
    pending.push({ first, last: farthest, a, b: pivot }, { first: farthest, last, a: pivot, b });
  }

  const kept: Point[] = [];
  for (const [i, point] of points.entries()) {
    if (keep[i]) kept.push(point);
  }
  return kept;
}

/**
 * `toFixed` rather than `Math.round(v * q) / q`: the latter reintroduces tails
 * like `12.030000000000001`, which is exactly the serialised length this is
 * meant to remove.
 */
export function quantizePoint([x, y]: Point, decimals: number): Point {
  return [Number(x.toFixed(decimals)), Number(y.toFixed(decimals))];
}

/**
 * Shrink a finished stroke for storage without changing how it looks.
 *
 * Both tolerances are expressed in *screen* pixels and converted to world space
 * through `scale`, so fidelity stays constant at whatever zoom the stroke was
 * drawn at. A fixed world-space tolerance would mangle strokes drawn zoomed in
 * and barely touch strokes drawn zoomed out.
 */
export function compactStroke(stroke: Stroke, scale: number): Stroke {
  const [origin] = stroke.points;
  if (origin === undefined) return stroke;

  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const decimals = clamp(Math.ceil(Math.log10(safeScale)) + COORD_SUBPIXEL_DIGITS, 0, 6);
  const simplified = simplifyPath(stroke.points, SIMPLIFY_TOLERANCE_PX / safeScale);

  const points: Point[] = [];
  for (const point of simplified) {
    const rounded = quantizePoint(point, decimals);
    const previous = points[points.length - 1];
    // Rounding can collapse neighbours onto each other, and a repeated point
    // paints nothing.
    if (previous && previous[0] === rounded[0] && previous[1] === rounded[1]) continue;
    points.push(rounded);
  }

  // A tap is one point and a legitimate mark. Never return an empty path:
  // `parseStroke` drops such a stroke, so the mark would vanish on next load.
  if (points.length === 0) points.push(quantizePoint(origin, decimals));

  return { ...stroke, points };
}
