import { useCallback, useEffect, useRef, useState } from 'react';
import { CLEAR_CONFIRM_MS } from '../whiteboard/constants';
import { TrashIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';

interface ClearButtonProps {
  onClear: () => void;
}

/** Destructive, so the first click only arms the button; a second one within the window clears. */
export function ClearButton({ onClear }: ClearButtonProps) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setArmed(false);
  }, []);

  useEffect(() => disarm, [disarm]);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      timerRef.current = setTimeout(disarm, CLEAR_CONFIRM_MS);
      return;
    }
    disarm();
    onClear();
  };

  return (
    <ToolbarButton
      onClick={handleClick}
      title={armed ? 'Click again to clear the board' : 'Clear board'}
      aria-label={armed ? 'Confirm clear board' : 'Clear board'}
      className={armed ? 'tint-danger' : ''}
    >
      <TrashIcon />
    </ToolbarButton>
  );
}
