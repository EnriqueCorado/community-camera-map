// Unit tests for the eviction deadline helper's pure logic (no browser):
// court holidays, court-day and calendar-day counting, how delivery changes
// the start date, the safe (earliest) choice where the law is unsettled, and
// refusing to guess outside 2026–2027. Expected dates come from the eviction
// research (checked 2026-10-21) and its worked examples.
import { test, expect } from "@playwright/test";
import {
  addCourtDays,
  countCalendarDays,
  countCourtDays,
  COURT_HOLIDAYS,
  COVERED_TO,
  DISPUTED_DAYS,
  holidayOn,
  isCourtDay,
  nextCourtDay,
} from "../../frontend/src/help/court-days";
import { evictionDeadline, urgency, daysLeft, DELIVERIES, NOTICE_KINDS, type Deadline } from "../../frontend/src/help/eviction";
import { EVICTION_COPY } from "../../frontend/src/help/eviction-copy";
import { EVICTION_FACTS, EVICTION_SOURCES } from "../../frontend/src/help/eviction-facts";
import { addDays, dayNumber, daysBetween, todayIso } from "../../frontend/src/help/dates";

// The research's holiday table, typed in again here on purpose so a typo in
// court-days.ts can't hide. Farmworkers Day 2027 (Apr 9 vs Mar 31) is disputed
// and is counted as a court day (the safer, earlier deadline).
const RESEARCH_HOLIDAYS = [
  "2026-01-01", "2026-01-19", "2026-02-12", "2026-02-16", "2026-03-31", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-09-25", "2026-11-11", "2026-11-26", "2026-11-27", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-12", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05",
  "2027-09-06", "2027-09-24", "2027-11-11", "2027-11-25", "2027-11-26", "2027-12-24", "2027-12-31",
];

/** A deliberately simple, separate court-day counter for cross-checking. */
function refCourtDays(start: string, n: number): string | null {
  let d = start;
  let k = 0;
  while (k < n) {
    d = addDays(d, 1)!;
    if (d > "2027-12-31") return null;
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !RESEARCH_HOLIDAYS.includes(d)) k++;
  }
  return d;
}

function ok(r: Deadline) {
  if (!r.ok) throw new Error(`expected a deadline, got ${r.reason}`);
  return r;
}

// ------------------------------------------------------------ holidays

test.describe("court holidays 2026–2027", () => {
  test("match the research table exactly", () => {
    expect(COURT_HOLIDAYS.map((h) => h.date)).toEqual(RESEARCH_HOLIDAYS);
  });

  test("every holiday is an observed weekday and not a court day, in both years", () => {
    for (const date of RESEARCH_HOLIDAYS) {
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
      expect(wd, date).toBeGreaterThanOrEqual(1);
      expect(wd, date).toBeLessThanOrEqual(5);
      expect(isCourtDay(date), date).toBe(false);
      const h = holidayOn(date)!;
      expect(h.en.length, date).toBeGreaterThan(3);
      expect(h.es.length, date).toBeGreaterThan(3);
    }
  });

  test("every holiday is skipped by a 1-court-day count from the day before", () => {
    for (const date of RESEARCH_HOLIDAYS) {
      const before = addDays(date, -1)!;
      if (before < "2026-01-01") continue;
      const next = addCourtDays(before, 1);
      if (next === null) {
        expect(date).toBe("2027-12-31"); // the next court day is in 2028
        continue;
      }
      expect(next > date, `${before} + 1 court day skipped ${date}`).toBe(true);
      expect(countCourtDays(before, 1)!.holidays.map((h) => h.date)).toContain(date);
    }
  });

  test("Juneteenth is a court holiday; Columbus Day and Admission Day are not", () => {
    expect(isCourtDay("2026-06-19")).toBe(false);
    expect(isCourtDay("2027-06-18")).toBe(false); // observed (June 19 is a Saturday)
    expect(isCourtDay("2026-10-12")).toBe(true); // Columbus Day
    expect(isCourtDay("2026-09-09")).toBe(true); // Admission Day
    expect(isCourtDay("2026-04-03")).toBe(true); // Good Friday is not a full holiday
  });

  test("disputed Farmworkers Day 2027 dates are counted as court days (earlier deadline)", () => {
    expect(DISPUTED_DAYS.map((d) => d.date)).toEqual(["2027-03-31", "2027-04-09"]);
    expect(isCourtDay("2027-03-31")).toBe(true);
    expect(isCourtDay("2027-04-09")).toBe(true);
    const c = countCourtDays("2027-03-30", 10)!;
    expect(c.end).toBe("2027-04-13");
    expect(c.disputed.map((d) => d.date)).toEqual(["2027-03-31", "2027-04-09"]);
  });

  test("weekends are never court days", () => {
    expect(isCourtDay("2026-10-24")).toBe(false); // Sat
    expect(isCourtDay("2026-10-25")).toBe(false); // Sun
    expect(isCourtDay("2027-01-02")).toBe(false); // Sat
    expect(isCourtDay("2026-10-26")).toBe(true); // Mon
  });
});

