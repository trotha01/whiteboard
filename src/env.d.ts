/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Omit both this and the key to run without a database. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon (publishable) key — safe to ship, RLS is what guards the data. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Overrides the default board row id. */
  readonly VITE_BOARD_ID?: string;
  /** Origin of the asset library shown in the image drawer. Defaults to production. */
  readonly VITE_ASSETS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
