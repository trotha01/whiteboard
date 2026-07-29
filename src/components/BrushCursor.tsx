const BRUSH_CURSOR_CLASS = [
  'pointer-events-none fixed top-0 left-0 z-[6] hidden',
  '-translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px]',
].join(' ');

interface BrushCursorProps {
  ref: React.RefObject<HTMLDivElement | null>;
}

/**
 * Size, position and colour are written straight to the DOM node by the engine on
 * every pointermove; going through React state here would re-render the whole tree.
 */
export function BrushCursor({ ref }: BrushCursorProps) {
  return <div ref={ref} className={BRUSH_CURSOR_CLASS} aria-hidden="true" />;
}
