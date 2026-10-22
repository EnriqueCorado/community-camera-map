// Splits the layer catalog for the static site, after `vite build`: the map
// loads data/catalog/base.json (national layers) up front and one
// data/catalog/<ST>.json per state only when it's on screen. Most of the
// catalog is state layers, so a visitor downloads a fraction of it.
// data/layers.json (the whole catalog) stays for tools and as a fallback.
//
//   node scripts/split-catalog.mjs            (after vite build)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitCatalog } from "./catalog-split.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = join(root, "dist", "data");
const known = Object.keys(JSON.parse(await readFile(join(root, "src", "state-bboxes.json"), "utf8")));
const { base, states } = splitCatalog(JSON.parse(await readFile(join(data, "layers.json"), "utf8")));

// The map asks for a state's file by the states under the map center
// (state-bboxes.json) and, for a layer switched on by a shared link, by its
// name prefix (stateOfLayer): a layer either rule would miss fails the build.
for (const [code, list] of Object.entries(states)) {
  if (!known.includes(code)) throw new Error(`split-catalog: coverage ${code} is not a known state`);
  for (const l of list) {
    if (!l.name.startsWith(`${code.toLowerCase()}-`)) {
      throw new Error(`split-catalog: state layer ${l.name} must start with "${code.toLowerCase()}-"`);
    }
  }
}

await mkdir(join(data, "catalog"), { recursive: true });
await writeFile(join(data, "catalog", "base.json"), JSON.stringify(base));
// Every state gets a file, even an empty one, so a visit never 404s.
for (const code of known) {
  await writeFile(join(data, "catalog", `${code}.json`), JSON.stringify(states[code] ?? []));
}
console.log(`split-catalog: ${base.length} base layers, ${Object.keys(states).length} states with layers`);
