/// <reference types="vite/client" />

declare module "*?worker&url" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Cloudflare flights relay URL (static site real-time flights). */
  readonly VITE_FLIGHTS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
