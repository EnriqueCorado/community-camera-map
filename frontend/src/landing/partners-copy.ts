// Wording for the page for partner organizations (help/partners/,
// ayuda/socios/) and the footer link to it. The ready-to-share text for each
// tool is built from that tool's own name and summary (tools.ts), so a new
// tool gets its text automatically.
import type { Lang } from "../i18n";

type Fn<A extends unknown[]> = (...args: A) => string;

export interface PartnersCopy {
  slug: string;
  title: string;
  description: string;
  lead: string;
  footerLink: string;
  homeLink: string;
  neverTitle: string;
  never: string[];
  flyersTitle: string;
  flyersLead: string;
  flyersAll: string;
  printTitle: string;
  printTips: string[];
  textTitle: string;
  textLead: string;
  /** Ends every tool's ready-to-share paragraph, before the link. */
  tagline: string;
  generalName: string;
  copy: string;
  /** Screen-reader label of a Copy button: tool name, language of the text. */
  copyLabel: Fn<[string, string]>;
  copied: Fn<[string]>;
  copyFailed: string;
  /** Names of the two languages, in this page's language. */
  langName: Record<Lang, string>;
  linksLabel: Fn<[string]>;
  pageIn: Record<Lang, string>;
  requestTitle: string;
  requestText: string;
  requestLink: string;
  requestSubject: string;
  requestBody: string;
}

const en: PartnersCopy = {
  slug: "partners",
  title: "For community organizations: free flyers and ready-to-share text",
  description:
    "Printable bilingual flyers, ready-to-paste text for newsletters, social media and WhatsApp, and direct links to every free help tool for Stanislaus County.",
  lead: "If you work with families in Stanislaus County, please share these free tools. Here are flyers to print, text to paste into a newsletter, social post or WhatsApp group, and a direct link to every tool, in English and Spanish.",
  footerLink: "For community organizations: flyers and ready-to-share text",
  homeLink: "Text and links for organizations",
  neverTitle: "What we never do",
  never: [
    "We never track the people you send us: no cookies, no ads, no sign-up.",
    "Nothing anyone types into a tool is saved or shared.",
    "We never ask about immigration status.",
    "It’s free, and it will stay free.",
  ],
  flyersTitle: "Flyers to print",
  flyersLead: "Each flyer shows English and Spanish side by side, each with its own QR code.",
  flyersAll: "All flyers",
  printTitle: "Printing tips",
  printTips: [
    "Print on letter-size paper at actual size (100%, not “fit to page”), so the QR codes scan.",
    "Black and white works fine.",
    "Before printing a stack, scan one QR code with your phone to make sure it opens.",
    "The handout-cards sheet prints four small cards per page, to cut apart.",
    "The flyers leave out amounts that change every year, so a printed stack stays correct.",
  ],
  textTitle: "Ready-to-share text",
  textLead:
    "Copy a paragraph and paste it into your newsletter, website, social media post or WhatsApp group. If the Copy button doesn’t work, press and hold (or select) the text to copy it.",
  tagline: "Free and private, in English and Spanish. No sign-up, and nothing you type is saved.",
  generalName: "All the free help tools",
  copy: "Copy",
  copyLabel: (name, lang) => `Copy the ${lang} text: ${name}`,
  copied: (name) => `Copied: ${name}. Now paste it where you want to share it.`,
  copyFailed: "Couldn’t copy automatically. The text is selected: copy it with your device’s Copy command.",
  langName: { en: "English", es: "Spanish" },
  linksLabel: (name) => `Direct links: ${name}`,
  pageIn: { en: "Page in English", es: "Page in Spanish" },
  requestTitle: "Ask for printed flyers or a talk",
  requestText:
    "Would printed flyers help, or a short talk for your staff, volunteers or members? Send an email with your organization’s name and what you need, and a local volunteer will reply.",
  requestLink: "Email to ask for flyers or a talk",
  requestSubject: "Printed flyers or a talk",
  requestBody: [
    "Organization:",
    "City:",
    "What would help (which flyers and how many, or a short talk):",
    "Languages:",
    "Best way to reach you:",
    "",
  ].join("\r\n"),
};

const es: PartnersCopy = {
  slug: "socios",
  title: "Para organizaciones de la comunidad: volantes gratis y textos para compartir",
  description:
    "Volantes bilingües para imprimir, textos listos para pegar en boletines, redes sociales y WhatsApp, y enlaces directos a cada herramienta de ayuda gratis para el condado de Stanislaus.",
  lead: "Si trabaja con familias del condado de Stanislaus, por favor comparta estas herramientas gratis. Aquí hay volantes para imprimir, textos para pegar en un boletín, una publicación o un grupo de WhatsApp, y un enlace directo a cada herramienta, en español e inglés.",
  footerLink: "Para organizaciones: volantes y textos para compartir",
  homeLink: "Textos y enlaces para organizaciones",
  neverTitle: "Lo que nunca hacemos",
  never: [
    "Nunca rastreamos a las personas que nos envía: sin cookies, sin anuncios y sin registrarse.",
    "Nada de lo que alguien escriba en una herramienta se guarda ni se comparte.",
    "Nunca preguntamos el estatus migratorio.",
    "Es gratis y seguirá siendo gratis.",
  ],
  flyersTitle: "Volantes para imprimir",
  flyersLead: "Cada volante muestra el inglés y el español lado a lado, cada uno con su propio código QR.",
  flyersAll: "Todos los volantes",
  printTitle: "Consejos para imprimir",
  printTips: [
    "Imprima en papel tamaño carta a tamaño real (100%, no “ajustar a la página”), para que los códigos QR funcionen.",
    "En blanco y negro sale bien.",
    "Antes de imprimir muchos, escanee un código QR con su teléfono para confirmar que abre.",
    "La hoja de tarjetas imprime cuatro tarjetas pequeñas por página, para recortar.",
    "Los volantes no incluyen cantidades que cambian cada año, así que los impresos siguen siendo correctos.",
  ],
  textTitle: "Textos listos para compartir",
  textLead:
    "Copie un párrafo y péguelo en su boletín, sitio web, redes sociales o grupo de WhatsApp. Si el botón Copiar no funciona, mantenga presionado (o seleccione) el texto para copiarlo.",
  tagline: "Gratis y privado, en español e inglés. Sin registrarse, y lo que escriba no se guarda.",
  generalName: "Todas las herramientas de ayuda gratis",
  copy: "Copiar",
  copyLabel: (name, lang) => `Copiar el texto en ${lang}: ${name}`,
  copied: (name) => `Copiado: ${name}. Ahora péguelo donde lo quiera compartir.`,
  copyFailed: "No se pudo copiar automáticamente. El texto quedó seleccionado: cópielo con la opción Copiar de su aparato.",
  langName: { en: "inglés", es: "español" },
  linksLabel: (name) => `Enlaces directos: ${name}`,
  pageIn: { en: "Página en inglés", es: "Página en español" },
  requestTitle: "Pida volantes impresos o una plática",
  requestText:
    "¿Le ayudarían volantes impresos, o una plática breve para su personal, voluntarios o miembros? Mande un correo con el nombre de su organización y lo que necesita, y un voluntario local le responderá.",
  requestLink: "Escribir para pedir volantes o una plática",
  requestSubject: "Volantes impresos o una plática",
  requestBody: [
    "Organización:",
    "Ciudad:",
    "Qué les ayudaría (qué volantes y cuántos, o una plática breve):",
    "Idiomas:",
    "La mejor manera de comunicarnos con usted:",
    "",
  ].join("\r\n"),
};

export const PARTNERS_COPY: Record<Lang, PartnersCopy> = { en, es };
