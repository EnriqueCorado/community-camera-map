// Unit tests for the community & immigrant services pack popups (no browser).
import { test, expect } from "@playwright/test";
import { hudProgram, mealsOpen, orgName, phone, servicePopup, SERVICE_COLORS, SERVICE_LINK_HOSTS } from "../../frontend/src/services-pack";
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

test("HUD-assisted apartments: who it's for, program, rent-help apartments, ZIP and the HUD locator", () => {
  const p = { n: "Parkview Christian Estates", a: "3112 NAPIER DR", c: "Modesto                     ", s: "CA", z: "95350", p: "(209) 521-0860", t: "Elderly", pr: "202/8 NC", un: 60, ut: 98, g: "Foundation Property Management, Inc." };
  const es = servicePopup("hud-multifamily", p, "es", "es-US", tidy);
  expect(es.title).toBe("Parkview Christian Estates");
  expect(row(es.rows, "Para quién es")).toBe("Personas mayores");
  expect(row(es.rows, "Programa")).toBe("Sección 202 (personas mayores)");
  expect(row(es.rows, "Con ayuda para la renta")).toBe("60");
  expect(row(es.rows, "Apartamentos")).toBe("98");
  expect(row(es.rows, "Ciudad")).toBe("Modesto, CA 95350");
  expect(row(es.rows, "Teléfono")).toBe("(209) 521-0860");
  expect(row(es.rows, "Administrado por")).toBe("Foundation Property Management, Inc.");
  expect(row(es.rows, "Nota")).toContain("lista de espera");
  expect(es.link?.href).toBe("https://resources.hud.gov/");
  expect(safeUrl(es.link?.href, WEBCAM_PAGE_HOSTS)).toBe("https://resources.hud.gov/");
  const en = servicePopup("hud-multifamily", { ...p, t: "Family", pr: "LMSA", g: "Todd Byers" }, "en", "en-US", tidy);
  expect(row(en.rows, "Who it’s for")).toBe("Families and individuals");
  expect(row(en.rows, "Program")).toBe("Section 8 (project-based)");
  expect(row(en.rows, "Managed by")).toBe(""); // a person's name is never shown
  expect(SERVICE_COLORS["hud-multifamily"]).toMatch(/^#[0-9a-f]{6}$/);
  expect(SERVICE_COLORS["usda-rural-rentals"]).toMatch(/^#[0-9a-f]{6}$/);
});

test("HUD program codes in plain words; insurance-only codes show nothing", () => {
  const en = (c: string) => hudProgram(c, "en");
  expect(en("RAD PRAC Conv")).toBe("Section 8 (converted under RAD)");
  expect(en("PRAC/811")).toBe("Section 811 (people with disabilities)");
  expect(en("811 PRA DEMO")).toBe("Section 811 (people with disabilities)");
  expect(en("515/8 NC")).toBe("Section 8 + USDA Section 515");
  expect(en("SPRAC")).toBe("Section 202 (seniors)");
  expect(en("PRAC/202")).toBe("Section 202 (seniors)");
  for (const c of ["202/162 NC", "PAC/202"]) expect(en(c)).toBe("Section 202 (people with disabilities)");
  for (const c of ["Sec 8 NC", "HFDA/8 SR", "PD/8 Existing", "Preservation", "Section 8"]) expect(en(c)).toBe("Section 8 (project-based)");
  for (const c of ["S 221(d)(4)", "BMIR", "", "223(f) Refi/ Purchase Apts"]) expect(en(c)).toBe("");
  expect(hudProgram(null, "es")).toBe("");
});

test("management agents: organizations kept, people (and, for USDA, their phones) dropped", () => {
  for (const n of ["BUCKINGHAM PROP MGMT", "INTERSTATE REALTY MANAGEMENT CO.", "CIC OAKRIDGE LP", "Ellis & Ellis, PLLC", "RIVER FALLS H/A", "AWI MANAGEMENT COMPANY", "Volunteers of America Housing", "SPM, LLC", "CARE, INC.", "BIGGS, INC DBA BIGGS PROPERTY MGMT", "HOUSING AUTHORITY-STATESVILLE"]) {
    expect(orgName(n), n).not.toBe("");
  }
  for (const n of ["MILLER, GLENN D", "Todd Byers", "J. L. GRAY", "PARK, JUNG", "JOHN DOE TRUST", "Urban ManagementINC./Robert Ercolini", "Acme Housing c/o Jane Roe", "CHURCH, JANET", "HOMES, ANA M", "Janet Church", "ROBERT CHURCH", "JOHN DOE LIVING TRUST",
    "B & G PARTNERSHIP % BALDUS, ANDREA", "CHILHOWEE SCH, INC % MICHAEL TER", "MOLINE MGMT GROUP DBA RON MOLINE", "BENCHMARK REAL ESTATE, JO T",
    "Acme Housing / J. Roe", "Acme Housing - Jane Roe", "Acme Mgmt (Jane Roe)", "Jane Roe, Acme Management", "APC Management / A Division of Art Pugsley Constru", "", null]) {
    expect(orgName(n), String(n)).toBe("");
  }
  const spec = (post: string): ViewSpec => ({
    kind: "arcgis", url: "https://x.example/FeatureServer/0", fields: { NAME: "n", AGENT: "g", PHONE: "p" },
    geometry: "point", min_zoom: 8, where: "1=1", max: 2000, simplify: false, refresh_s: 3600, post,
  });
  const pt = { type: "Point", coordinates: [-120.9, 37.6] };
  const json = { features: [
    { type: "Feature", geometry: pt, properties: { NAME: "Garden Apts", AGENT: "MILLER, GLENN D", PHONE: "5595550100" } },
    { type: "Feature", geometry: pt, properties: { NAME: "Oakdale Apts", AGENT: "AWI MANAGEMENT COMPANY", PHONE: "5307456170" } },
  ] };
  // A person's name never reaches the map, and neither does the phone beside it
  // (USDA's is the agent's own; a HUD "on-site" line is often the owner's).
  const usda = applyFields(json, spec("mgmt")).features.map((f) => f.properties ?? {});
  expect(usda[0]).toEqual({ n: "Garden Apts", g: null, p: null });
  expect(usda[1]).toEqual({ n: "Oakdale Apts", g: "AWI MANAGEMENT COMPANY", p: "5307456170" });
  const rural = servicePopup("usda-rural-rentals", { n: "SUNRISE VISTA APTS", t: "EL - Elderly", un: 18, ut: 24, ...usda[1] }, "es", "es-US", tidy);
  expect(row(rural.rows, "Para quién es")).toBe("Personas mayores y con discapacidad");
  expect(row(rural.rows, "Con ayuda para la renta")).toBe("18");
  expect(row(rural.rows, "Teléfono")).toBe("(530) 745-6170");
  expect(row(rural.rows, "Programa")).toBe("");
  expect(rural.link?.href).toBe("https://rdmfhrentals.sc.egov.usda.gov/");
  expect(safeUrl(rural.link?.href, WEBCAM_PAGE_HOSTS)).not.toBeNull();
});