// ------------------------------------------------------------ counting

test.describe("court-day counting", () => {
  test("the start day never counts; Day 1 is the next court day", () => {
    expect(addCourtDays("2026-10-21", 1)).toBe("2026-10-22");
    expect(addCourtDays("2026-10-23", 1)).toBe("2026-10-26"); // Fri -> Mon
    expect(addCourtDays("2026-10-24", 1)).toBe("2026-10-26"); // Sat start
  });

  test("matches an independent counter for every start date in 2026–2027 (1, 3, 5, 10, 15 days)", () => {
    for (let d = "2026-01-01"; d <= "2027-12-31"; d = addDays(d, 1)!) {
      for (const n of [1, 3, 5, 10, 15]) {
        expect(addCourtDays(d, n), `${d} + ${n}`).toBe(refCourtDays(d, n));
      }
    }
  });

  test("lists each counted day, weekends and holidays skipped", () => {
    const c = countCourtDays("2026-11-24", 3)!; // Tue before Thanksgiving
    expect(c.counted).toEqual(["2026-11-25", "2026-11-30", "2026-12-01"]);
    expect(c.holidays.map((h) => h.date)).toEqual(["2026-11-26", "2026-11-27"]);
    expect(c.weekendDays).toBe(2);
  });

  test("crosses the year boundary using both years' holidays", () => {
    expect(addCourtDays("2026-12-23", 3)).toBe("2026-12-29"); // Christmas skipped
    expect(addCourtDays("2026-12-30", 3)).toBe("2027-01-05"); // New Year's skipped
    expect(addCourtDays("2027-12-27", 3)).toBe("2027-12-30");
  });

  test("refuses (null) outside 2026–2027 instead of guessing", () => {
    expect(isCourtDay("2025-12-31")).toBeNull();
    expect(isCourtDay("2028-01-03")).toBeNull();
    expect(addCourtDays("2025-12-31", 3)).toBeNull();
    expect(addCourtDays("2028-01-03", 3)).toBeNull();
    expect(addCourtDays("2027-12-28", 3)).toBeNull(); // would need 2028's holidays
    expect(addCourtDays("2026-02-30", 3)).toBeNull(); // not a real date
    expect(addCourtDays("2026-10-21", 0)).toBeNull();
    expect(countCalendarDays("2027-12-01", 60)).toBeNull();
    expect(nextCourtDay("2027-12-31")).toBeNull();
  });
});

test.describe("calendar-day counting", () => {
  test("counts every day and rolls a weekend/holiday last day to the next court day", () => {
    const c = countCalendarDays("2026-10-27", 30)!; // day 30 is Thanksgiving
    expect(c.rolledFrom).toBe("2026-11-26");
    expect(c.end).toBe("2026-11-30");
    expect(c.holidays.map((h) => h.date)).toEqual(["2026-11-26", "2026-11-27"]);
    expect(c.weekendDays).toBe(2);
  });

  test("a weekend last day rolls to Monday; a weekday stays", () => {
    expect(countCalendarDays("2026-10-01", 30)!.end).toBe("2026-11-02"); // Oct 31 is Sat
    expect(countCalendarDays("2026-10-01", 30)!.rolledFrom).toBe("2026-10-31");
    expect(countCalendarDays("2026-10-05", 30)!.end).toBe("2026-11-04");
    expect(countCalendarDays("2026-10-05", 30)!.rolledFrom).toBeUndefined();
  });
});

