import { COLORS } from '../whiteboard/constants';

const SWATCH_CLASS = [
  'mx-0.5 h-[22px] w-[22px] flex-none cursor-pointer rounded-full',
  'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]',
  'transition-[transform,box-shadow] duration-150 hover:scale-110',
  'max-[520px]:h-[19px] max-[520px]:w-[19px]',
].join(' ');

const ACTIVE_SWATCH_CLASS = 'scale-[1.16] shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--sw-color)]';

interface ColorPickerProps {
  color: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ color, onSelect }: ColorPickerProps) {
  return (
    <div className="flex flex-none items-center gap-1" role="group" aria-label="Pen colour">
      {COLORS.map((swatch) => {
        const isActive = swatch === color;
        return (
          <button
            key={swatch}
            type="button"
            aria-label={`Pen colour ${swatch}`}
            aria-pressed={isActive}
            onClick={() => onSelect(swatch)}
            style={{ backgroundColor: swatch, '--sw-color': swatch } as React.CSSProperties}
            className={`${SWATCH_CLASS}${isActive ? ` ${ACTIVE_SWATCH_CLASS}` : ''}`}
          />
        );
      })}
    </div>
  );
}
