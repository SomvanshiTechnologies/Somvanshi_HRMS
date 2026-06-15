/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional base origin for the API (e.g. "https://api.example.com"). Empty → same-origin. */
  readonly VITE_API_URL?: string;
  /** Optional Socket.IO origin. Empty → same-origin ("/"). */
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
