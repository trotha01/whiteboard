const ICON_CLASS =
  'h-[18px] w-[18px] fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] max-[520px]:h-4 max-[520px]:w-4';

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={ICON_CLASS} aria-hidden="true">
      {children}
    </svg>
  );
}

export function PenIcon() {
  return (
    <Icon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

export function EraserIcon() {
  return (
    <Icon>
      <path d="M18 13 11.5 19.5a2 2 0 0 1-2.83 0l-4.17-4.17a2 2 0 0 1 0-2.83L13 4l7 7-2 2Z" />
      <line x1="9" y1="20" x2="20.5" y2="20" />
    </Icon>
  );
}

export function PanIcon() {
  return (
    <Icon>
      <polyline points="5 9 2 12 5 15" />
      <polyline points="9 5 12 2 15 5" />
      <polyline points="15 19 12 22 9 19" />
      <polyline points="19 9 22 12 19 15" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </Icon>
  );
}

export function UndoIcon() {
  return (
    <Icon>
      <path d="M3 10h10a5 5 0 0 1 0 10H9" />
      <polyline points="8 5 3 10 8 15" />
    </Icon>
  );
}

export function RedoIcon() {
  return (
    <Icon>
      <path d="M21 10H11a5 5 0 0 0 0 10h4" />
      <polyline points="16 5 21 10 16 15" />
    </Icon>
  );
}

export function MinusIcon() {
  return (
    <Icon>
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Icon>
  );
}
