-- Whiteboard persistence: one row per board, holding the full stroke list.
--
-- The board is written whole on every autosave rather than as individual stroke
-- rows. Undo, redo and clear all mutate the list as a unit, and the payloads are
-- small, so a single document keeps writes atomic and the client simple.

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  strokes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cheap guard against a client writing a non-array into the document.
  constraint boards_strokes_is_array check (jsonb_typeof(strokes) = 'array')
);

comment on table public.boards is
  'One infinite-canvas whiteboard per row; strokes are world-space polylines.';
comment on column public.boards.strokes is
  'Array of { tool, color, width, points: [[x, y], ...] } in world coordinates.';

alter table public.boards enable row level security;

-- The app ships no authentication: anyone with the URL shares one public board,
-- so the anon role gets read and write access to it. Add an `owner_id uuid` plus
-- `auth.uid() = owner_id` policies here if boards ever become per-user.
drop policy if exists "boards are publicly readable" on public.boards;
create policy "boards are publicly readable"
  on public.boards for select
  to anon, authenticated
  using (true);

drop policy if exists "boards are publicly writable" on public.boards;
create policy "boards are publicly writable"
  on public.boards for insert
  to anon, authenticated
  with check (true);

drop policy if exists "boards are publicly updatable" on public.boards;
create policy "boards are publicly updatable"
  on public.boards for update
  to anon, authenticated
  using (true)
  with check (true);

-- No delete policy: clearing the board empties `strokes`, it never drops the row.

-- Keep updated_at honest even if a client omits or backdates it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists boards_touch_updated_at on public.boards;
create trigger boards_touch_updated_at
  before update on public.boards
  for each row execute function public.touch_updated_at();

-- Seed the default board so the first visitor reads a row instead of creating it.
-- Must match VITE_BOARD_ID (src/lib/supabase.ts).
insert into public.boards (id)
values ('9b60c1aa-1550-4754-81ef-0812db0cb5ca')
on conflict (id) do nothing;
