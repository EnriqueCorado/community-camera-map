// Wording for the public "Free help" pages and flyers, per language (written,
// not stitched, so the Spanish reads naturally). Tool facts live in help/.
import type { Lang } from "../i18n";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface SiteCopy {
  /** Folder for this language's pages ("help" / "ayuda"). */
  dir: string;
  siteName: string;
  homeTitle: string;
  homeDescription: string;
  heroTitle: string;
  heroLead: string;
  promise: string[];
  promiseLabel: string;
  skip: string;
  otherLang: string;
  otherLangLabel: string;
  breadcrumb: string;
  home: string;
  open: string;
  openHint: string;
  placesTitle: string;
  sourcesTitle: string;
  checked: Fn<[string]>;
  call: Fn<[string]>;
  email: string;
  website: string;
  disclaimer: string;
  otherTools: string;
  flyersTitle: string;
  flyersLead: string;
  flyersLink: string;
  footerMap: string;
  footerVolunteer: string;
  footerSource: string;
  officesTitle: string;
  listen: string;
  listenStop: string;
  offlineTitle: string;
  offlineText: string;
  /** "__SAVE_KB__" is replaced with the real size at build time. */
  offlineSave: string;
  offlineSaving: string;
  offlineSaved: string;
  /** "{date}" is filled in by the page script. */
  offlineSavedOn: string;
  offlineFailed: string;
  offlineNoSpace: string;
  offlineRemove: string;
  offlineRemoved: string;
  offlineIphone: string;
  officeLanguages: Fn<[string]>;
  eoir: string;
}

const en: SiteCopy = {
  dir: "help",
  siteName: "Free Help, Stanislaus County",
  homeTitle: "Free help with hospital bills, rent, work and benefits | Stanislaus County",
  homeDescription:
    "Free, private tools in English and Spanish for people in Stanislaus County, California: hospital bill help, rent increase and eviction deadline checks, unpaid wages, heat at work, benefits and free legal aid.",
  heroTitle: "Free help with hospital bills, rent, work and benefits",
  heroLead:
    "Simple tools for people in Stanislaus County, California, in English and Spanish. Each one is based on California law and official sources, with the sources shown.",
  promiseLabel: "Our promise",
  promise: ["Free, with no sign-up", "Nothing you type is saved or shared", "Your immigration status is never asked"],
  skip: "Skip to main content",
  otherLang: "Español",
  otherLangLabel: "Ver esta página en español",
  breadcrumb: "You are here",
  home: "All free help",
  open: "Open the free tool",
  openHint: "Opens on this website. Nothing you type is saved or shared.",
  placesTitle: "Free help by phone or in person",
  sourcesTitle: "Where this information comes from",
  checked: (d) => `Last checked ${d}.`,
  call: (n) => `Call ${n}`,
  email: "Email",
  website: "Website",
  disclaimer:
    "This is general information, not legal advice. Every situation is different. For advice about yours, contact one of the free legal help offices.",
  otherTools: "More free help",
  flyersTitle: "Share it: free printable flyers",
  flyersLead: "Bilingual flyers with a QR code, for offices, clinics, churches, schools and workplaces.",
  flyersLink: "Print a flyer",
  footerMap: "Part of the Community Camera Map, a free public map of community services.",
  footerVolunteer: "Built by a local volunteer. Not a government website.",
  footerSource: "Open source",
  officesTitle: "Free and low-cost offices",
  listen: "Listen to this page",
  listenStop: "Stop reading",
  offlineTitle: "Use these pages without internet",
  offlineText:
    "Save these pages on this device to have your rights and the phone numbers with you, even without signal. Nothing is saved unless you tap the button, and you can remove them any time.",
  offlineSave: "Save all pages on this device (about __SAVE_KB__ KB)",
  offlineSaving: "Saving…",
  offlineSaved: "Saved. These pages now open on this device without internet.",
  offlineSavedOn: "Saved on this device ({date}). Each time you open them with internet, they update.",
  offlineFailed: "Couldn’t save. Check your connection and try again.",
  offlineNoSpace: "Couldn’t save: this device is out of space.",
  offlineRemove: "Remove saved pages",
  offlineRemoved: "Removed. Nothing from these pages is kept on this device.",
  offlineIphone: "On an iPhone, add this page to your Home Screen too, or the phone may delete saved pages after a few weeks without a visit.",
  officeLanguages: (l) => `Languages: ${l}`,
  eoir: "Recognized by the U.S. Department of Justice to help with immigration cases",
};

