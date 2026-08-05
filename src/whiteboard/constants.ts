import type { SizeIndex } from './types';

export const COLORS = ['#2B2B2B', '#E14B43', '#E8A33D', '#2F9E5B', '#3B6FE0', '#8B5CF6'] as const;

export const PEN_SIZES = [3, 6, 11] as const;
export const ERASER_SIZES = [16, 28, 46] as const;
export const SIZE_LABELS = ['Thin', 'Medium', 'Thick'] as const;
export const SIZE_INDICES = [0, 1, 2] as const satisfies readonly SizeIndex[];
export const DEFAULT_SIZE_INDEX: SizeIndex = 1;

export const MIN_SCALE = 0.08;
export const MAX_SCALE = 8;
export const ZOOM_STEP = 1.25;
export const WHEEL_ZOOM_SENSITIVITY = 0.012;

export const BOARD_COLOR = '#FAFAFA';
export const DOT_COLOR = '#D6D6D6';
export const DOT_RADIUS = 1.4;

/** Dot pitch in world units, doubled/halved to stay inside the spacing bounds. */
export const GRID_BASE = 28;
export const GRID_MIN_SPACING = 18;
export const GRID_MAX_SPACING = 72;

export const MIN_BRUSH_CURSOR_PX = 6;
export const ERASER_CURSOR_BORDER = '#9A968C';
export const ERASER_CURSOR_FILL = 'rgba(154,150,140,0.10)';
export const PEN_CURSOR_FILL = 'rgba(0,0,0,0.05)';

/** How long the clear button stays armed waiting for a confirming second click. */
export const CLEAR_CONFIRM_MS = 2600;

/**
 * Asset library shown in the image drawer.
 *
 * Cross-origin, so its contents can never be read or scripted from here. What
 * bridges that is a `postMessage` contract it implements deliberately — see
 * `assetPicker.ts` — rather than anything scraped out of the frame.
 *
 * Overridable so `npm run dev` can point at a local copy of the library.
 */
export const ASSETS_URL = import.meta.env.VITE_ASSETS_URL ?? 'https://assets.simka.cat';

/** Every message from the drawer is checked against this before it is believed. */
export const ASSETS_ORIGIN = new URL(ASSETS_URL).origin;

/** Widest edge a dropped image is scaled to, in world units. The other edge follows
 *  the source's aspect ratio, so tall images stay tall. */
export const IMAGE_DROP_WIDTH = 320;

/** How long a rejected drop or pick stays on screen before it fades out. */
export const NOTICE_MS = 5000;

/** Sanity bound on stored dimensions; anything larger is a corrupt or hostile row. */
export const MAX_IMAGE_DIMENSION = 20000;

/** Give up on a dropped URL that has not decoded by now, rather than hanging the drop. */
export const IMAGE_LOAD_TIMEOUT_MS = 15000;

/** Quiet period after the last change before the board is written to Supabase. */
export const AUTOSAVE_DEBOUNCE_MS = 700;
export const SAVE_RETRY_MS = 4000;
export const SAVE_RETRY_ATTEMPTS = 3;

// How aggressively a finished stroke is compacted before it is stored. All three
// are in screen pixels at the zoom the stroke was drawn at, so they trade board
// size against fidelity in units you can actually see.

/** Pointer moves closer than this to the last sample add bytes but no ink. */
export const MIN_POINT_DISTANCE_PX = 1;
/** Douglas-Peucker tolerance; well under a pixel, so the path looks unchanged. */
export const SIMPLIFY_TOLERANCE_PX = 0.6;
/** Coordinate decimals at 100% zoom — 2 keeps 0.01px, versus ~17 raw digits. */
export const COORD_SUBPIXEL_DIGITS = 2;
