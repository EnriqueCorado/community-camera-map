// The free legal help directory, read from the "legal-help" map layer so the
// list and the map pins are one dataset (backend/app/layers/data/legal_help.json).
import { api } from "../api/client";
import { distanceM, type LonLat } from "../near-me-logic";

export type LegalKind =
  | "immigration"
  | "housing"
  | "general"
  | "seniors"
  | "family"
  | "workers"
  | "court-self-help"
  | "consumer";

export interface LegalOffice {
  id: string;
  name: string;
  kinds: LegalKind[];
  address: string;
  city: string;
  zip: string;
  phone: string;
  website: string;
  languages: string[];
  cost: "free" | "low-cost" | "varies";
  eoir: boolean;
  note: { en: string; es: string };
  checked: string;
  center: [number, number];
}

const split = (v: unknown) => String(v ?? "").split("|").filter(Boolean);

export function parseOffices(fc: GeoJSON.FeatureCollection): LegalOffice[] {
  return fc.features.flatMap((f) => {
    if (f.geometry?.type !== "Point") return [];
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const cost = String(p.cost);
    return [
      {
        id: String(p.id ?? ""),
        name: String(p.name ?? ""),
        kinds: split(p.kinds) as LegalKind[],
        address: String(p.address ?? ""),
        city: String(p.city ?? ""),
        zip: String(p.zip ?? ""),
        phone: String(p.phone ?? ""),
        website: String(p.website ?? ""),
        languages: split(p.languages),
        cost: cost === "free" || cost === "low-cost" ? cost : "varies",
        eoir: p.eoir === true,
        note: { en: String(p.note_en ?? ""), es: String(p.note_es ?? "") },
        checked: String(p.checked ?? ""),
        center: [lon, lat],
      },
    ];
  });
}

const MODESTO: LonLat = [-120.997, 37.639];

/** Sort order: closest to downtown Modesto first, so in-county offices lead. */
export const nearestModestoFirst = (a: LegalOffice, b: LegalOffice) => distanceM(a.center, MODESTO) - distanceM(b.center, MODESTO);

let cache: Promise<LegalOffice[]> | null = null;

/** Load once per page; a failure clears the cache so a retry can succeed. */
export function loadOffices(): Promise<LegalOffice[]> {
  cache ??= fetch(api.layerUrl("legal-help"))
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<GeoJSON.FeatureCollection>;
    })
    .then(parseOffices)
    .catch((e: unknown) => {
      cache = null;
      throw e;
    });
  return cache;
}
