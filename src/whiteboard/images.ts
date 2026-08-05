import { ASSETS_ORIGIN, IMAGE_LOAD_TIMEOUT_MS } from './constants';

/**
 * Deciding what a drag is offering, and whether the board can keep it.
 *
 * The library in the drawer is cross-origin, so nothing here can inspect it: no
 * DOM access, no click handlers, no injected script. Clicking a photo goes
 * through `assetPicker.ts` instead, which is an agreement between the two apps.
 * Dragging still has to go through the browser's own payload — the library sets
 * `text/uri-list` explicitly for that reason, but a drag from anywhere else
 * arrives in whatever shape that site happened to produce.
 */

/**
 * Whether a URL may be placed on the board.
 *
 * The board is world-writable and its `src` values end up in `<img>` tags for
 * every future viewer, so this is the one gate that matters: no `javascript:`,
 * and no `blob:` or `data:` URL that is already dead for everybody else.
 *
 * Plain `http:` is tolerated for the asset library itself and nothing else,
 * which is what lets `npm run dev` talk to a library on localhost. In
 * production `ASSETS_ORIGIN` is https, so that branch never fires.
 */
export function isPlaceableSrc(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && url.origin === ASSETS_ORIGIN;
}

/**
 * Placeable form of a dragged candidate, or null if it is not one.
 *
 * Absolute URLs only, with no base to resolve against. Resolving relative
 * payloads against the library used to look generous and was in fact two bugs:
 * a relative `src` in markup dragged from some *other* site would be rewritten
 * to point at the library, and any dropped text at all — "just some words" —
 * became a valid-looking candidate that only failed once the network said so.
 * The library sends absolute URLs deliberately, so nothing is lost.
 */
function normalise(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  let href: string;
  try {
    href = new URL(trimmed).href;
  } catch {
    return null;
  }

  return isPlaceableSrc(href) ? href : null;
}

/** `text/uri-list` is newline-delimited and may carry `#` comment lines. */
function fromUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .map(normalise)
    .filter((url): url is string => url !== null);
}

/**
 * Browsers put a fragment of the source markup in `text/html` — usually the
 * `<img>` itself, sometimes wrapped in the `<a>` it lived inside. Parsing it is
 * how the image is recovered when `text/uri-list` holds the link target instead.
 */
function fromHtml(value: string): string[] {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return [...doc.querySelectorAll('img')]
    // `getAttribute` rather than `.src`: the parsed document has no base URL, so
    // the resolved property would be mangled before `normalise` sees it.
    .map((img) => normalise(img.getAttribute('src') ?? ''))
    .filter((url): url is string => url !== null);
}

/**
 * Every URL in a drop that could be the image, best guess first.
 *
 * A list rather than one answer because the payload is genuinely ambiguous and
 * guessing wrong fails silently. A photo wrapped in a link puts the *page* URL
 * in `text/uri-list` and the real image in `text/html`; a photo the library
 * itself set up puts the durable URL in `text/uri-list` and a short-lived
 * thumbnail in `text/html`. Neither field is reliably the right one, so the
 * caller tries them in turn and keeps the first that actually decodes as an
 * image. Empty means the drag carried nothing usable — text, a desktop file, a
 * plain link — and should be ignored.
 */
export function imageUrlsFromDataTransfer(data: DataTransfer): string[] {
  const candidates = [
    ...fromUriList(data.getData('text/uri-list')),
    ...fromHtml(data.getData('text/html')),
    ...fromUriList(data.getData('text/plain')),
  ];
  return [...new Set(candidates)];
}

/**
 * Decodes the image just far enough to learn its aspect ratio, so a dropped
 * image is committed at its true proportions instead of snapping to a guess and
 * reflowing once it paints. Rejects when the URL is not a loadable image, which
 * is how a drag of some unrelated link gets filtered out.
 */
export function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Kept out of the DOM, so this only warms the cache the `<img>` will hit.
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';

    const timer = window.setTimeout(() => {
      img.src = '';
      reject(new Error(`Timed out loading image: ${src}`));
    }, IMAGE_LOAD_TIMEOUT_MS);

    img.onload = () => {
      window.clearTimeout(timer);
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(new Error(`Image has no intrinsic size: ${src}`));
        return;
      }
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`Failed to load image: ${src}`));
    };

    img.src = src;
  });
}
