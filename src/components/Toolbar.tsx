import type { Tool } from '../whiteboard/types';
import type { WhiteboardApi } from '../whiteboard/useWhiteboard';
import { ClearButton } from './ClearButton';
import { ColorPicker } from './ColorPicker';
import { EraserIcon, MinusIcon, PanIcon, PenIcon, PlusIcon, RedoIcon, UndoIcon } from './icons';
import { SizePicker } from './SizePicker';
import { ToolbarButton } from './ToolbarButton';

const TOOLBAR_CLASS = [
  'fixed bottom-5 left-1/2 z-10 -translate-x-1/2',
  'flex max-w-[calc(100vw-16px)] items-center gap-[5px]',
  'overflow-x-auto overflow-y-hidden no-scrollbar',
  'rounded-full border border-hairline bg-panel px-[9px] py-[7px]',
  'shadow-panel backdrop-blur-[16px] backdrop-saturate-150',
  'max-[520px]:bottom-3 max-[520px]:gap-[3px] max-[520px]:px-[7px] max-[520px]:py-1.5',
].join(' ');

const TOOLS: ReadonlyArray<{ tool: Tool; title: string; icon: React.ReactNode }> = [
  { tool: 'pen', title: 'Pen (P)', icon: <PenIcon /> },
  { tool: 'eraser', title: 'Eraser (E)', icon: <EraserIcon /> },
  { tool: 'pan', title: 'Pan (hold Space)', icon: <PanIcon /> },
];

function Divider() {
  return <div className="mx-[3px] h-6 w-px flex-none bg-hairline max-[520px]:mx-0.5" />;
}

export function Toolbar({
  toolbarRef,
  tool,
  setTool,
  color,
  setColor,
  sizeIndex,
  setSizeIndex,
  zoomPercent,
  canUndo,
  canRedo,
  undo,
  redo,
  clear,
  zoomIn,
  zoomOut,
  resetView,
}: WhiteboardApi) {
  return (
    <div
      ref={toolbarRef}
      className={TOOLBAR_CLASS}
      role="toolbar"
      aria-label="Whiteboard tools"
      // Keep toolbar presses from reaching the canvas beneath it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-none items-center gap-1" role="group" aria-label="Tool">
        {TOOLS.map(({ tool: name, title, icon }) => (
          <ToolbarButton
            key={name}
            title={title}
            aria-label={title}
            active={tool === name}
            onClick={() => setTool(name)}
          >
            {icon}
          </ToolbarButton>
        ))}
      </div>

      <Divider />
      <ColorPicker color={color} onSelect={setColor} />

      <Divider />
      <SizePicker sizeIndex={sizeIndex} onSelect={setSizeIndex} />

      <Divider />
      <div className="flex flex-none items-center gap-1" role="group" aria-label="History">
        <ToolbarButton title="Undo (Ctrl/⌘+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <UndoIcon />
        </ToolbarButton>
        <ToolbarButton
          title="Redo (Ctrl/⌘+Shift+Z)"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
        >
          <RedoIcon />
        </ToolbarButton>
      </div>

      <Divider />
      <div className="flex flex-none items-center gap-1" role="group" aria-label="Zoom">
        <ToolbarButton title="Zoom out (-)" aria-label="Zoom out" onClick={zoomOut}>
          <MinusIcon />
        </ToolbarButton>
        <button
          type="button"
          title="Reset view (0)"
          aria-label={`Zoom ${zoomPercent}%. Reset view`}
          onClick={resetView}
          className="flex h-9 min-w-[46px] flex-none cursor-pointer items-center justify-center rounded-[11px] px-1.5 text-[12.5px] text-ink tabular-nums transition-colors duration-150 hover:bg-black/[0.06] max-[520px]:h-8 max-[520px]:min-w-10 max-[520px]:text-xs"
        >
          {zoomPercent}%
        </button>
        <ToolbarButton title="Zoom in (+)" aria-label="Zoom in" onClick={zoomIn}>
          <PlusIcon />
        </ToolbarButton>
      </div>

      <Divider />
      <ClearButton onClear={clear} />
    </div>
  );
}
