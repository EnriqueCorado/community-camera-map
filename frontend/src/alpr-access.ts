// "Who can search this plate reader?" — types and pure helpers for the curated,
// sourced profiles in data/alpr_access.json (built from public records; see
// backend/app/layers/alpr_access.py for how cameras are attributed). The
// loader lives in api/client.ts so this module stays importable from unit tests.
import type { Key, Lang } from "./i18n";

export type Bilingual = Record<Lang, string>;

export interface AccessFact {
  /** "YYYY", "YYYY-MM" or "YYYY-MM-DD" — the date of the record, not of our check. */
  date: string;
  source: string;
  text: Bilingual;
}

export interface AccessProfile {
  name: Bilingual;
  system: string;
  summary: Bilingual;
  facts: AccessFact[];
  shares_with?: string[];
  shares_with_source?: string;
  top_searchers?: { agency: string; searches: number }[];
  top_searchers_period?: string;
  top_searchers_source?: string;
}

export interface AlprAccess {
  as_of: string;
  sources: Record<string, { label: Bilingual; url: string }>;
  profiles: Record<string, AccessProfile>;
  default: { summary: Bilingual; facts: AccessFact[] };
}

/**
 * How sure we are about who runs a camera:
 *  tagged    OSM names the operator and we have records for it
 *  inferred  untagged; vendor + city limits match one agency's system
 *  network   part of a shared county network; operator not recorded
 *  untracked OSM names an operator we have no records for
 *  unknown   nothing to go on
 */
export type Basis = "tagged" | "inferred" | "network" | "untracked" | "unknown";

export interface Attribution {
  profileId: string | null;
  basis: Basis;
  /** OSM operator tag, if any (plain text — escape before rendering as HTML). */
  operator: string;
}

/** i18n key for each basis's one-line label. */
export const BASIS_KEY: Record<Basis, Key> = {
  tagged: "basisTagged",
  inferred: "basisInferred",
  network: "basisNetwork",
  untracked: "basisUntracked",
  unknown: "basisUnknown",
};

/** What to show for an attribution (shared by the popup and the panel).
 *  `noRecords` is the localized "no records for this operator" sentence. */
export function describe(
  a: Attribution,
  access: AlprAccess | null,
  lang: Lang,
  noRecords: string,
): { profile?: AccessProfile; name?: string; summary?: string; facts: AccessFact[] } {
  const profile = a.profileId ? access?.profiles[a.profileId] : undefined;
  if (profile) return { profile, name: profile.name[lang], summary: profile.summary[lang], facts: profile.facts };
  return {
    name: a.operator || undefined,
    summary: a.basis === "untracked" ? noRecords : access?.default.summary[lang],
    facts: access?.default.facts ?? [],
  };
}

/** Attribute one ALPR feature's properties to a profile. */
export function attribute(p: Record<string, unknown>, access: AlprAccess | null): Attribution {
  const operator = typeof p.operator === "string" ? p.operator.trim() : "";
  const id = typeof p.agency === "string" ? p.agency : "";
  const basis = p.agency_basis;
  // Only trust ids we actually have a profile for (stale data degrades to "unknown").
  if (id && (!access || id in access.profiles) && (basis === "tagged" || basis === "inferred" || basis === "network")) {
    return { profileId: id, basis, operator };
  }
  return { profileId: null, basis: operator ? "untracked" : "unknown", operator };
}

/** Format a record date ("2019", "2026-08", "2026-09-24") for display. */
export function formatRecordDate(date: string, locale: string): string {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  if (!mo) return y!;
  // Noon UTC so no timezone can shift the calendar day.
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, d ? Number(d) : 1, 12));
  return dt.toLocaleDateString(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: d ? "short" : "long",
    ...(d ? { day: "numeric" } : {}),
  });
}
