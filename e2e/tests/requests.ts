// Shared by the "nothing is sent" checks: the requests a Help tool made beyond
// loading the app (code, styles, fonts, images, data, map tiles). The one
// allowed exception is the anonymous usage counter (when the build has it): a
// POST to /api/count whose whole body is a tool's name, never anything typed.
import type { Request } from "@playwright/test";

const ASSET = /\.(js|css|woff2?|png|svg|json|pbf)(\?|$)/;
const COUNT_EVENT = /^app:[a-z-]+(\/[a-z-]+)?:(en|es)$/;

export const isCount = (r: Request) => {
  const u = new URL(r.url());
  return u.pathname === "/api/count" && u.search === "" && r.method() === "POST" && COUNT_EVENT.test(r.postData() ?? "");
};

/** Requests that aren't assets, tiles or the counter's one event. */
export const unexpected = (sent: Request[]) => sent.filter((r) => !ASSET.test(r.url()) && !r.url().includes("tiles") && !isCount(r));