// ------------------------------------------------------------ notices

test.describe("eviction notices", () => {
  test("research worked examples", () => {
    expect(ok(evictionDeadline("pay-or-quit", "hand", "2026-10-23")).deadline).toBe("2026-10-28"); // AG
    expect(ok(evictionDeadline("pay-or-quit", "hand", "2026-09-04")).deadline).toBe("2026-09-10"); // DRE p.98
    expect(ok(evictionDeadline("pay-or-quit", "hand", "2026-11-24")).deadline).toBe("2026-12-01");
    expect(ok(evictionDeadline("quit-no-cure", "hand", "2026-10-22")).deadline).toBe("2026-10-26");
    expect(ok(evictionDeadline("60-day", "hand", "2026-07-16")).deadline).toBe("2026-09-14"); // DRE p.72
  });

  test("3-day pay and perform notices use court days; 3-day quit uses calendar days", () => {
    const pay = ok(evictionDeadline("pay-or-quit", "hand", "2026-10-22"));
    const perform = ok(evictionDeadline("perform-or-quit", "hand", "2026-10-22"));
    const quit = ok(evictionDeadline("quit-no-cure", "hand", "2026-10-22"));
    expect(pay.method).toBe("court");
    expect(pay.deadline).toBe("2026-10-27"); // Fri, Mon, Tue
    expect(perform.deadline).toBe("2026-10-27");
    expect(quit.method).toBe("calendar");
    expect(quit.deadline).toBe("2026-10-26"); // Sun rolls to Mon
    expect(quit.count.rolledFrom).toBe("2026-10-25");
  });

  test("30, 60 and 90 days are calendar days with rollover", () => {
    expect(ok(evictionDeadline("30-day", "hand", "2026-10-05")).deadline).toBe("2026-11-04");
    expect(ok(evictionDeadline("60-day", "hand", "2026-10-05")).deadline).toBe("2026-12-04");
    expect(ok(evictionDeadline("90-day", "hand", "2026-10-05")).deadline).toBe("2027-01-04"); // Jan 3 is Sun
  });

  test("posted or left + mailed: counts from that date, no +5 days, and says it may be later", () => {
    for (const how of ["posted", "left"] as const) {
      const r = ok(evictionDeadline("pay-or-quit", how, "2026-10-23"));
      expect(r.deadline).toBe("2026-10-28");
      expect(r.start).toBe("2026-10-23");
      expect(r.notes).toEqual(expect.arrayContaining(["noFivePlus", "maybeLaterSubstituted"]));
      const thirty = ok(evictionDeadline("30-day", how, "2026-10-05"));
      expect(thirty.deadline).toBe("2026-11-04"); // not Nov 9
    }
  });

  test("notices posted in 2027 are still counted (AB 747 only changes court-paper service)", () => {
    expect(ok(evictionDeadline("pay-or-quit", "posted", "2027-03-05")).deadline).toBe("2027-03-10");
  });

  test("mail only: no +5 days; a 3-day notice is flagged, a 30/60/90-day notice says it may be later", () => {
    const three = ok(evictionDeadline("pay-or-quit", "mailed", "2026-10-23"));
    expect(three.deadline).toBe("2026-10-28");
    expect(three.notes).toContain("mailOnly3Day");
    expect(three.notes).toContain("noFivePlus");
    const sixty = ok(evictionDeadline("60-day", "mailed", "2026-07-16"));
    expect(sixty.deadline).toBe("2026-09-14");
    expect(sixty.notes).toEqual(expect.arrayContaining(["noFivePlus", "maybeLaterCertified", "tenancyEndsLater"]));
  });

  test("email/text is flagged as not valid service but still counted from that day", () => {
    const r = ok(evictionDeadline("pay-or-quit", "electronic", "2026-10-23"));
    expect(r.deadline).toBe("2026-10-28");
    expect(r.notes).toContain("notValidService");
  });

  test("90-day notices mention the Section 8 / foreclosure rules", () => {
    expect(ok(evictionDeadline("90-day", "hand", "2026-10-05")).notes).toContain("subsidized90");
  });

  test("a disputed holiday inside a count adds a warning", () => {
    expect(ok(evictionDeadline("pay-or-quit", "hand", "2027-04-07")).deadline).toBe("2027-04-12"); // Apr 8, 9, 12
    expect(ok(evictionDeadline("pay-or-quit", "hand", "2027-04-07")).notes).toContain("disputedHoliday");
    expect(ok(evictionDeadline("pay-or-quit", "hand", "2027-05-03")).notes).not.toContain("disputedHoliday");
  });

  test("out of range or bad dates are refused", () => {
    expect(evictionDeadline("pay-or-quit", "hand", "2025-12-31")).toEqual({ ok: false, reason: "out-of-range" });
    expect(evictionDeadline("pay-or-quit", "hand", "2028-01-04")).toEqual({ ok: false, reason: "out-of-range" });
    expect(evictionDeadline("90-day", "hand", "2027-11-01")).toEqual({ ok: false, reason: "out-of-range" });
    expect(evictionDeadline("pay-or-quit", "hand", "2027-12-28")).toEqual({ ok: false, reason: "out-of-range" });
    expect(evictionDeadline("pay-or-quit", "hand", "not a date")).toEqual({ ok: false, reason: "invalid" });
    expect(evictionDeadline("pay-or-quit", "hand", "2026-13-01")).toEqual({ ok: false, reason: "invalid" });
  });

  test("every kind and delivery gives a deadline on a court day, never before the start", () => {
    for (const kind of NOTICE_KINDS) {
      for (const how of DELIVERIES) {
        for (const start of ["2026-01-02", "2026-06-15", "2026-11-24", "2026-12-18"]) {
          const r = evictionDeadline(kind, how, start);
          if (!r.ok) throw new Error(`${kind}/${how}/${start}: ${r.reason}`);
          expect(isCourtDay(r.deadline), `${kind}/${how}/${start}`).toBe(true);
          expect(daysBetween(start, r.deadline)!).toBeGreaterThanOrEqual(r.days);
        }
      }
    }
  });
});

