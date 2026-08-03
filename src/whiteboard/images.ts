import { ASSETS_URL, IMAGE_LOAD_TIMEOUT_MS } from './constants';

/**
 * Pulling an image URL out of a drag that started in the assets iframe.
 *
 * The iframe is cross-origin, so nothing here can inspect it: no DOM access, no
 * click handlers, no injected script. What we do get is the payload the browser
 * itself builds when the user drags an `<img>` out of a frame, which arrives on
 * the parent's `drop` event. The shape of that payload varies by browser and by
 * whether the image was wrapped in a link, so every known form is tried in turn.
 */

/** Next.js serves optimised images from this path with the original in `?url=`. */
const NEXT_IMAGE_PATH = '/_next/image';

/** Ask the Next.js optimiser for a size that still looks sharp when zoomed in. */
const NEXT_IMAGE_WIDTH = '1920';

/**
 * Only `https:` survives. A dropped `javascript:` or `data:` URL has no business
 * in a shared board document, and `blob:` URLs are dead on the next reload.
 */
function normalise(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    // Relative payloads are rare but legal; the drag came from the assets site.
    url = new URL(trimmed, ASSETS_URL);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  // `/_next/image?url=…&w=64` is a thumbnail of the real asset. Prefer the
  // original where it is absolute, and otherwise just ask for a bigger render
  // than whatever width the gallery happened to lay out with.
  if (url.pathname === NEXT_IMAGE_PATH) {
    const inner = url.searchParams.get('url');
    if (inner?.startsWith('http')) return normalise(inner);
    url.searchParams.set('w', NEXT_IMAGE_WIDTH);
  }

  return url.href;
}

/** `text/uri-list` is newline-delimited and may carry `#` comment lines. */
function fromUriList(value: string): string | null {
  for (const line of value.split(/\r?\n/)) {
    if (line.startsWith('#')) continue;
    const url = normalise(line);
    if (url) return url;
  }
  return null;
}

/**
 * Browsers put a fragment of the source markup in `text/html` — usually the
 * `<img>` itself, sometimes wrapped in the `<a>` it lived inside. Parsing it is
 * how we recover the image when `text/uri-list` holds the link target instead.
 */
function fromHtml(value: string): string | null {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  for (const img of doc.querySelectorAll('img')) {
    // `getAttribute` rather than `.src`: the parsed document has no base URL, so
    // the resolved property would be mangled before `normalise` sees it.
    const url = normalise(img.getAttribute('src') ?? '');
    if (url) return url;
  }
  return null;
}

/**
 * Best image URL in a drop, or `null` if the drag carried nothing usable —
 * which is what a drag of text, of a `background-image`, or from an OS file
 * manager looks like. Callers should treat `null` as "ignore this drop".
 */
export function imageUrlFromDataTransfer(data: DataTransfer): string | null {
  return (
    fromUriList(data.getData('text/uri-list')) ??
    fromHtml(data.getData('text/html')) ??
    normalise(data.getData('text/plain'))
  );
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
