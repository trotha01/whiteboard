import { ASSETS_ORIGIN, ASSETS_URL } from './constants';

/**
 * The board's half of the picker contract with the asset library.
 *
 * Keep in step with `lib/embedMessages.ts` in the library's repository. The
 * library is cross-origin, so this is the only channel there is: the drawer
 * cannot be read, scripted, or clicked from here, and a photo arrives because
 * that app chose to send it.
 *
 * `source` only filters out unrelated `postMessage` traffic. The security check
 * is `event.origin`, which the browser sets and a page cannot forge.
 */

const MESSAGE_SOURCE = 'triple-assets';

export interface AssetPick {
  src: string;
  name: string;
  /** Intrinsic size when the library knew it; the board decodes anyway. */
  width?: number;
  height?: number;
}

/**
 * The pick in an event, or null for anything else.
 *
 * Everything is re-checked rather than trusted: a same-origin script on the
 * library could send any shape, and the board is about to write this into a row
 * everybody shares.
 */
export function assetPickFrom(event: MessageEvent): AssetPick | null {
  if (event.origin !== ASSETS_ORIGIN) return null;

  const data = event.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== 'object') return null;
  if (data.source !== MESSAGE_SOURCE || data.type !== 'asset:pick') return null;
  if (typeof data.src !== 'string' || !data.src) return null;

  return {
    src: data.src,
    name: typeof data.name === 'string' ? data.name : '',
    width: typeof data.width === 'number' ? data.width : undefined,
    height: typeof data.height === 'number' ? data.height : undefined,
  };
}

/**
 * Where to load the library from.
 *
 * `origin` tells it who is embedding, and it answers only if that is on its own
 * allowlist — so this is a claim being made, not a permission being granted.
 *
 * `popup` asks for the standalone form, which posts to `window.opener` instead
 * of `window.parent`. That is the way in for browsers that refuse to send the
 * library its session cookie inside a frame, where the panel can only ever show
 * a sign-in prompt.
 */
export function assetLibraryUrl(options: { popup?: boolean } = {}): string {
  const url = new URL('/embed', ASSETS_URL);
  url.searchParams.set('origin', window.location.origin);
  if (options.popup) url.searchParams.set('popup', '1');
  return url.href;
}