// ------------------------------------------------------------ court papers

test.describe("court papers (Summons and Complaint)", () => {
  test("handed to you: 10 court days (research example)", () => {
    const r = ok(evictionDeadline("summons", "hand", "2026-10-21"));
    expect(r.deadline).toBe("2026-11-04");
    expect(r.count.counted).toHaveLength(10);
    expect(r.method).toBe("court");
  });

  test("Veterans Day and Thanksgiving are skipped", () => {
    // Nov 2: 3,4,5,6,9,10,12,13,16,17 (Nov 11 skipped)
    expect(ok(evictionDeadline("summons", "hand", "2026-11-02")).deadline).toBe("2026-11-17");
    // Nov 20: 23,24,25,30, Dec 1,2,3,4,7,8 (Nov 26-27 skipped)
    expect(ok(evictionDeadline("summons", "hand", "2026-11-20")).deadline).toBe("2026-12-08");
  });

  test("left with someone or posted + mailed: complete 10 days after mailing, then 10 court days", () => {
    for (const how of ["left", "posted"] as const) {
      const r = ok(evictionDeadline("summons", how, "2026-10-21"));
      expect(r.serviceComplete).toBe("2026-10-31"); // Saturday; no roll
      expect(r.deadline).toBe("2026-11-16"); // Veterans Day skipped
      expect(r.method).toBe("calendar-then-court");
      expect(r.notes).toContain("summonsComplete");
    }
  });

  test("crosses into 2027 for hand delivery", () => {
    expect(ok(evictionDeadline("summons", "hand", "2026-12-21")).deadline).toBe("2027-01-06");
    expect(ok(evictionDeadline("summons", "left", "2026-12-21")).deadline).toBe("2027-01-15");
  });

  test("left/posted papers whose service completes on or after 2027-01-01 are refused (AB 747)", () => {
    expect(evictionDeadline("summons", "left", "2026-12-22")).toEqual({ ok: false, reason: "rules-change-2027" });
    expect(evictionDeadline("summons", "posted", "2027-02-01")).toEqual({ ok: false, reason: "rules-change-2027" });
    expect(ok(evictionDeadline("summons", "hand", "2027-02-01")).deadline).toBe("2027-02-17"); // Lincoln + Presidents skipped
  });

  test("mail only: no extra 5 court days (earliest), with a may-be-later note", () => {
    const r = ok(evictionDeadline("summons", "mailed", "2026-10-21"));
    expect(r.deadline).toBe("2026-11-04");
    expect(r.notes).toContain("summonsMail");
  });

  test("late December 2027 needs 2028 holidays and is refused", () => {
    expect(evictionDeadline("summons", "hand", "2027-12-20")).toEqual({ ok: false, reason: "out-of-range" });
  });
});

