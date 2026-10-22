// Wording for the DACA renewal timing tool, per language. The facts are in
// daca-facts.ts; the date math is in daca.ts.
import type { Lang } from "../i18n";
import type { DacaStatus } from "./daca";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface DacaCopy {
  title: string;
  lead: string;
  private: string;
  dateLabel: string;
  dateHint: string;
  invalidDate: string;
  fillDate: string;
  farDate: string;
  statusTitle: Record<DacaStatus, string>;
  statusText: Record<DacaStatus, Fn<[{ opens: string; ideal: string; expires: string; yearAfter: string }]>>;
  daysLeft: Fn<[number]>;
  window: Fn<[string, string]>;
  nowTitle: string;
  timingTitle: string;
  gatherTitle: string;
  feesTitle: string;
  travelTitle: string;
  scamTitle: string;
  helpTitle: string;
  legalButton: string;
  fileOnline: string;
  uscisPage: string;
  changing: Fn<[string]>;
  /** On "file now", "urgent" and "expired, can renew": when to see a legal service first. */
  beforeFile: string;
}

const en: DacaCopy = {
  title: "When to renew DACA",
  beforeFile: "Before you file: if since your last DACA you were arrested, charged or convicted, went to immigration court, or left the U.S., talk to a free or low-cost legal service first.",
  lead: "Enter the date your DACA expires to see when USCIS wants your renewal, what to send, and what it costs. This is general information from USCIS, not legal advice for your case.",
  private: "The date you enter stays on this device and isn’t saved.",
  dateLabel: "When does your DACA expire?",
  dateHint: "Use the end date on your DACA approval notice (Form I-797). It is usually the same as the “Card Expires” date on your work permit.",
  invalidDate: "Check the date: it isn’t a real DACA expiration date.",
  fillDate: "Enter the date to see your renewal window.",
  farDate: "That date is more than three years away, but DACA is granted for two years. Check the date on your notice.",
  statusTitle: {
    "too-early": "Too early to file",
    "file-now": "File your renewal now",
    urgent: "File as soon as you can",
    "expired-renew": "Your DACA has expired: you can still renew",
    "expired-initial": "It has been more than a year: talk to a legal service first",
  },
  statusText: {
    "too-early": ({ opens, ideal }) =>
      `USCIS may send back a renewal filed more than 150 days early. Get your papers ready, and file between ${opens} and ${ideal}.`,
    "file-now": ({ ideal }) => `You are in USCIS’s recommended window. Try to file by ${ideal}.`,
    urgent: ({ expires }) =>
      `You are past USCIS’s recommended window, so your DACA and work permit may expire on ${expires} before the renewal is approved. File right away, and plan for a possible gap in work authorization.`,
    "expired-renew": ({ yearAfter }) =>
      `You can still file a renewal (not a new request) if USCIS did not end your DACA, but you must file before ${yearAfter}, one year after it expired. Until the renewal is approved you can’t work, and unless you are under 18 when you file, you build up “unlawful presence”. Talk to a legal service soon.`,
    "expired-initial": () =>
      "USCIS says that more than one year after DACA expires, you would have to file a new initial request, and USCIS is not deciding initial requests now. Talk to a free or low-cost legal service before you file anything or pay anyone.",
  },
  daysLeft: (n) => (n === 0 ? "Your DACA expires today." : n > 0 ? `${n} days until your DACA expires.` : `Your DACA expired ${-n} days ago.`),
  window: (opens, ideal) => `USCIS’s recommended window: ${opens} to ${ideal}.`,
  nowTitle: "Where DACA stands right now",
  timingTitle: "Timing, and what happens if it lapses",
  gatherTitle: "What to gather for a renewal",
  feesTitle: "What it costs",
  travelTitle: "Before you travel",
  scamTitle: "Watch out for scams",
  helpTitle: "Free and low-cost help with DACA renewals",
  legalButton: "See all free legal help near you",
  fileOnline: "File online with a USCIS account",
  uscisPage: "USCIS: DACA (official page)",
  changing: (d) => `DACA is being decided in court, so this can change. Last checked ${d}.`,
};

