import { SIZE_INDICES, SIZE_LABELS } from '../whiteboard/constants';
import type { SizeIndex } from '../whiteboard/types';

const SIZE_BUTTON_CLASS = [
  'flex h-9 w-[34px] flex-none cursor-pointer items-center justify-center rounded-[11px]',
  'transition-colors duration-150 hover:bg-black/[0.06]',
  'max-[520px]:h-8 max-[520px]:w-[30px]',
].join(' ');

/** Preview dot diameter in px — indicative rather than a true stroke preview. */
function dotSize(index: SizeIndex): number {
  return 6 + index * 5;
}

interface SizePickerProps {
  sizeIndex: SizeIndex;
  onSelect: (index: SizeIndex) => void;
}

export function SizePicker({ sizeIndex, onSelect }: SizePickerProps) {
  return (
    <div className="flex flex-none items-center gap-1" role="group" aria-label="Stroke size">
      {SIZE_INDICES.map((index) => {
        const isActive = index === sizeIndex;
        return (
          <button
            key={index}
            type="button"
            title={SIZE_LABELS[index]}
            aria-label={SIZE_LABELS[index]}
            aria-pressed={isActive}
            onClick={() => onSelect(index)}
            className={`${SIZE_BUTTON_CLASS}${isActive ? ' tint-active' : ''}`}
          >
            <i
              className="block rounded-full bg-[var(--active-color)]"
              style={{ width: dotSize(index), height: dotSize(index) }}
            />
          </button>
        );
      })}
    </div>
  );
}
