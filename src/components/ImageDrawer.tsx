import { useEffect, useMemo } from 'react';
import { assetLibraryUrl } from '../whiteboard/assetPicker';
import { CloseIcon, ExternalWindowIcon } from './icons';
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
 * Side panel holding the asset library. Click a photo to place it on the board;
 * dragging one across also works.
 *
 * The iframe is cross-origin, so this component cannot see or script its
 * contents. What crosses the boundary is a `postMessage` the library sends
 * deliberately — `useWhiteboard` listens for it, and `assetPicker.ts` is the
 * contract. Nothing here reads the frame.
 *
 * The panel stays mounted when closed: unmounting would tear the iframe down
 * and pay for a full reload of the library every time it reopened.
 *
 * Deliberately no backdrop. Dragging *out* of the drawer has to keep working,
 * so the board behind it stays live and droppable while it is open.
 */
export function ImageDrawer({ open, onClose }: ImageDrawerProps) {
  // `window.location.origin` is stable for the document's lifetime, but the URL
  // is built once rather than per render so the iframe's `src` never churns —
  // a changed `src` would reload the library and lose the user's place.
  const embedSrc = useMemo(() => assetLibraryUrl(), []);

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

  /**
   * The escape hatch for browsers that will not send the library its session
   * cookie inside a frame — Safari, Firefox with strict tracking protection,
   * Chrome in incognito. In those the panel can only ever show a sign-in
   * prompt, whereas a first-party window works everywhere. Opened from here
   * rather than from inside the frame so the click is a user gesture in this
   * document, which is what keeps a popup blocker out of the way.
   */
  const openInWindow = () => {
    window.open(
      assetLibraryUrl({ popup: true }),
      'asset-library',
      'width=460,height=760',
    );
  };

  return (
    <aside
      data-chrome
      className={`${DRAWER_CLASS}${open ? '' : ` ${CLOSED_CLASS}`}`}
      aria-label="Image library"
      aria-hidden={!open}
      // Keep presses on the drawer from reaching the canvas beneath it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="flex flex-none items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <h2 className="truncate text-[12.5px] tracking-[0.01em] text-muted">
          Click an image to place it
        </h2>
        <div className="flex flex-none items-center gap-1">
          <ToolbarButton
            title="Open the library in its own window — use this if it keeps asking you to sign in"
            aria-label="Open image library in a new window"
            onClick={openInWindow}
          >
            <ExternalWindowIcon />
          </ToolbarButton>
          <ToolbarButton title="Close images (Esc)" aria-label="Close images" onClick={onClose}>
            <CloseIcon />
          </ToolbarButton>
        </div>
      </header>

      <iframe
        src={embedSrc}
        title="Image library"
        className="h-full w-full flex-1 border-0"
        referrerPolicy="no-referrer"
        // `allow-same-origin` is what lets the library load its own assets and
        // run normally; it grants nothing over this page, which is a separate
        // origin. `allow-popups` is what lets it open Google's consent screen,
        // which refuses to render inside a frame at all.
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        // Nothing is shown until the drawer is first opened, so defer the load.
        loading="lazy"
      />
    </aside>
  );
}
