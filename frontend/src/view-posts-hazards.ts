// Named cleanups for the hazards / environment / water pack (backend
// app/layers/national/hazards.py). Pure: merged into view-logic.ts POST.
type Props = Record<string, unknown>;

const pad = (n: number) => String(n).padStart(2, "0");
const num = (v: unknown): number | null =>
  (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) ? Number(v) : null;

/** Epoch ms -> "2026-10-19", or "2026-10-19 18:10 UTC" with `time`. */
export function utcText(ms: unknown, time: boolean): string {
  const n = num(ms);
  if (n == null) return "";
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "";
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return time ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC` : day;
}

/** NOAA HMS "YYYYDDD HHMM" (day of year, UTC) -> Date, else null. */
function hmsDate(v: unknown): Date | null {
  const m = /^(\d{4})(\d{3})\s*(\d{2})(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), 0, Number(m[2]), Number(m[3]), Number(m[4])));
  return Number.isNaN(d.getTime()) ? null : d;
}

const UNITS: Record<string, string> = { mi: "mi", kt: "kt", lbs: "lbs", sqmi: "sq mi", count: "" };

/** Suffix-driven formatting: `<k>_date` / `<k>_utc` (epoch ms) and
 *  `<k>_mi|_kt|_lbs|_sqmi|_count` (numbers) become readable text in `<k>`;
 *  an http `page` link is upgraded to https (popups still only link to
 *  allowlisted hosts). */
function fmt(p: Props): void {
  for (const k of Object.keys(p)) {
    const m = /^(.+)_(date|utc|mi|kt|lbs|sqmi|count)$/.exec(k);
    if (!m) continue;
    const [, base, unit] = m as unknown as [string, string, string];
    const v = p[k];
    delete p[k];
    if (unit === "date" || unit === "utc") {
      p[base] = utcText(v, unit === "utc");
      continue;
    }
    const n = num(v);
    // A storm's wind of 0 means "not given" (e.g. a remnant low).
    p[base] = n == null || (unit === "kt" && n <= 0) ? "" : `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${UNITS[unit]}`.trim();
  }
  if (typeof p.page === "string") p.page = p.page.trim().replace(/^http:\/\//i, "https://");
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const HAZARD_POST: Record<string, (p: Props) => void> = {
  fmt,
  // CDC/ATSDR EJI & SVI: 0-1 percentiles -> 0-100; -999 (no data) -> null.
  pctl: (p) => {
    for (const k of Object.keys(p)) {
      if (!k.endsWith("_pctl")) continue;
      const n = num(p[k]);
      p[k] = n == null || n < 0 || n > 1 ? null : Math.round(n * 1000) / 10;
    }
  },
  // USGS/EPA radon zone 1 = high .. 3 = low -> level 3 = high .. 1 = low.
  radon: (p) => {
    const z = num(p.zone);
    p.level = z != null && z >= 1 && z <= 3 ? 4 - z : null;
    delete p.zone;
  },
  // Esri's VIIRS hotspots -> what the hotspot popup reads (as FIRMS bakes do).
  hotspot: (p) => {
    const n = num(p.acquired);
    p.acquired = n == null ? "" : new Date(n).toISOString();
    p.daynight = p.daynight === "D" ? "day" : p.daynight === "N" ? "night" : "";
  },
  // NOAA HMS: fire points carry YearDay + "HHMM"; smoke polygons start/end.
  hms: (p) => {
    if ("_yearday" in p) {
      const t = String(p._time ?? "").trim();
      const d = t ? hmsDate(`${String(p._yearday ?? "")} ${t.padStart(4, "0")}`) : null;
      p.acquired = d ? d.toISOString() : "";
      delete p._yearday;
      delete p._time;
    }
    for (const k of ["start", "end"]) {
      if (!(k in p)) continue;
      const d = hmsDate(p[k]);
      p[k] = d ? utcText(d.getTime(), true) : "";
    }
  },
  // FEMA recovery centers: per-day open/close -> "08:00-16:00" under mon..sun.
  drc: (p) => {
    for (const d of DAYS) {
      const o = String(p[`_${d}_open`] ?? "").trim();
      const c = String(p[`_${d}_close`] ?? "").trim();
      p[d] = o && c ? `${o}-${c}` : "";
      delete p[`_${d}_open`];
      delete p[`_${d}_close`];
    }
    fmt(p);
  },
};
