/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API server when the UI is hosted separately (e.g. GitHub Pages). Empty = same origin. */
  readonly VITE_API_BASE_URL?: string;
}
