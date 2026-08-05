const NOTICE_CLASS = [
  'pointer-events-none fixed bottom-[14px] left-1/2 z-30 -translate-x-1/2',
  'max-w-[min(90vw,420px)] text-center',
  'rounded-full border border-hairline bg-panel px-4 py-[7px]',
  'text-[12.5px] tracking-[0.01em] text-muted shadow-panel',
  'backdrop-blur-[16px] backdrop-saturate-150',
  'max-[520px]:bottom-2.5 max-[520px]:px-3 max-[520px]:text-xs',
].join(' ');

interface NoticeProps {
  /** Null hides it entirely; `useWhiteboard` clears it on a timer. */
  message: string | null;
}

/**
 * What the board declined to do, and why.
 *
 * Placing an image can fail for reasons the board can see but the person
 * cannot — a drag that carried no image, a URL that turns out not to be one,
 * an asset whose sharing changed. Every one of those used to end at a
 * `console.warn`, which from the outside is identical to nothing happening at
 * all. Bottom centre so it never sits under the drawer or the toolbar.
 */
export function Notice({ message }: NoticeProps) {
  if (!message) return null;

  return (
    <div className={NOTICE_CLASS} role="status" aria-live="polite">
      {message}
    </div>
  );
}
