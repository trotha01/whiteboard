import type { BoardImage } from '../whiteboard/types';

interface ImageLayerProps {
  images: readonly BoardImage[];
  /** `useWhiteboard` writes the viewport transform straight onto this element. */
  ref: React.RefObject<HTMLDivElement | null>;
}

/**
 * Images placed on the board, between the dot grid and the ink.
 *
 * These are real `<img>` elements rather than canvas pixels for two reasons:
 * the sources are cross-origin, which would taint the ink canvas, and the
 * eraser composites with `destination-out`, so anything painted there would be
 * rubbed away along with the ink. Below the ink layer means you draw on top of
 * an image, and erasing only lifts your own strokes off it.
 *
 * Children are positioned in plain world units; the wrapper carries the
 * world-to-screen transform, which is written imperatively on every frame.
 */
export function ImageLayer({ images, ref }: ImageLayerProps) {
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed top-0 left-0 z-[1] origin-top-left"
      aria-hidden="true"
    >
      {images.map((image) => (
        <img
          key={image.id}
          src={image.src}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          className="absolute max-w-none select-none"
          style={{
            left: image.x,
            top: image.y,
            width: image.width,
            height: image.height,
          }}
        />
      ))}
    </div>
  );
}
