const HINTS = [
  'Draw anywhere',
  'Scroll to pan',
  'Ctrl/⌘ + scroll (or pinch) to zoom',
  'Hold Space to pan',
];

const HINT_CLASS = [
  'pointer-events-none fixed top-[14px] left-1/2 z-20 -translate-x-1/2',
  'flex items-center gap-2 whitespace-nowrap',
  'rounded-full border border-hairline bg-panel px-3.5 py-[7px]',
  'text-[12.5px] tracking-[0.01em] text-muted shadow-panel',
  'transition-[opacity,transform] duration-500',
].join(' ');

interface HintProps {
  /** Fades the hint out once the board has ink on it. */
  hidden: boolean;
}

export function Hint({ hidden }: HintProps) {
  return (
    <div className={`${HINT_CLASS}${hidden ? ' -translate-y-1.5 opacity-0' : ''}`}>
      {HINTS.map((text, index) => (
        <span key={text} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">·</span>}
          {text}
        </span>
      ))}
    </div>
  );
}