const es: DacaCopy = {
  title: "Cuándo renovar DACA",
  beforeFile: "Antes de presentarla: si desde su último DACA lo arrestaron, le hicieron cargos o lo condenaron, tuvo corte de inmigración o salió de EE. UU., hable primero con un servicio legal gratis o de bajo costo.",
  lead: "Escriba la fecha en que caduca su DACA para ver cuándo USCIS quiere su renovación, qué enviar y cuánto cuesta. Es información general de USCIS, no consejo legal para su caso.",
  private: "La fecha que escriba se queda en este aparato y no se guarda.",
  dateLabel: "¿Cuándo caduca su DACA?",
  dateHint: "Use la fecha final de su aviso de aprobación de DACA (formulario I-797). Casi siempre es la misma que la fecha “Card Expires” de su permiso de trabajo.",
  invalidDate: "Revise la fecha: no es una fecha de vencimiento de DACA válida.",
  fillDate: "Escriba la fecha para ver cuándo renovar.",
  farDate: "Esa fecha es en más de tres años, pero DACA se da por dos años. Revise la fecha en su aviso.",
  statusTitle: {
    "too-early": "Todavía es muy pronto para presentarla",
    "file-now": "Presente su renovación ahora",
    urgent: "Preséntela lo antes posible",
    "expired-renew": "Su DACA caducó: todavía puede renovarla",
    "expired-initial": "Ya pasó más de un año: hable primero con un servicio legal",
  },
  statusText: {
    "too-early": ({ opens, ideal }) =>
      `USCIS puede devolver una renovación presentada más de 150 días antes. Prepare sus papeles y preséntela entre el ${opens} y el ${ideal}.`,
    "file-now": ({ ideal }) => `Está en el periodo que recomienda USCIS. Trate de presentarla a más tardar el ${ideal}.`,
    urgent: ({ expires }) =>
      `Ya pasó el periodo que recomienda USCIS, así que su DACA y su permiso de trabajo pueden caducar el ${expires} antes de que aprueben la renovación. Preséntela enseguida, y prepárese por si se queda un tiempo sin permiso de trabajo.`,
    "expired-renew": ({ yearAfter }) =>
      `Todavía puede presentar una renovación (no una petición nueva) si USCIS no canceló su DACA, pero debe presentarla antes del ${yearAfter}, un año después de que caducó. Hasta que aprueben la renovación no puede trabajar, y, a menos que tenga menos de 18 años al presentarla, acumula “presencia ilegal”. Hable pronto con un servicio legal.`,
    "expired-initial": () =>
      "USCIS dice que, cuando ha pasado más de un año desde que caducó DACA, hay que presentar una nueva petición inicial, y USCIS no está decidiendo peticiones iniciales ahora. Hable con un servicio legal gratis o de bajo costo antes de presentar algo o pagarle a alguien.",
  },
  daysLeft: (n) => (n === 0 ? "Su DACA caduca hoy." : n > 0 ? `Faltan ${n} días para que caduque su DACA.` : `Su DACA caducó hace ${-n} días.`),
  window: (opens, ideal) => `Periodo que recomienda USCIS: del ${opens} al ${ideal}.`,
  nowTitle: "Cómo está DACA ahora",
  timingTitle: "Los plazos, y qué pasa si caduca",
  gatherTitle: "Qué reunir para la renovación",
  feesTitle: "Cuánto cuesta",
  travelTitle: "Antes de viajar",
  scamTitle: "Cuidado con las estafas",
  helpTitle: "Ayuda gratis o de bajo costo con la renovación de DACA",
  legalButton: "Ver toda la ayuda legal gratis cerca de usted",
  fileOnline: "Presentar en línea con una cuenta de USCIS (en inglés)",
  uscisPage: "USCIS: DACA (página oficial en español)",
  changing: (d) => `El caso de DACA está en las cortes, así que esto puede cambiar. Revisado por última vez el ${d}.`,
};

export const DACA_COPY: Record<Lang, DacaCopy> = { en, es };
