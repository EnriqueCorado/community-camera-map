// Wording for the "What do you need help with?" chooser and the Share
// controls, per language. Used by the Help panel and the public pages.
import type { Lang } from "../i18n";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface StartCopy {
  startTitle: string;
  startQuestion: string;
  startHint: string;
  shareTitle: string;
  shareLead: string;
  sharePageLead: string;
  whatsapp: string;
  copy: string;
  copied: string;
  copyFailed: string;
  /** Public pages: the link follows this text. */
  copyFailedPage: string;
  linkLabel: string;
  native: string;
  shortLink: string;
  /** The message sent with the link. `name`: the tool's name, when known. */
  message: Fn<[string?]>;
}

const en: StartCopy = {
  startTitle: "Not sure where to start?",
  startQuestion: "What do you need help with?",
  startHint: "Pick the one that fits best. You can switch to another tool at any time.",
  shareTitle: "Share this",
  shareLead: "Know someone who needs this? Send them the link. Nothing you typed is in it.",
  sharePageLead: "Know someone who needs this? Send them the link.",
  whatsapp: "Send on WhatsApp",
  copy: "Copy link",
  copied: "Link copied. You can paste it in a text or email.",
  copyFailed: "Couldn’t copy. Select the link below and copy it.",
  copyFailedPage: "Couldn’t copy. Here is the link to copy:",
  linkLabel: "Link to share",
  native: "Share…",
  shortLink: "Short link, easy to say or write down:",
  message: (name) => (name ? `${name} — Free, private help in English and Spanish.` : "Free, private help for Stanislaus County, in English and Spanish."),
};

const es: StartCopy = {
  startTitle: "¿No sabe por dónde empezar?",
  startQuestion: "¿Con qué necesita ayuda?",
  startHint: "Elija la opción que más se parezca a su caso. Puede cambiar de herramienta cuando quiera.",
  shareTitle: "Compártalo",
  shareLead: "¿Conoce a alguien que lo necesite? Mándele el enlace. No incluye nada de lo que usted escribió.",
  sharePageLead: "¿Conoce a alguien que lo necesite? Mándele el enlace.",
  whatsapp: "Enviar por WhatsApp",
  copy: "Copiar el enlace",
  copied: "Enlace copiado. Puede pegarlo en un mensaje o correo.",
  copyFailed: "No se pudo copiar. Seleccione el enlace de abajo y cópielo.",
  copyFailedPage: "No se pudo copiar. Este es el enlace para copiar:",
  linkLabel: "Enlace para compartir",
  native: "Compartir…",
  shortLink: "Enlace corto, fácil de decir o de anotar:",
  message: (name) => (name ? `${name} — Ayuda gratis y privada, en español e inglés.` : "Ayuda gratis y privada para el condado de Stanislaus, en español e inglés."),
};

export const START_COPY: Record<Lang, StartCopy> = { en, es };
