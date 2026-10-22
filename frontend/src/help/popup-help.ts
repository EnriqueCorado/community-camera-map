// Which map pins get a "free help" button, and where it opens the Help panel.
// Pure (no DOM) so the rules are unit-tested.
import type { LonLat } from "../near-me-logic";
import { findHospital, inCalifornia, isClosedHospital } from "./hospitals";
import type { HelpTarget } from "./target";

/** HIFLD hospital TYPE values licensed under HSC §1250(a), (b) or (f). */
const COVERED_TYPES = new Set(["GENERAL ACUTE CARE", "CRITICAL ACCESS", "PSYCHIATRIC", "SPECIAL"]);
const NOT_HOSPITALS = /\b(SNF|NURSING|PHF|PSYCHIATRIC HEALTH FACILITY)\b/;

export function helpFor(layer: string, props: Record<string, unknown>, at: LonLat): HelpTarget | null {
  switch (layer) {
    case "hospitals": {
      // The Hospital Fair Pricing Act covers general acute care, acute
      // psychiatric and special hospitals (HSC §127400(d)), not long-term care.
      const name = String(props.NAME ?? "");
      // Nursing homes and psychiatric health facilities share the map layer
      // but aren't covered.
      if (isClosedHospital(at) || NOT_HOSPITALS.test(name.toUpperCase())) return null;
      const known = findHospital(at, name);
      if (known) return { tab: "medical", hospitalId: known.id };
      const type = String(props.TYPE ?? "").toUpperCase();
      return COVERED_TYPES.has(type) && inCalifornia(at, props) ? { tab: "medical" } : null;
    }
    case "mobile-home-parks":
      return { tab: "rent", view: "mobile" };
    case "legal-help":
      return { tab: "legal" };
    default:
      return null;
  }
}
