// "See something wrong? Tell us": an email link with the page and its
// last-checked date filled in. A plain mailto: link, so nothing is tracked and
// nothing is sent until the person sends the email themselves. Used by the
// Help tools (Sources) and every public page (footer).
import type { Lang } from "../i18n";

/** Where corrections and partner requests go. The only copy of the address. */
export const REPORT_EMAIL = "enrique@enriquecorado.com";

interface ReportCopy {
  link: string;
  /** Said after the link text by screen readers. */
  opensEmail: string;
  subject: (topic: string, date?: string) => string;
  body: (topic: string, date?: string, url?: string) => string;
}

export const REPORT_COPY: Record<Lang, ReportCopy> = {
  en: {
    link: "See something wrong? Tell us",
    opensEmail: "opens your email app",
    subject: (t, d) => (d ? `Correction: ${t} (checked ${d})` : `Correction: ${t}`),
    body: (t, d, url) =>
      [
        `Page: ${t}`,
        ...(url ? [url] : []),
        ...(d ? [`Last checked: ${d}`] : []),
        "",
        "What's wrong:",
        "",
        "",
        "The right information, and where it comes from (if you know):",
        "",
        "",
        "Please don't include private details about your own situation.",
      ].join("\r\n"),
  },
  es: {
    link: "¿Ve algo incorrecto? Avísenos",
    opensEmail: "abre su aplicación de correo",
    subject: (t, d) => (d ? `Corrección: ${t} (revisado el ${d})` : `Corrección: ${t}`),
    body: (t, d, url) =>
      [
        `Página: ${t}`,
        ...(url ? [url] : []),
        ...(d ? [`Revisado por última vez: ${d}`] : []),
        "",
        "Qué está mal:",
        "",
        "",
        "La información correcta y de dónde viene (si lo sabe):",
        "",
        "",
        "Por favor no incluya datos privados de su situación.",
      ].join("\r\n"),
  },
};

/** Percent-encodes everything but letters, digits and -_.~ (encodeURIComponent
 *  leaves !'()* alone, which some mail apps mangle). */
const encode = (text: string) => encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** A mailto: link with every part percent-encoded (RFC 6068), so accents,
 *  "&", "?", apostrophes and line breaks arrive intact in any mail app. */
export function mailto(subject: string, body: string, to = REPORT_EMAIL): string {
  return `mailto:${to}?subject=${encode(subject)}&body=${encode(body)}`;
}

/** The correction link for a page or tool. `date` is already formatted for `lang`. */
export function reportHref(lang: Lang, topic: string, date?: string, url?: string): string {
  const r = REPORT_COPY[lang];
  return mailto(r.subject(topic, date), r.body(topic, date, url));
}
