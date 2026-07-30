import { BrushCursor } from './components/BrushCursor';
import { Hint } from './components/Hint';
import { SaveIndicator } from './components/SaveIndicator';
import { Toolbar } from './components/Toolbar';
import { useWhiteboard } from './whiteboard/useWhiteboard';

export function App() {
  const board = useWhiteboard();

  return (
    <>
      {/* Dot grid sits below the ink layer so erasing reveals it again. */}
      <canvas ref={board.dotCanvasRef} className="fixed inset-0 touch-none" aria-hidden="true" />
      <canvas
        ref={board.inkCanvasRef}
        className="fixed inset-0 z-[1] touch-none"
        role="img"
        aria-label="Whiteboard drawing surface"
      />
      <Hint hidden={board.hasDrawn} />
      <SaveIndicator status={board.saveStatus} />
      <BrushCursor ref={board.brushCursorRef} />
      <Toolbar {...board} />
    </>
  );
}
