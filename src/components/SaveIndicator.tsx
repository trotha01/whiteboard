import type { SaveStatus } from '../whiteboard/persistence';

const INDICATOR_CLASS = [
  'pointer-events-none fixed top-[14px] right-[14px] z-20',
  'flex items-center gap-2 whitespace-nowrap',
  'rounded-full border border-hairline bg-panel px-3 py-[7px]',
  'text-[12.5px] tracking-[0.01em] text-muted shadow-panel',
  'transition-opacity duration-500',
  'max-[520px]:top-2.5 max-[520px]:right-2.5 max-[520px]:px-2.5 max-[520px]:text-xs',
].join(' ');

interface Appearance {
  label: string;
  /** Announced and shown on hover; the label alone is deliberately terse. */
  title: string;
  dotClass: string;
  /** `saved` is the steady state, so it recedes instead of nagging. */
  faded?: boolean;
}

const APPEARANCE: Record<SaveStatus, Appearance> = {
  offline: {
    label: 'Local only',
    title: 'No database configured — changes will be lost on reload',
    dotClass: 'bg-muted',
  },
  loading: {
    label: 'Loading',
    title: 'Loading the saved board',
    dotClass: 'bg-muted animate-pulse',
  },
  saving: {
    label: 'Saving',
    title: 'Saving changes',
    dotClass: 'bg-muted animate-pulse',
  },
  saved: {
    label: 'Saved',
    title: 'All changes saved',
    dotClass: 'bg-muted',
    faded: true,
  },
  error: {
    label: 'Not saved',
    title: 'Could not reach the database — reload to try again',
    dotClass: 'bg-danger',
  },
};

interface SaveIndicatorProps {
  status: SaveStatus;
}

export function SaveIndicator({ status }: SaveIndicatorProps) {
  const { label, title, dotClass, faded } = APPEARANCE[status];

  return (
    <div
      className={`${INDICATOR_CLASS}${faded ? ' opacity-55' : ''}`}
      title={title}
      role="status"
      aria-live="polite"
    >
      <span className={`h-[7px] w-[7px] flex-none rounded-full ${dotClass}`} aria-hidden="true" />
      {label}
    </div>
  );
}
