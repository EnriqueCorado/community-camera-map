// Unit tests for the community & immigrant services pack popups (no browser).
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONSULATE_HOSTS, CONSULATE_ROSTER, mealsOpen, phone, servicePopup, SERVICE_COLORS, SERVICE_LINK_HOSTS } from "../../frontend/src/services-pack";
import { applyFields } from "../../frontend/src/view-logic";
import { safeUrl, WEBCAM_PAGE_HOSTS } from "../../frontend/src/popup-logic";
import type { ViewSpec } from "../../frontend/src/api/client";

const tidy = (s: string) => s;
const row = (rows: [string, string][], label: string) => rows.find(([k]) => k === label)?.[1] ?? "";

test("legal-help popup: Spanish labels, notario warning, official DOJ link", () => {
  const p = servicePopup("immigration-legal-help", { n: "World Relief", o: "Modesto Extension Office", a: "909 14th Street", c: "Modesto", s: "CA", p: "2094912712" }, "es", "es-US", tidy);
  expect(p.title).toBe("World Relief");
  expect(row(p.rows, "Oficina")).toBe("Modesto Extension Office");
  expect(row(p.rows, "Ciudad")).toBe("Modesto, CA");
  expect(row(p.rows, "Teléfono")).toBe("(209) 491-2712");
  expect(row(p.rows, "Nota")).toContain("notario");
  expect(p.link?.href).toMatch(/^https:\/\/www\.justice\.gov\/eoir\//);
  expect(safeUrl(p.link?.href, WEBCAM_PAGE_HOSTS)).not.toBeNull();
});

test("type codes become words; approximate locations are labeled", () => {
  const ice = servicePopup("detention-centers", { n: "Otay Mesa", t: "CDF", fo: "San Diego", pop: 1234 }, "en", "en-US", tidy);
  expect(row(ice.rows, "Type")).toBe("Contract detention facility");
  expect(row(ice.rows, "People held (daily average)")).toBe("1,234");
  expect(ice.link?.href).toBe("https://locator.ice.gov/odls/");
  const ajc = servicePopup("job-centers", { t: "comp", x: 1 }, "en", "en-US", tidy);
  expect(ajc.title).toBe(""); // MapView falls back to the layer title
  expect(row(ajc.rows, "Location")).toContain("Approximate");
  const mh = servicePopup("mental-health", { n: "Clinic", es: 1, sf: 1, t: "both" }, "es", "es-US", tidy);
  expect(row(mh.rows, "Servicios en español")).toBe("Sí");
  expect(row(mh.rows, "También trata")).toBe("Adicciones");
});

test("college links go to College Navigator only for a real IPEDS id", () => {
  expect(servicePopup("colleges", { n: "MJC", u: "117247" }, "en", "en-US", tidy).link?.href).toBe("https://nces.ed.gov/collegenavigator/?id=117247");
  expect(servicePopup("colleges", { n: "X", u: "javascript:alert(1)" }, "en", "en-US", tidy).link).toBeUndefined();
});

test("every pack link host is https-allowlisted and every layer has a color", () => {
  for (const h of SERVICE_LINK_HOSTS) expect(WEBCAM_PAGE_HOSTS).toContain(h);
  // USPS is federal but lives on usps.com.
  expect(SERVICE_LINK_HOSTS.every((h) => /\.(gov|org)$/.test(h) || h === "tools.usps.com")).toBe(true);
  // Consulate hosts stay out of the shared allowlist: each consulate link carries its own country's list.
  const foreign = Object.values(CONSULATE_HOSTS).flat();
  expect(foreign.filter((h) => WEBCAM_PAGE_HOSTS.includes(h))).toEqual([]);
  expect(WEBCAM_PAGE_HOSTS).not.toContain("travel.state.gov");
  expect(Object.keys(SERVICE_COLORS).length).toBeGreaterThanOrEqual(14);
});

test("phone formatting", () => {
  expect(phone("209-575-4585")).toBe("(209) 575-4585");
  expect(phone("1 800 662 4357")).toBe("(800) 662-4357");
  expect(phone("(209) 555-0100 ext 12")).toBe("(209) 555-0100 ext 12");
});

test("summer meals: closed or future sites are dropped by the view cleanup", () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 6, 15, 18);
  expect(mealsOpen({ d0: now - 10 * day, d1: Date.UTC(2026, 6, 15) }, now)).toBe(true); // last day
  expect(mealsOpen({ d0: now - 10 * day, d1: now - 2 * day }, now)).toBe(false);
  expect(mealsOpen({ d0: now + day, d1: now + 9 * day }, now)).toBe(false);
  const spec: ViewSpec = {
    kind: "arcgis", url: "https://x.example/FeatureServer/0", fields: { Site_Name: "n", Start_date: "d0", End_date: "d1" },
    geometry: "point", min_zoom: 10, where: "1=1", max: 2000, simplify: false, refresh_s: 3600, post: "meals",
  };
  const pt = { type: "Point", coordinates: [-95.4, 29.7] };
  const fc = applyFields({ features: [
    { type: "Feature", geometry: pt, properties: { Site_Name: "Open", Start_date: Date.now() - day, End_date: Date.now() + 5 * day } },
    { type: "Feature", geometry: pt, properties: { Site_Name: "Ended", Start_date: Date.now() - 90 * day, End_date: Date.now() - 30 * day } },
  ] }, spec);
  expect(fc.features.map((f) => f.properties?.n)).toEqual(["Open"]);
});

