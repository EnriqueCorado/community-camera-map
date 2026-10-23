import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal declaration so we can read VITE_BASE without pulling in @types/node.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig(() => ({
  // GitHub Pages serves under /<repo>/; set VITE_BASE at build time. Default "/"
  // for local dev and root hosts.
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    react(),
    {
      // Static site: the map waits for the camera index and the sidebar for
      // the national layer catalog (api/client.ts), so fetch both alongside
      // the code instead of after it runs. Same URL, mode and credentials as
      // those fetches, so the browser reuses the responses.
      name: "preload-first-data",
      transformIndexHtml: () =>
        process.env.VITE_STATIC === "1"
          ? ["data/cameras/index.json", "data/catalog/base.json"].map((href) => ({
              tag: "link",
              attrs: { rel: "preload", href, as: "fetch", crossorigin: true },
              injectTo: "head" as const,
            }))
          : [],
    },
  ],
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than the app: separate files stay
        // cached in visitors' browsers across our deploys.
        manualChunks(id: string) {
          if (id.includes("node_modules/maplibre-gl")) return "maplibre";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
          if (id.includes("node_modules/hls.js")) return "hls"; // only the video player uses it
          return undefined;
        },
      },
    },
  },
  server: {
    // Overridable so parallel worktrees can each run their own dev stack.
    port: Number(process.env.VITE_PORT ?? 5173),
    proxy: {
      "/api": {
        target: process.env.API_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
}));
