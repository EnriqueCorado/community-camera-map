// Pure part of split-catalog.mjs (kept separate so tests can import it).

/** { base: [...], states: { TX: [...], ... } }: state layers are those whose
 *  coverage is a USPS code; everything else (usa, world, home) is base. */
export function splitCatalog(layers) {
  const base = [];
  const states = {};
  for (const l of layers) {
    const c = typeof l.coverage === "string" && /^[A-Z]{2}$/.test(l.coverage) ? l.coverage : null;
    if (c) (states[c] ??= []).push(l);
    else base.push(l);
  }
  return { base, states };
}

/** The sidebar's search index of every state layer (data/catalog/index.json),
 *  so "find a layer" reaches states that aren't loaded: [{n: name, t: title,
 *  e: title_es (if any), s: state}]; short keys keep the file small. */
export function catalogIndex(states) {
  return Object.entries(states).flatMap(([s, list]) =>
    list.map((l) => (l.title_es ? { n: l.name, t: l.title, e: l.title_es, s } : { n: l.name, t: l.title, s })),
  );
}