// ------------------------------------------------------------ urgency + data

test.describe("urgency, copy and facts", () => {
  test("3 days or less left is urgent; today and past are flagged", () => {
    expect(urgency(-1)).toBe("passed");
    expect(urgency(0)).toBe("today");
    expect(urgency(1)).toBe("soon");
    expect(urgency(3)).toBe("soon");
    expect(urgency(4)).toBe("later");
    expect(daysLeft("2026-10-26", "2026-10-28")).toBe(2);
  });

  test("todayIso uses the visitor's local date", () => {
    expect(todayIso(new Date(2026, 9, 26, 23, 59))).toBe("2026-10-26");
    expect(todayIso(new Date(2026, 9, 27, 0, 1))).toBe("2026-10-27");
  });

  test("both languages have every string", () => {
    for (const lang of ["en", "es"] as const) {
      const t = EVICTION_COPY[lang];
      for (const k of [...NOTICE_KINDS, "unsure"] as const) expect(t.kinds[k].label.length).toBeGreaterThan(3);
      for (const d of DELIVERIES) expect(t.deliveries[d].length).toBeGreaterThan(3);
      for (const n of Object.values(t.notes)) expect(n.length).toBeGreaterThan(10);
    }
    expect(EVICTION_COPY.es.legalBtn).not.toBe(EVICTION_COPY.en.legalBtn);
  });

  test("facts carry citations and only https sources; the phone numbers are the researched ones", () => {
    for (const f of [...Object.values(EVICTION_FACTS.notices), ...EVICTION_FACTS.afterNotice, ...EVICTION_FACTS.summonsSteps, ...EVICTION_FACTS.rights]) {
      expect(f.cite.length, f.id).toBeGreaterThan(2);
      expect(f.en.length).toBeGreaterThan(20);
      expect(f.es.length).toBeGreaterThan(20);
    }
    for (const s of EVICTION_SOURCES) expect(s.url).toMatch(/^https:\/\//);
    expect(EVICTION_FACTS.places.crla.phone).toBe("(209) 577-3811");
    expect(EVICTION_FACTS.places.selfHelp.phone).toBe("(209) 548-6237");
    expect(EVICTION_FACTS.places.turlock.address).toContain("300 Starr Ave");
    expect(JSON.stringify(EVICTION_FACTS)).not.toContain("530-3178"); // small claims, not landlord-tenant
  });

  test("holiday list still covers at least the next 60 days (add next year's list)", () => {
    expect(daysBetween(todayIso(), COVERED_TO)!, "add the next year's Judicial Council holidays to court-days.ts").toBeGreaterThan(60);
    expect(dayNumber(COVERED_TO)).not.toBeNull();
  });
});
