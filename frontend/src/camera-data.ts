// Camera list decoding. Pure (no DOM / env), so it's unit-tested directly
// (e2e/tests/unit-cameras.spec.ts).
import type { Camera, CameraList } from "./types";

const CAMERA_DEFAULTS: Omit<Camera, "id" | "name" | "latitude" | "longitude"> = {
  county: "",
  nearby_place: "",
  route: "",
  direction: "",
  snapshot_url: "",
  stream_url: "",
  in_service: true,
  source: "caltrans",
  state: "CA",
  views: [],
};

export type RawCameraList = Partial<CameraList> & {
  cameras: Record<string, unknown>[];
  /** Baked file only: short key -> field name. */
  keys?: Record<string, string>;
};

/** The baked cameras.json uses short keys and leaves out default / empty
 *  fields to stay small (backend scripts/bake.py `compact_camera`): expand the
 *  keys and put the defaults back. A camera's state defaults to its source's.
 *  The API's full-form list passes through unchanged. */
export function withDefaults(list: RawCameraList): CameraList {
  const keys = list.keys ?? {};
  const sources = list.sources ?? {};
  return {
    count: list.count ?? list.cameras.length,
    source: list.source ?? "",
    sources,
    cameras: list.cameras.map((raw) => {
      const c: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) c[keys[k] ?? k] = v;
      const source = typeof c.source === "string" ? c.source : CAMERA_DEFAULTS.source;
      return {
        ...CAMERA_DEFAULTS,
        views: [] as string[], // a fresh array per camera, never the shared default
        state: sources[source]?.state ?? CAMERA_DEFAULTS.state,
        ...c,
      } as unknown as Camera;
    }),
  };
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Lower-cased search text per camera, built once (~15k cameras are filtered on
// every keystroke, in both the list and the map).
const haystacks = new WeakMap<Camera, string>();
function haystack(c: Camera): string {
  let h = haystacks.get(c);
  if (h === undefined) {
    h = `${c.name} ${c.nearby_place} ${c.county} ${c.route} ${c.state} ${STATE_NAMES[c.state] ?? ""}`.toLowerCase();
    haystacks.set(c, h);
  }
  return h;
}

/** Shared camera text filter (place, county, road, state) — used by the map and
 *  the Sidebar list. `q` is already lower-cased. */
export function matchCamera(c: Camera, q: string): boolean {
  if (!q) return true;
  return haystack(c).includes(q);
}
