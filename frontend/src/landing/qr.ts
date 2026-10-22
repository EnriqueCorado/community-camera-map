// QR codes for the printed flyers, drawn at build time as one SVG path (no
// script or image request on the page). Error correction "M" survives smudges
// and folds on paper; the 4-module quiet zone is what scanners expect.
import qrcode from "qrcode-generator";

export interface Qr {
  /** Width and height in modules, quiet zone included. */
  size: number;
  /** SVG path data, one module = one unit. */
  path: string;
}

const QUIET = 4;

export function qr(text: string): Qr {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const n = code.getModuleCount();
  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!code.isDark(r, c)) continue;
      // Merge each horizontal run of dark modules into one rectangle.
      let run = 1;
      while (c + run < n && code.isDark(r, c + run)) run++;
      path += `M${c + QUIET} ${r + QUIET}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  return { size: n + QUIET * 2, path };
}
