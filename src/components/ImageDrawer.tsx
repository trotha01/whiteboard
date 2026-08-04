import { useEffect } from 'react';
import { ASSETS_URL } from '../whiteboard/constants';
import { CloseIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';

// The width here is mirrored by `TOOLBAR_SHIFTED_CLASS` in Toolbar.tsx; change both.
const DRAWER_CLASS = [
  'fixed top-0 left-0 z-20 flex h-full w-[380px] flex-col',
  'border-r border-hairline bg-panel shadow-panel',
  'backdrop-blur-[16px] backdrop-saturate-150',
  // The board hides the system cursor to draw its own brush; chrome needs it back.
  '[cursor:auto]',
  'transition-[opacity,transform] duration-300',
  'max-[520px]:w-full',
].join(' ');

const CLOSED_CLASS = 'pointer-events-none -translate-x-full opacity-0';

interface ImageDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Side panel embedding the asset library. Drag an image out of it and onto the
 * board to place it.
 *
 * The iframe is cross-origin, so this component cannot see or script its
 * contents — placing an image relies on the browser's own drag payload, which
 * `useWhiteboard`'s drop handler reads. That also means the panel stays mounted
 * when closed: unmounting would tear the iframe down and pay for a full reload
 * of the site every time the drawer is reopened.
 *
 * Deliberately no backdrop. The whole point is to drag *out* of the drawer, so
 * the board behind it has to stay live and droppable while it is open.
 */
export function ImageDrawer({ open, onClose }: ImageDrawerProps) {
  // Escape closes the drawer. Only while it is open, so this never competes with
  // anything else for the key. Note that a keypress made while focus is inside
  // the iframe belongs to that document and never reaches us — closing then
  // means clicking the button, which is why it carries the shortcut in its title.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <aside
      data-chrome
      className={`${DRAWER_CLASS}${open ? '' : ` ${CLOSED_CLASS}`}`}
      aria-label="Image library"
      aria-hidden={!open}
      // Keep presses on the drawer from reaching the canvas beneath it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="flex flex-none items-center justify-between border-b border-hairline px-3 py-2">
        <h2 className="text-[12.5px] tracking-[0.01em] text-muted">Drag an image onto the board</h2>
        <ToolbarButton title="Close images (Esc)" aria-label="Close images" onClick={onClose}>
          <CloseIcon />
        </ToolbarButton>
      </header>

      <iframe
        src={ASSETS_URL}
        title="Image library"
        className="h-full w-full flex-1 border-0"
        referrerPolicy="no-referrer"
        // `allow-same-origin` is what lets the site load its own assets and run
        // normally; it grants nothing over this page, which is a separate origin.
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        // Nothing is shown until the drawer is first opened, so defer the load.
        loading="lazy"
      />
    </aside>
  );
}
