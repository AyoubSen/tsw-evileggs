/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_HTTP_BASE_URL?: string
  readonly VITE_COLYSEUS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
