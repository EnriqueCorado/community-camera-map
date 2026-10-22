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
