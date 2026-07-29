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
