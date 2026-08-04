-- Images placed on the board, alongside the existing stroke list.
--
-- A separate column rather than entries in `strokes`: images render on their own
-- DOM layer beneath the ink, and `parseStroke` on the client rejects any element
-- whose `tool` is not pen or eraser, so a foreign shape in that array would be
-- silently dropped on load. The two lists are still written together as one row,
-- so a save stays atomic.

alter table public.boards
  add column if not exists images jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.boards
    add constraint boards_images_is_array check (jsonb_typeof(images) = 'array');
exception
  when duplicate_object then null;
end;
$$;

comment on column public.boards.images is
  'Array of { id, src, x, y, width, height } in world coordinates; src is an https URL.';
