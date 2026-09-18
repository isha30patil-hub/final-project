/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. http://127.0.0.1:8000 (no trailing slash). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
