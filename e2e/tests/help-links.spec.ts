// Weekly upkeep check for the Help tools (run by .github/workflows/help-links.yml,
// or locally with LINKS=1): every link they cite still answers, and the CA
// Attorney General's rent-cap page still shows the cap we use. Skipped in the
// normal suite (it needs the network).
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOSPITALS } from "../../frontend/src/help/hospitals";
import {
  DEPOSIT_FACTS, LEGAL_FACTS, MEDICAL_FACTS, MOBILE_FACTS, RENT_FACTS, RENT_SOURCES, REPAIR_FACTS,
} from "../../frontend/src/help/facts";

test.skip(!process.env.LINKS, "network check; run with LINKS=1");

// Sites that block automated requests (Cloudflare bot checks) answer 401/403/
// 429 to scripts but work in browsers: reported, not failed.
const BLOCKED = new Set([401, 403, 429]);

function links(): string[] {
  const legal = JSON.parse(readFileSync(join(__dirname, "../../backend/app/layers/data/legal_help.json"), "utf8"));
  const all = [
    ...HOSPITALS.flatMap((h) => [h.pageUrl, h.policyUrl, h.policyUrlEs, h.applicationUrl, h.applicationUrlEs]),
    ...RENT_SOURCES.map((s) => s.url),
    ...MEDICAL_FACTS.sources.map((s) => s.url),
    ...LEGAL_FACTS.sources.map((s) => s.url),
    ...LEGAL_FACTS.verify.map((s) => s.url),
    ...REPAIR_FACTS.codeEnforcement.map((c) => c.url),
    ...MOBILE_FACTS.contacts.map((c) => c.url),
    DEPOSIT_FACTS.smallClaims.url,
    MEDICAL_FACTS.complaint.url,
    MEDICAL_FACTS.freeHelp.url,
    ...legal.offices.flatMap((o: { website: string; sources: string[] }) => [o.website, ...o.sources]),
  ];
  return [...new Set(all.filter((u): u is string => !!u && u.startsWith("https://")))].sort();
}

test("every cited link still answers", async ({ request }) => {
  test.setTimeout(10 * 60_000);
  const broken: string[] = [];
  const blocked: string[] = [];
  for (const url of links()) {
    let status = 0;
    for (let attempt = 0; attempt < 2 && (status === 0 || status >= 500); attempt++) {
      try {
        const res = await request.get(url, { timeout: 30_000, maxRedirects: 10, headers: { "user-agent": "Mozilla/5.0 (help-links check)" } });
        status = res.status();
      } catch {
        status = 0;
      }
    }
    if (BLOCKED.has(status)) blocked.push(`${status} ${url}`);
    else if (status === 0 || status >= 400) broken.push(`${status || "no answer"} ${url}`);
  }
  if (blocked.length) console.log(`Blocked automated checks (verify by hand):\n${blocked.join("\n")}`);
  expect(broken, `Broken links:\n${broken.join("\n")}`).toEqual([]);
});

test("the Attorney General's rent-cap page still shows our current cap", async ({ request }) => {
  const latest = RENT_FACTS.periods.at(-1)!;
  const html = await (await request.get("https://oag.ca.gov/rentcaps", { timeout: 30_000 })).text();
  expect(html, `oag.ca.gov/rentcaps no longer shows ${latest.maxPct}%`).toContain(`${latest.maxPct}%`);
});
