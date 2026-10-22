// Writes the public "Free help" pages (src/landing) into dist/ as static
// HTML, after `vite build`. Uses Vite only to load the TypeScript/JSX source;
// nothing here runs in visitors' browsers.
//
//   node scripts/prerender.mjs            (after vite build)
//   SITE_ORIGIN=https://example.org node scripts/prerender.mjs
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
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
const publicBase = process.env.SITE_BASE ?? "/community-camera-map/";
const repo = "https://github.com/EnriqueCorado/community-camera-map";

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
    "worker-src 'self'", // the folder's offline service worker (help/sw.js, ayuda/sw.js)
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return html.replace('<meta charSet="utf-8"/>', `<meta charSet="utf-8"/><meta http-equiv="Content-Security-Policy" content="${policy}"/>`);
}

// Each language folder gets its own service worker, so it never touches the
// map app (outside its scope). Flyers live under help/ but aren't in "Save all".
const SW_FOLDERS = ["help/", "ayuda/"];
const savedPages = (pages, folder) => pages.filter((p) => p.path.startsWith(folder) && !p.path.startsWith("help/flyers/"));

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** `pages` hold the final HTML as written: the worker only keeps or shows a
 *  saved page whose bytes have exactly this hash. */
async function writeServiceWorker(folder, pages) {
  const list = savedPages(pages, folder).map((p) => [`${base}${p.path}`, sha256(p.html)]);
  const version = sha256(JSON.stringify(list)).slice(0, 12);
  const template = await readFile(join(root, "src/landing/sw.js"), "utf8");
  const code = template
    .replace('"__SCOPE__"', JSON.stringify(`${base}${folder}`))
    .replace('"__CACHE__"', JSON.stringify(`scm-${folder.replace("/", "")}-pages`))
    .replace('"__LANG__"', JSON.stringify(folder === "ayuda/" ? "es" : "en"))
    .replace("__PAGES__", JSON.stringify(list));
  if (/__(SCOPE|CACHE|LANG|PAGES)__/.test(code)) throw new Error(`prerender: unfilled token in ${folder}sw.js`);
  // The version line changes the file when pages change, so browsers update the worker.
  await writeFile(join(dist, folder, "sw.js"), `// pages ${version}\n${code}`);
}

const vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { renderSite } = await vite.ssrLoadModule("/src/landing/render.tsx");
  const legalHelp = JSON.parse(await readFile(join(root, "public/data/layers/legal-help.geojson"), "utf8"));
  const pages = renderSite({ origin, base, publicBase, repo, legalHelp });
  // "Save all pages (about N KB)": what saving really downloads (compressed).
  for (const folder of SW_FOLDERS) {
    const bytes = savedPages(pages, folder).reduce((n, p) => n + gzipSync(p.html).length, 0);
    const kb = String(Math.ceil(bytes / 1024 / 10) * 10);
    for (const p of pages) if (p.path.startsWith(folder)) p.html = p.html.replaceAll("__SAVE_KB__", kb);
  }
  const seen = new Set();
  for (const page of pages) {
    const { path, html: raw } = page;
    if (raw.includes("__SAVE_KB__")) throw new Error(`prerender: unfilled size on ${path}`);
    checkLinks(path, raw);
    const html = withCsp(raw);
    if (!html.includes("Content-Security-Policy")) throw new Error(`prerender: no CSP on ${path}`);
    const file = resolve(dist, path, "index.html");
    if (!file.startsWith(dist + sep) || seen.has(file)) throw new Error(`prerender: bad or duplicate page path "${path}"`);
    seen.add(file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
    page.html = html; // the published bytes (the service worker hashes these)
  }
  for (const folder of SW_FOLDERS) await writeServiceWorker(folder, pages);
  console.log(`prerender: wrote ${pages.length} pages and ${SW_FOLDERS.length} service workers`);
} finally {
  await vite.close();
}
