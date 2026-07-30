import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { AUTOSAVE_DEBOUNCE_MS, SAVE_RETRY_ATTEMPTS, SAVE_RETRY_MS } from './constants';
import { loadBoard, saveBoard, type SaveStatus } from './persistence';
import type { Stroke } from './types';

interface BoardSyncOptions {
  /** Reads the strokes to persist. Called at save time, never at queue time. */
  getStrokes: () => readonly Stroke[];
  /** Hands restored strokes to the board once the initial load lands. */
  applyStrokes: (strokes: Stroke[]) => void;
}

export interface BoardSync {
  status: SaveStatus;
  /** Queues a debounced save. Cheap to call after every committed change. */
  markDirty: () => void;
}

/**
 * Loads the board once on mount, then autosaves the whole stroke list on a
 * debounce. Saves stay disabled until the load resolves, so a slow network or a
 * failed read can never overwrite the stored board with a blank one.
 */
export function useBoardSync({ getStrokes, applyStrokes }: BoardSyncOptions): BoardSync {
  const [status, setStatus] = useState<SaveStatus>(
    isSupabaseConfigured ? 'loading' : 'offline',
  );

  const timerRef = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const inFlightRef = useRef(false);
  /** A change arrived mid-save, so the write we just sent is already stale. */
  const dirtyRef = useRef(false);
  const retriesRef = useRef(0);

  // The load effect runs once; reading callbacks through refs keeps it that way
  // even though the caller passes fresh closures on every render.
  const getStrokesRef = useRef(getStrokes);
  const applyStrokesRef = useRef(applyStrokes);
  getStrokesRef.current = getStrokes;
  applyStrokesRef.current = applyStrokes;

  const flush = useCallback(async () => {
    if (!isSupabaseConfigured || !loadedRef.current) return;
    if (inFlightRef.current) return;
    if (!dirtyRef.current) return;

    inFlightRef.current = true;
    dirtyRef.current = false;
    setStatus('saving');

    // Snapshot before awaiting: the live array keeps mutating as the user draws.
    const snapshot = getStrokesRef.current().map((stroke) => ({
      ...stroke,
      points: [...stroke.points],
    }));

    try {
      await saveBoard(snapshot);
      retriesRef.current = 0;
      inFlightRef.current = false;
      if (dirtyRef.current) void flush();
      else setStatus('saved');
    } catch (error) {
      console.error('[whiteboard] save failed', error);
      inFlightRef.current = false;
      dirtyRef.current = true;
      setStatus('error');
      // Retry a bounded number of times; drawing again re-arms the counter.
      if (retriesRef.current < SAVE_RETRY_ATTEMPTS) {
        retriesRef.current += 1;
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => void flush(), SAVE_RETRY_MS);
      }
    }
  }, []);

  const markDirty = useCallback(() => {
    if (!isSupabaseConfigured) return;
    dirtyRef.current = true;
    retriesRef.current = 0;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    loadBoard()
      .then((strokes) => {
        if (cancelled) return;
        if (strokes?.length) applyStrokesRef.current(strokes);
        loadedRef.current = true;
        // Anything drawn while the load was in flight still needs writing.
        setStatus(dirtyRef.current ? 'saving' : 'saved');
        if (dirtyRef.current) void flush();
      })
      .catch((error) => {
        if (cancelled) return;
        // loadedRef stays false: without a known-good baseline, saving would
        // replace a board we simply failed to read.
        console.error('[whiteboard] load failed', error);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [flush]);

  // A backgrounded tab may never come back, so don't wait out the debounce.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [flush]);

  return { status, markDirty };
}
