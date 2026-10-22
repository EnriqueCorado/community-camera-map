// Wording for the "Know your rights" page, per language. The rights
// themselves are in rights-facts.ts, in the sources' own words.
import type { Lang } from "../i18n";

export interface RightsCopy {
  title: string;
  lead: string;
  emergencyTitle: string;
  emergencyText: string;
  emergencyDoor: string;
  notReviewed: string;
  call911: string;
  cardTitle: string;
  cardLead: string;
  cardGet: string;
  cardEnglish: string;
  cardSpanish: string;
  cardIndigenous: string;
  videosTitle: string;
  facebook: string;
  door: string;
  stopped: string;
  recording: string;
  plan: string;
  detained: string;
  centersTitle: string;
  centersNote: string;
  california: string;
  scams: string;
  legal: string;
  legalButton: string;
  changing: (date: string) => string;
}

const en: RightsCopy = {
  title: "Know your rights with immigration agents",
  lead: "What trusted legal groups and the California Attorney General say to do if immigration agents come to your door, stop you, or detain someone you love, and how to plan ahead. This is general information, not legal advice for your case.",
  emergencyTitle: "If ICE is in your community right now",
  emergencyText: "Call the volunteer rapid response line. It is for emergencies only and does not give legal advice. Volunteers answer; hours are not posted.",
  emergencyDoor: "If agents are at your door: you do not have to open it. Stay calm, don't run, stay silent, don't sign anything, and don't resist. See “If agents come to your door” below.",
  notReviewed: "not each video reviewed by us",
  call911: "If someone is hurt or in danger, call 911.",
  cardTitle: "Free red cards",
  cardLead: "A red card shows the agent, in English, that you are using your rights. Keep one in your wallet and by the door.",
  cardGet: "Get red cards free from the Immigrant Legal Resource Center (ILRC)",
  cardEnglish: "Card in English (PDF)",
  cardSpanish: "Card in Spanish (PDF)",
  cardIndigenous: "Cards in Mam, Nahuatl and Tsotsil (PDF):",
  videosTitle: "Videos in Indigenous languages",
  facebook: "opens Facebook, which can track who watches",
  door: "If agents come to your door",
  stopped: "If you are stopped or questioned",
  recording: "Recording and reporting",
  plan: "Make a family plan now",
  detained: "If someone you love is detained",
  centersTitle: "ICE detention centers in Kern County used for Northern California",
  centersNote: "These are the centers listed for ICE's San Francisco office, which covers Northern California. They are 200 to 250 miles away. People can also be sent to other places, even out of state. Call before you go: the person may be somewhere else or may have been moved.",
  california: "What California law does, and doesn't do",
  scams: "Watch out for scams",
  legal: "Get real legal help",
  legalButton: "See free legal help near you",
  changing: (d) => `Some of these rules are being decided in court right now. Last checked ${d}.`,
};

const es: RightsCopy = {
  title: "Conozca sus derechos ante los agentes de inmigración",
  lead: "Lo que dicen organizaciones legales de confianza y el Fiscal General de California que hay que hacer si los agentes de inmigración llegan a su puerta, lo detienen, o detienen a un ser querido, y cómo prepararse. Es información general, no consejo legal para su caso.",
  emergencyTitle: "Si ICE está en su comunidad ahora mismo",
  emergencyText: "Llame a la línea de respuesta rápida de voluntarios. Es solo para emergencias y no da consejo legal. Lo atienden voluntarios; no publican su horario.",
  emergencyDoor: "Si hay agentes en su puerta: no tiene que abrir. Mantenga la calma, no huya, guarde silencio, no firme nada y no se resista. Vea “Si los agentes llegan a su puerta” abajo.",
  notReviewed: "no hemos revisado cada video",
  call911: "Si alguien está herido o en peligro, llame al 911.",
  cardTitle: "Tarjetas rojas gratis",
  cardLead: "La tarjeta roja le muestra al agente, en inglés, que usted está usando sus derechos. Tenga una en su cartera y otra junto a la puerta.",
  cardGet: "Consiga tarjetas rojas gratis del Immigrant Legal Resource Center (ILRC)",
  cardEnglish: "Tarjeta en inglés (PDF)",
  cardSpanish: "Tarjeta en español (PDF)",
  cardIndigenous: "Tarjetas en mam, náhuatl y tsotsil (PDF):",
  videosTitle: "Videos en lenguas indígenas",
  facebook: "se abre en Facebook, que puede rastrear quién lo ve",
  door: "Si los agentes llegan a su puerta",
  stopped: "Si lo paran o le hacen preguntas",
  recording: "Grabar y denunciar",
  plan: "Haga un plan familiar desde ahora",
  detained: "Si detienen a un ser querido",
  centersTitle: "Centros de detención de ICE en el condado de Kern para el norte de California",
  centersNote: "Estos son los centros de la oficina de ICE en San Francisco, que cubre el norte de California. Están a entre 200 y 250 millas. También pueden llevar a las personas a otros lugares, incluso fuera del estado. Llame antes de ir: la persona puede estar en otro lugar o pudo haber sido trasladada.",
  california: "Lo que la ley de California hace, y lo que no hace",
  scams: "Cuidado con las estafas",
  legal: "Consiga ayuda legal de verdad",
  legalButton: "Ver ayuda legal gratis cerca de usted",
  changing: (d) => `Algunas de estas reglas se están decidiendo en las cortes ahora mismo. Revisado por última vez el ${d}.`,
};

export const RIGHTS_COPY: Record<Lang, RightsCopy> = { en, es };