const es: SiteCopy = {
  dir: "ayuda",
  siteName: "Ayuda Gratis, Condado de Stanislaus",
  homeTitle: "Ayuda gratis con cuentas de hospital, renta, trabajo y beneficios | Condado de Stanislaus",
  homeDescription:
    "Herramientas gratis y privadas, en español e inglés, para personas del condado de Stanislaus, California: ayuda con cuentas de hospital, aumentos de renta y plazos de desalojo, salarios no pagados, calor en el trabajo, beneficios y ayuda legal gratis.",
  heroTitle: "Ayuda gratis con cuentas de hospital, renta, trabajo y beneficios",
  heroLead:
    "Herramientas sencillas para personas del condado de Stanislaus, California, en español e inglés. Cada una se basa en la ley de California y en fuentes oficiales, que se muestran.",
  promiseLabel: "Nuestra promesa",
  promise: ["Gratis y sin registrarse", "Lo que escriba nunca se guarda ni se comparte", "Nunca le preguntamos su estatus migratorio"],
  skip: "Ir al contenido principal",
  otherLang: "English",
  otherLangLabel: "View this page in English",
  breadcrumb: "Usted está aquí",
  home: "Toda la ayuda gratis",
  open: "Abrir la herramienta gratis",
  openHint: "Se abre en este sitio. Lo que escriba nunca se guarda ni se comparte.",
  placesTitle: "Ayuda gratis por teléfono o en persona",
  sourcesTitle: "De dónde viene esta información",
  checked: (d) => `Revisado por última vez el ${d}.`,
  call: (n) => `Llame al ${n}`,
  email: "Correo electrónico",
  website: "Sitio web",
  disclaimer:
    "Esta es información general, no asesoría legal. Cada caso es diferente. Para recibir consejo sobre el suyo, comuníquese con una de las oficinas de ayuda legal gratuita.",
  otherTools: "Más ayuda gratis",
  flyersTitle: "Compártalo: volantes gratis para imprimir",
  flyersLead: "Volantes bilingües con código QR, para oficinas, clínicas, iglesias, escuelas y lugares de trabajo.",
  flyersLink: "Imprimir un volante",
  footerMap: "Parte del Mapa Comunitario de Cámaras, un mapa público y gratuito de servicios para la comunidad.",
  footerVolunteer: "Hecho por un voluntario local. No es un sitio del gobierno.",
  footerSource: "Código abierto",
  officesTitle: "Oficinas gratuitas y de bajo costo",
  listen: "Escuchar esta página",
  listenStop: "Dejar de leer",
  offlineTitle: "Use estas páginas sin internet",
  offlineText:
    "Guarde estas páginas en este aparato para tener sus derechos y los números de teléfono a la mano, aun sin señal. No se guarda nada a menos que toque el botón, y puede borrarlas cuando quiera.",
  offlineSave: "Guardar todas las páginas en este aparato (unos __SAVE_KB__ KB)",
  offlineSaving: "Guardando…",
  offlineSaved: "Listo. Estas páginas ya se abren en este aparato sin internet.",
  offlineSavedOn: "Guardadas en este aparato ({date}). Cada vez que las abra con internet, se actualizan.",
  offlineFailed: "No se pudo guardar. Revise su conexión e intente otra vez.",
  offlineNoSpace: "No se pudo guardar: este aparato no tiene espacio.",
  offlineRemove: "Borrar las páginas guardadas",
  offlineRemoved: "Listo. Ya no se guarda nada de estas páginas en este aparato.",
  offlineIphone: "En un iPhone, agregue también esta página a su pantalla de inicio; si no, el teléfono puede borrar las páginas guardadas después de unas semanas sin visitarlas.",
  officeLanguages: (l) => `Idiomas: ${l}`,
  eoir: "Reconocida por el Departamento de Justicia de EE. UU. para ayudar con casos de inmigración",
};

export const SITE_COPY: Record<Lang, SiteCopy> = { en, es };
