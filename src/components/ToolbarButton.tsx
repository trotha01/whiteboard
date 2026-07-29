export const TOOLBAR_BUTTON_CLASS = [
  'flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-[11px]',
  'text-ink transition-[background-color,color,transform] duration-150',
  'hover:bg-black/[0.06] active:scale-[0.92]',
  'disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:active:scale-100',
  'max-[520px]:h-8 max-[520px]:w-8 max-[520px]:rounded-[9px]',
].join(' ');

interface ToolbarButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  /**
   * Marks the button as a toggle and applies the accent tint when on. Omit for
   * plain actions so they are not announced as pressable toggles.
   */
  active?: boolean;
}

export function ToolbarButton({ active, className, ...props }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`${TOOLBAR_BUTTON_CLASS}${active ? ' tint-active' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