test("hand-kept offices link only to their official source page", () => {
  const court = servicePopup("immigration-offices", { n: "Sacramento Immigration Court", t: "court", pg: "https://www.justice.gov/eoir/sacramento-immigration-court" }, "es", "es-US", tidy);
  expect(row(court.rows, "Tipo")).toBe("Corte de inmigración");
  expect(row(court.rows, "Nota")).toContain("1-800-898-7180");
  expect(safeUrl(court.link?.href, WEBCAM_PAGE_HOSTS)).toBe("https://www.justice.gov/eoir/sacramento-immigration-court");
  expect(servicePopup("immigration-offices", { n: "X", t: "ice", pg: "https://evil.example/" }, "en", "en-US", tidy).link).toBeUndefined();
});

test("help offices: SSA hours and resident stations, LSC areas show program, phone and website", () => {
  const ssa = servicePopup("social-security-offices", { n: "Social Security - Modesto", t: "Resident station (limited services)", d: "Mon-Fri 9:00 AM-4:00 PM", p: "(866) 331-7132" }, "es", "es-US", tidy);
  expect(row(ssa.rows, "Horario")).toBe("Mon-Fri 9:00 AM-4:00 PM");
  expect(row(ssa.rows, "Tipo")).toBe("Oficina auxiliar (servicios limitados)");
  expect(ssa.link?.href).toBe("https://secure.ssa.gov/ICON/main.jsp");
  const lsc = servicePopup("legal-aid-areas", { name: "California Rural Legal Assistance", phone: "(800) 337-0690", web: "https://www.crla.org/", area: "CA-31" }, "en", "en-US", tidy);
  expect(lsc.title).toBe("California Rural Legal Assistance");
  expect(row(lsc.rows, "Phone")).toBe("(800) 337-0690");
  expect(row(lsc.rows, "Website")).toBe("crla.org");
  expect(lsc.link?.href).toContain("lsc.gov");
  // Only https websites are shown.
  expect(row(servicePopup("legal-aid-areas", { name: "X", web: "javascript:alert(1)" }, "en", "en-US", tidy).rows, "Website")).toBe("");
  for (const n of ["social-security-offices", "legal-aid-areas", "post-offices"]) expect(SERVICE_COLORS[n]).toMatch(/^#[0-9a-f]{6}$/);
  expect(SERVICE_LINK_HOSTS).toEqual(expect.arrayContaining(["secure.ssa.gov", "www.lsc.gov", "tools.usps.com"]));
});

test("Care Compare: star ratings, services and ownership in both languages, Medicare link", () => {
  const dialysis = servicePopup("dialysis-facilities", { id: "052526", n: "DAVITA MODESTO DIALYSIS", st: 4, ns: 24, sv: 3, ls: 1, ow: "fp", g: "DaVita", p: "2095270920" }, "en", "en-US", tidy);
  expect(row(dialysis.rows, "Medicare star rating")).toBe("★★★★ 4 of 5");
  expect(row(dialysis.rows, "Services")).toBe("In-center hemodialysis, Peritoneal dialysis (at home)");
  expect(row(dialysis.rows, "Dialysis stations")).toBe("24");
  expect(row(dialysis.rows, "Evening shift (after 5 pm)")).toBe("Yes");
  expect(row(dialysis.rows, "Company")).toBe("DaVita");
  expect(row(dialysis.rows, "Phone")).toBe("(209) 527-0920"); // baked as 10 digits
  expect(row(dialysis.rows, "Ownership")).toBe("For-profit");
  expect(row(dialysis.rows, "Medicare provider number (CCN)")).toBe("052526");
  expect(dialysis.link?.href).toBe("https://www.medicare.gov/care-compare/");
  expect(safeUrl(dialysis.link?.href, WEBCAM_PAGE_HOSTS)).not.toBeNull();

  const hh = servicePopup("home-health-agencies", { n: "VNA", st: 3.5, sv: 1 + 2 + 64, ow: "np" }, "es", "es-US", tidy);
  expect(row(hh.rows, "Calidad de la atención")).toBe("★★★½ 3.5 de 5"); // es-US writes a decimal point
  expect(row(hh.rows, "Encuesta a pacientes")).toBe("Sin calificación");
  expect(row(hh.rows, "Servicios")).toBe("Enfermería, Fisioterapia"); // unknown bits dropped
  expect(row(hh.rows, "Tipo de propiedad")).toBe("Sin fines de lucro");
  expect(row(hh.rows, "Nota")).toContain("código postal");
  expect(hh.link?.label).toBe("Comparar en Care Compare de Medicare");

  const hospice = servicePopup("hospice-providers", { n: "AGAVE HOSPICE", st: 5, id: "javascript:" }, "en", "en-US", tidy);
  expect(row(hospice.rows, "Family survey")).toBe("★★★★★ 5 of 5");
  expect(row(hospice.rows, "Medicare provider number (CCN)")).toBe(""); // only a real 6-character id

  const er = servicePopup("hospital-ratings", { n: "MEMORIAL", t: "cah", er: 1, bf: 1 }, "es", "es-US", tidy);
  expect(row(er.rows, "Calificación de Medicare")).toBe("Sin calificación");
  expect(row(er.rows, "Tipo")).toBe("Hospital de acceso crítico (rural)");
  expect(row(er.rows, "Sala de emergencias")).toBe("Sí");
  expect(row(er.rows, "Buena atención de partos (Medicare)")).toBe("Sí");
  expect(row(servicePopup("hospital-ratings", { n: "PSYCH", t: "psych" }, "en", "en-US", tidy).rows, "Emergency room")).toBe("No");
  // Care Compare fields stay off the other layers' popups.
  expect(row(servicePopup("job-centers", { n: "AJC", st: 4, id: "052526" }, "en", "en-US", tidy).rows, "Medicare provider number (CCN)")).toBe("");
  for (const n of ["dialysis-facilities", "hospice-providers", "home-health-agencies", "hospital-ratings"]) expect(SERVICE_COLORS[n]).toMatch(/^#[0-9a-f]{6}$/);
  expect(SERVICE_LINK_HOSTS).toContain("www.medicare.gov");
});

test("Marketplace assisters: types, hours, languages, area-only sites, HealthCare.gov / CuidadoDeSalud.gov links", () => {
  const p = { n: "Valley Health Center", o: "Downtown", a: "100 Main St", c: "Houston", s: "TX", p: "(209) 555-0100", t: "nav cac evil", l: "English, Spanish, Interpreters", d: "Mon-Fri 8:00 AM-5:00 PM", web: "https://www.valleyhealth.example.org" };
  const en = servicePopup("marketplace-assisters", p, "en", "en-US", tidy);
  expect(en.title).toBe("Valley Health Center");
  expect(row(en.rows, "Type")).toBe("Navigator, Certified application counselor");
  expect(row(en.rows, "Hours")).toBe("Mon-Fri 8:00 AM-5:00 PM");
  expect(row(en.rows, "Website")).toBe("valleyhealth.example.org");
  expect(row(en.rows, "Location")).toBe("");
  expect(row(en.rows, "Note")).toContain("November 1");
  expect(en.link?.href).toBe("https://www.healthcare.gov/find-assistance/");
  const es = servicePopup("marketplace-assisters", p, "es", "es-US", tidy);
  expect(row(es.rows, "Tipo")).toBe("Navegador, Consejero de solicitudes certificado");
  expect(row(es.rows, "Idiomas")).toBe("Inglés, Español, Intérpretes para otros idiomas");
  expect(row(es.rows, "Horario")).toBe("Mon-Fri 8:00 AM-5:00 PM");
  expect(es.link?.href).toBe("https://www.cuidadodesalud.gov/es/find-assistance/");
  // A site CMS lists without a public address says so instead of pinning a place.
  const area = servicePopup("marketplace-assisters", { n: "Covering Texas", t: "nav", x: 2 }, "es", "es-US", tidy);
  expect(row(area.rows, "Ubicación")).toContain("sin dirección pública");
  expect(SERVICE_COLORS["marketplace-assisters"]).toMatch(/^#[0-9a-f]{6}$/);
  expect(SERVICE_LINK_HOSTS).toEqual(expect.arrayContaining(["www.healthcare.gov", "www.cuidadodesalud.gov"]));
  for (const u of [en.link!.href, es.link!.href]) expect(safeUrl(u, WEBCAM_PAGE_HOSTS)).toBe(u);
  // Other layers keep one link in both languages and their "Days" row.
  expect(servicePopup("health-centers", { n: "X" }, "es", "es-US", tidy).link?.href).toBe("https://findahealthcenter.hrsa.gov/");
  expect(row(servicePopup("summer-meals", { n: "X", d: "Mon-Fri" }, "en", "en-US", tidy).rows, "Days")).toBe("Mon-Fri");
});

test("consulates: titles in both languages, official links only, State Department fallback", () => {
  const korea = { cc: "KR", t: "consulate-general", pl: "Los Angeles", a: "3243 Wilshire Blvd", c: "Los Angeles", s: "CA", p: "(213) 385-9300", web: "https://overseas.mofa.go.kr/us-losangeles-en/index.do" };
  const es = servicePopup("consulates", korea, "es", "es-US", tidy);
  expect(es.title).toBe("Consulado General de Corea del Sur en Los Angeles");
  expect(row(es.rows, "Tipo")).toBe("Consulado general");
  expect(row(es.rows, "Teléfono")).toBe("(213) 385-9300");
  expect(row(es.rows, "Sitio web")).toBe("overseas.mofa.go.kr/us-losangeles-en/index.do");
  expect(row(es.rows, "Nota")).toContain("pasaportes");
  expect(es.link).toEqual({ href: korea.web, label: "Página oficial del consulado", hosts: ["overseas.mofa.go.kr"] });
  expect(safeUrl(es.link?.href, es.link!.hosts!)).toBe(korea.web);
  const en = servicePopup("consulates", korea, "en", "en-US", tidy);
  expect(en.title).toBe("Consulate General of the Republic of Korea in Los Angeles");
  expect(row(en.rows, "Note")).toContain("detained");

  // An embassy site on a generic domain is never linked or shown: the State Department page instead.
  const vn = servicePopup("consulates", { cc: "VN", t: "consulate", pl: "New York", web: "https://www.vietnamconsulate-ny.org/" }, "en", "en-US", tidy);
  expect(row(vn.rows, "Website")).toBe("");
  expect(vn.link?.href).toBe("https://travel.state.gov/content/travel/en/consularnotification/ConsularNotificationandAccess/VietNam.html");
  expect(vn.link?.label).toBe("Contact info (U.S. State Department)");
  expect(vn.link?.hosts).toEqual(["travel.state.gov"]);
  expect(safeUrl(vn.link?.href, vn.link!.hosts!)).not.toBeNull();
  // Another country's official host doesn't count either, nor http or look-alike hosts.
  for (const web of ["https://overseas.mofa.go.kr/x", "http://usa.mirex.gob.do/x", "https://usa.mirex.gob.do.evil.example/x", "javascript:alert(1)"]) {
    expect(servicePopup("consulates", { cc: "DO", t: "consulate-general", pl: "Boston", web }, "en", "en-US", tidy).link?.href).toContain("travel.state.gov");
  }
  // No office page: the official appointment site, then the government's own list.
  const ec = servicePopup("consulates", { cc: "EC", t: "consulate", pl: "Miami", ap: "https://citas.cancilleria.gob.ec/" }, "es", "es-US", tidy);
  expect(ec.link?.href).toBe("https://citas.cancilleria.gob.ec/");
  expect(ec.link?.label).toBe("Hacer una cita (sitio oficial)");
  expect(row(ec.rows, "Citas")).toBe("citas.cancilleria.gob.ec");
  const sv = servicePopup("consulates", { cc: "SV", t: "consulate-general", pl: "Doral", dl: "https://rree.gob.sv/directorio-de-consulados/" }, "en", "en-US", tidy);
  expect(sv.link?.label).toBe("Official list of consulates");
  // Embassy consular sections are named after the embassy.
  const cuba = servicePopup("consulates", { cc: "CU", t: "consular-section", pl: "Washington" }, "es", "es-US", tidy);
  expect(cuba.title).toBe("Embajada de Cuba: sección consular");
  expect(row(cuba.rows, "Tipo")).toBe("Sección consular de la embajada");
  expect(SERVICE_COLORS.consulates).toMatch(/^#[0-9a-f]{6}$/);

  // Mexico: 24-hour CIAM line, MiConsulado appointments and the matrícula consular note.
  const mx = { cc: "MX", t: "consulate", pl: "Fresno", a: "7435 N Ingram Ave", c: "Fresno", s: "CA", p: "(559) 233-3065", hl: "(520) 623-7874", ap: "https://citas.sre.gob.mx/", web: "https://consulmex.sre.gob.mx/fresno/" };
  const mxEs = servicePopup("consulates", mx, "es", "es-US", tidy);
  expect(mxEs.title).toBe("Consulado de México en Fresno");
  expect(row(mxEs.rows, "Línea de ayuda 24 horas")).toBe("(520) 623-7874");
  expect(row(mxEs.rows, "Citas")).toBe("citas.sre.gob.mx");
  expect(row(mxEs.rows, "Nota")).toMatch(/^Los consulados de México expiden pasaportes mexicanos y la matrícula consular/);
  expect(mxEs.link?.href).toBe("https://consulmex.sre.gob.mx/fresno/");
  expect(row(servicePopup("consulates", mx, "en", "en-US", tidy).rows, "Note")).toContain("matrícula consular");
  // the help line and Mexico's note never leak into another country's popup
  const gt = servicePopup("consulates", { cc: "GT", t: "consulate", pl: "Del Rio" }, "en", "en-US", tidy);
  expect(row(gt.rows, "Note")).not.toContain("Mexican");
});

test("consulates: every baked office has a named country and a link that passes the allowlist", () => {
  const fc = JSON.parse(readFileSync(join(__dirname, "../../frontend/public/data/layers/consulates.geojson"), "utf8"));
  expect(fc.features.length).toBeGreaterThan(200);
  const countries = new Set<string>();
  for (const f of fc.features) {
    const p = f.properties;
    countries.add(p.cc);
    expect(CONSULATE_ROSTER[p.cc], p.cc).toBeTruthy();
    for (const lang of ["en", "es"] as const) {
      const pop = servicePopup("consulates", p, lang, lang === "es" ? "es-US" : "en-US", tidy);
      expect(pop.title, p.n).not.toMatch(/ (of|de) [A-Z]{2}\b/); // a raw country code: missing name
      expect(pop.link, p.n).toBeDefined();
      // re-checked by the popup against the link's own list (MapView linkHtml)
      expect(pop.link!.hosts, p.n).toBeDefined();
      expect(safeUrl(pop.link!.href, pop.link!.hosts!), `${p.n}: ${pop.link!.href}`).toBe(pop.link!.href);
    }
    // what the data links to is on that country's own allowlist
    for (const k of ["web", "ap", "dl"]) if (p[k]) expect(CONSULATE_HOSTS[p.cc], `${p.n} ${k}`).toContain(new URL(p[k]).hostname);
  }
  expect(countries.has("MX")).toBe(true);
});
