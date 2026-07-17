/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_HTTP_BASE_URL?: string
  readonly VITE_COLYSEUS_URL?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
