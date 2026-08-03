import { useCallback, useState } from 'react';
import { BrushCursor } from './components/BrushCursor';
import { Hint } from './components/Hint';
import { ImageDrawer } from './components/ImageDrawer';
import { ImageLayer } from './components/ImageLayer';
import { SaveIndicator } from './components/SaveIndicator';
import { Toolbar } from './components/Toolbar';
import { useWhiteboard } from './whiteboard/useWhiteboard';

export function App() {
  const board = useWhiteboard();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((open) => !open), []);

  return (
    <>
      {/* Dot grid sits below the ink layer so erasing reveals it again. */}
      <canvas ref={board.dotCanvasRef} className="fixed inset-0 touch-none" aria-hidden="true" />
      {/* Images sit between the two, so ink lands on top of them and the eraser
          lifts only the ink back off. */}
      <ImageLayer ref={board.imageLayerRef} images={board.images} />
      <canvas
        ref={board.inkCanvasRef}
        className="fixed inset-0 z-[2] touch-none"
        role="img"
        aria-label="Whiteboard drawing surface"
      />
      <Hint hidden={board.hasDrawn} />
      <SaveIndicator status={board.saveStatus} />
      <BrushCursor ref={board.brushCursorRef} />
      <ImageDrawer open={drawerOpen} onClose={closeDrawer} />
      <Toolbar {...board} drawerOpen={drawerOpen} onToggleDrawer={toggleDrawer} />
    </>
  );
}
