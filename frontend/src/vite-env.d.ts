/// <reference types="vite/client" />

declare module "*?worker&url" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Flights relay URL (static site real-time flights). */
  readonly VITE_FLIGHTS_URL?: string;
  /** Anonymous usage counter URL (relay/api/count.ts); empty = no counting. */
  readonly VITE_COUNTER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
