// Writes the public "Free help" pages (src/landing) into dist/ as static
// HTML, after `vite build`. Uses Vite only to load the TypeScript/JSX source;
// nothing here runs in visitors' browsers.
//
//   node scripts/prerender.mjs            (after vite build)
//   SITE_ORIGIN=https://example.org node scripts/prerender.mjs
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
// Links between pages follow this build's base; flyer QR codes and canonical
// links always point at the public site, even from a local build.
const base = process.env.VITE_BASE ?? "/";
const origin = (process.env.SITE_ORIGIN ?? "https://enriquecorado.github.io").replace(/\/$/, "");
const publicBase = process.env.SITE_BASE ?? "/stanislaus-cam-map/";
const repo = "https://github.com/EnriqueCorado/stanislaus-cam-map";

// Every link must be https, a phone or email link, or a path on this site: a
// bad edit to a facts file fails the build instead of shipping.
const SAFE_HREF = /^(https:\/\/|tel:\+1\d{10}$|mailto:[^\s@<>"]+@[^\s@<>"]+$|\/(?!\/)|#)/;

function checkLinks(path, html) {
  for (const [, href] of html.matchAll(/\shref="([^"]*)"/g)) {
    if (!SAFE_HREF.test(href.replaceAll("&amp;", "&"))) throw new Error(`prerender: unsafe link "${href}" on ${path}`);
  }
}

/** A Content-Security-Policy that lets the page load nothing but itself: the
 *  browser enforces the "no requests" promise, and only these exact inline
 *  scripts can run. */
function withCsp(html) {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ([, body]) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`,
  );
  const policy = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `script-src ${hashes.join(" ") || "'none'"}`,
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return html.replace('<meta charSet="utf-8"/>', `<meta charSet="utf-8"/><meta http-equiv="Content-Security-Policy" content="${policy}"/>`);
}

const vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { renderSite } = await vite.ssrLoadModule("/src/landing/render.tsx");
  const legalHelp = JSON.parse(await readFile(join(root, "public/data/layers/legal-help.geojson"), "utf8"));
  const pages = renderSite({ origin, base, publicBase, repo, legalHelp });
  const seen = new Set();
  for (const { path, html: raw } of pages) {
    checkLinks(path, raw);
    const html = withCsp(raw);
    if (!html.includes("Content-Security-Policy")) throw new Error(`prerender: no CSP on ${path}`);
    const file = resolve(dist, path, "index.html");
    if (!file.startsWith(dist + sep) || seen.has(file)) throw new Error(`prerender: bad or duplicate page path "${path}"`);
    seen.add(file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
  }
  console.log(`prerender: wrote ${pages.length} pages`);
} finally {
  await vite.close();
}
