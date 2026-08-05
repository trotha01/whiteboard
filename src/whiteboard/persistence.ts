import { BOARD_ID, supabase } from '../lib/supabase';
import { MAX_IMAGE_DIMENSION } from './constants';
import { isPlaceableSrc } from './images';
import type { BoardDocument, BoardImage, Point, Stroke } from './types';

/** What the toolbar shows about the board's relationship to the database. */
export type SaveStatus = 'offline' | 'loading' | 'saved' | 'saving' | 'error';

/** Rows are written whole, so an unrecognised shape means the whole row is stale. */
const BOARDS_TABLE = 'boards';

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * `jsonb` gives back whatever was last written, which may predate the current
 * `Stroke` shape or have been hand-edited in the dashboard. Drop anything the
 * renderer could not paint rather than letting it throw mid-frame.
 */
function parseStroke(value: unknown): Stroke | null {
  if (typeof value !== 'object' || value === null) return null;
  const { tool, color, width, points } = value as Record<string, unknown>;
  if (tool !== 'pen' && tool !== 'eraser') return null;
  if (typeof color !== 'string') return null;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
  if (!Array.isArray(points) || points.length === 0) return null;
  const parsed = points.filter(isPoint);
  if (parsed.length === 0) return null;
  return { tool, color, width, points: parsed };
}

export function parseStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseStroke).filter((stroke): stroke is Stroke => stroke !== null);
}

function isFiniteSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_IMAGE_DIMENSION;
}

/**
 * Same defensive contract as `parseStroke`, with one extra job: the board is
 * world-writable, so a stored `src` is untrusted input that ends up in an
 * `<img>`. `isPlaceableSrc` is the same gate a drop has to pass, applied again
 * here — never `javascript:`, and never a `blob:`/`data:` URL that would be
 * broken for every other viewer. Checked on the way in *and* on the way out,
 * because the row can be written by anybody, not only by this code.
 */
function parseImage(value: unknown): BoardImage | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, src, x, y, width, height } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id) return null;
  if (typeof src !== 'string' || !isPlaceableSrc(src)) return null;
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (typeof y !== 'number' || !Number.isFinite(y)) return null;
  if (!isFiniteSize(width) || !isFiniteSize(height)) return null;

  return { id, src, x, y, width, height };
}

export function parseImages(value: unknown): BoardImage[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseImage).filter((image): image is BoardImage => image !== null);
}

/**
 * Reads the saved board. Resolves to `null` when there is nothing to restore —
 * no database configured, or no row yet — so callers can start from blank.
 * Rejects on a genuine transport/permission failure, which must not be mistaken
 * for an empty board (saving over it would destroy the drawing).
 */
export async function loadBoard(): Promise<BoardDocument | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(BOARDS_TABLE)
    .select('strokes, images')
    .eq('id', BOARD_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { strokes: parseStrokes(data.strokes), images: parseImages(data.images) };
}

/** Upserts the whole board. Last write wins; see the README on concurrent edits. */
export async function saveBoard(document: BoardDocument): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.from(BOARDS_TABLE).upsert(
    {
      id: BOARD_ID,
      strokes: document.strokes,
      images: document.images,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) throw error;
}
