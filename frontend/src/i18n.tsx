// Lightweight i18n (English / Spanish) — no dependency.
// `es` is typed as Record<Key, string>, so a missing Spanish string is a
// compile error, not a silent fallback to English.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "es";
export const LANGS: Lang[] = ["en", "es"];

const en = {
  loading: "Loading statewide cameras…",
  apiError: "Couldn’t reach the API.",
  apiHint: "Is the backend running on port 8000?",
  skipToSearch: "Skip to camera search",
  mapLabel: "Map of cameras and data layers. Use the arrow keys to pan and plus or minus to zoom.",
  titleA: "California",
  titleB: "Camera Map",
  camerasStatewide: "{n} public Caltrans traffic cameras statewide",
  about: "About & sources",
  dataAsOf: "Data as of {date}",
  dataLive: "Live data",
  langSwitch: "Español",
  langSwitchLabel: "Ver en español",
  jumpTo: "Jump to",
  allOfCA: "All of California",
  layers: "Layers",
  trafficCameras: "Traffic cameras",
  vendorOther: "Other",
  vendorOtherUnknown: "Other / unknown",
  alprNote: "Plate-reader locations are crowdsourced (OpenStreetMap / DeFlock) and not exhaustive.",
  needsKey: "needs API key",
  unavailable: "unavailable",
  downloadLayer: "Download {layer} as GeoJSON",
  incomeLegend: "Median household income",
  enviroLegend: "Pollution burden (CalEnviroScreen percentile)",
  whatCanSeeMe: "What can see me?",
  coverageStart: "Find plate readers near a point",
  coverageActive: "Click the map to drop a pin",
  coverageUseCenter: "Check the map’s center",
  radius: "Radius: {m} m",
  plateReaderOne: "plate reader within {m} m",
  plateReaderMany: "plate readers within {m} m",
  coverageNote: "Crowdsourced locations (OSM/DeFlock) — a floor, not a full count.",
  findCamera: "Find a camera",
  downloadCameras: "Download cameras as GeoJSON",
  filterPlaceholder: "Filter cameras by place, county, or road…",
  filterLabel: "Filter cameras",
  searchNote: "Map shows matching cameras only — clear the box to see all {n}.",
  noMatch: "No cameras match.",
  typeToSearch: "Type to search, or tap a dot on the map.",
  showingFirst: "Showing first {n} — refine your search.",
  cameraList: "Matching cameras",
  resultsCount: "{n} cameras match.",
  resultsCountOne: "1 camera matches.",
  videoLabel: "Live video: {name}",
  close: "Close",
  latitude: "Latitude",
  longitude: "Longitude",
  county: "County",
  cameraNote:
    "Live feed and still image courtesy of Caltrans. Streams drop out intermittently; reopen if the video stalls.",
  hlsUnsupported: "This browser can’t play HLS video.",
  streamUnavailable: "Stream unavailable. Caltrans feeds drop out intermittently.",
  dirNorth: "North",
  dirSouth: "South",
  dirEast: "East",
  dirWest: "West",
  censusTract: "Census tract",
  medianIncome: "Median income",
  population: "Population",
  na: "n/a",
  earthquake: "Earthquake",
  wildfire: "Wildfire",
  acres: "{n} acres",
  active: "active",
  alert: "Alert",
  enviroPct: "CalEnviroScreen {n} percentile",
  closure: "closure",
  riverGauge: "River gauge",
  aqi: "AQI {n}",
  alprCamera: "License plate reader",
  operator: "Operator",
  rowLocation: "Location",
  rowTime: "Time",
  rowSize: "Size",
  rowContained: "Contained",
  rowArea: "Area",
  rowSeverity: "Severity",
  rowPollutant: "Pollutant",
  rowCategory: "Category",
  rowFlow: "Flow",
  rowGaugeHeight: "Gauge height",
  rowAddress: "Address",
  rowCity: "City",
  rowType: "Type",
  rowFacing: "Facing",
  rowSubtype: "Subtype",
  rowPhone: "Phone",
  rowHeight: "Height",
  rowZone: "FEMA zone",
  floodHigh: "High flood risk (1% annual chance)",
  floodModerate: "Moderate flood risk",
  floodMinimal: "Minimal flood risk",
  floodUndetermined: "Flood risk not determined",
  fireLevel: "{level} fire hazard",
  fireModerate: "Moderate",
  fireHigh: "High",
  fireVeryHigh: "Very high",
  notTagged: "not tagged",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  closePopup: "Close popup",
} as const;

export type Key = keyof typeof en;

const es: Record<Key, string> = {
  loading: "Cargando cámaras de todo el estado…",
  apiError: "No se pudo conectar con la API.",
  apiHint: "¿Está corriendo el backend en el puerto 8000?",
  skipToSearch: "Ir a la búsqueda de cámaras",
  mapLabel:
    "Mapa de cámaras y capas de datos. Use las flechas para desplazarse y los signos más o menos para acercar o alejar.",
  titleA: "Mapa de cámaras",
  titleB: "de California",
  camerasStatewide: "{n} cámaras públicas de tráfico de Caltrans en todo el estado",
  about: "Acerca del mapa y fuentes",
  dataAsOf: "Datos al {date}",
  dataLive: "Datos en vivo",
  langSwitch: "English",
  langSwitchLabel: "View in English",
  jumpTo: "Ir a",
  allOfCA: "Todo California",
  layers: "Capas",
  trafficCameras: "Cámaras de tráfico",
  vendorOther: "Otro",
  vendorOtherUnknown: "Otro / desconocido",
  alprNote:
    "Las ubicaciones de lectores de placas las aportan voluntarios (OpenStreetMap / DeFlock) y no están completas.",
  needsKey: "requiere clave de API",
  unavailable: "no disponible",
  downloadLayer: "Descargar {layer} en GeoJSON",
  incomeLegend: "Ingreso medio por hogar",
  enviroLegend: "Carga de contaminación (percentil de CalEnviroScreen)",
  whatCanSeeMe: "¿Qué cámaras me ven?",
  coverageStart: "Buscar lectores de placas cerca de un punto",
  coverageActive: "Haga clic en el mapa para marcar un punto",
  coverageUseCenter: "Revisar el centro del mapa",
  radius: "Radio: {m} m",
  plateReaderOne: "lector de placas a menos de {m} m",
  plateReaderMany: "lectores de placas a menos de {m} m",
  coverageNote: "Ubicaciones aportadas por voluntarios (OSM/DeFlock): es un mínimo, no un conteo completo.",
  findCamera: "Buscar una cámara",
  downloadCameras: "Descargar cámaras en GeoJSON",
  filterPlaceholder: "Filtrar cámaras por lugar, condado o carretera…",
  filterLabel: "Filtrar cámaras",
  searchNote: "El mapa muestra solo las cámaras que coinciden; borre el texto para ver las {n}.",
  noMatch: "Ninguna cámara coincide.",
  typeToSearch: "Escriba para buscar o toque un punto en el mapa.",
  showingFirst: "Mostrando las primeras {n}; afine su búsqueda.",
  cameraList: "Cámaras que coinciden",
  resultsCount: "{n} cámaras coinciden.",
  resultsCountOne: "1 cámara coincide.",
  videoLabel: "Video en vivo: {name}",
  close: "Cerrar",
  latitude: "Latitud",
  longitude: "Longitud",
  county: "Condado",
  cameraNote:
    "Transmisión en vivo e imagen cortesía de Caltrans. Las transmisiones se interrumpen a veces; vuelva a abrirla si el video se detiene.",
  hlsUnsupported: "Este navegador no puede reproducir video HLS.",
  streamUnavailable: "Transmisión no disponible. Las transmisiones de Caltrans se interrumpen a veces.",
  dirNorth: "Norte",
  dirSouth: "Sur",
  dirEast: "Este",
  dirWest: "Oeste",
  censusTract: "Sector censal",
  medianIncome: "Ingreso medio",
  population: "Población",
  na: "sin datos",
  earthquake: "Sismo",
  wildfire: "Incendio forestal",
  acres: "{n} acres",
  active: "activo",
  alert: "Alerta",
  enviroPct: "CalEnviroScreen: percentil {n}",
  closure: "cierre",
  riverGauge: "Medidor de río",
  aqi: "ICA {n}",
  alprCamera: "Lector de placas",
  operator: "Operador",
  rowLocation: "Lugar",
  rowTime: "Hora",
  rowSize: "Tamaño",
  rowContained: "Contención",
  rowArea: "Zona",
  rowSeverity: "Gravedad",
  rowPollutant: "Contaminante",
  rowCategory: "Categoría",
  rowFlow: "Caudal",
  rowGaugeHeight: "Altura del agua",
  rowAddress: "Dirección",
  rowCity: "Ciudad",
  rowType: "Tipo",
  rowFacing: "Orientación",
  rowSubtype: "Subtipo",
  rowPhone: "Teléfono",
  rowHeight: "Altura",
  rowZone: "Zona FEMA",
  floodHigh: "Riesgo alto de inundación (1 % anual)",
  floodModerate: "Riesgo moderado de inundación",
  floodMinimal: "Riesgo mínimo de inundación",
  floodUndetermined: "Riesgo de inundación no determinado",
  fireLevel: "Riesgo de incendio: {level}",
  fireModerate: "moderado",
  fireHigh: "alto",
  fireVeryHigh: "muy alto",
  notTagged: "sin etiquetar",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  closePopup: "Cerrar ventana",
};

const DICTS: Record<Lang, Record<Key, string>> = { en, es };

// Spanish layer names, keyed by layer id. English titles come from the API.
const LAYER_TITLES_ES: Record<string, string> = {
  alpr: "Lectores de placas",
  "city-limits": "Límites de la ciudad",
  "general-plan": "Uso de suelo (plan general)",
  zoning: "Zonificación",
  annexations: "Anexiones (crecimiento)",
  parks: "Parques",
  schools: "Escuelas públicas",
  census: "Censo (ingresos)",
  hospitals: "Hospitales",
  "law-enforcement": "Fuerzas del orden",
  flood: "Zonas de inundación (FEMA)",
  "fire-hazard": "Riesgo de incendio",
  enviroscreen: "Carga de contaminación",
  wildfire: "Incendios forestales",
  "weather-alerts": "Alertas del clima",
  quakes: "Sismos (24 h)",
  streamflow: "Medidores de ríos",
  "lane-closures": "Cierres de carriles",
  "message-signs": "Letreros de autopista",
  "air-quality": "Calidad del aire",
  "transit-routes": "Rutas de autobús",
  "transit-stops": "Paradas de autobús",
  "supervisor-districts": "Distritos de supervisores",
  "zip-codes": "Códigos postales",
  "congressional-districts": "Distritos del Congreso",
  airports: "Aeropuertos",
  amtrak: "Estaciones de Amtrak",
  dams: "Presas",
};

export type TFn = (key: Key, vars?: Record<string, string | number>) => string;

/** Plain text, NOT HTML-safe: React escapes it, but any non-React sink (e.g. a
 *  MapLibre popup's setHTML) must pass the result through escapeHtml. */
export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export function layerTitle(lang: Lang, name: string, englishTitle: string): string {
  return lang === "es" ? (LAYER_TITLES_ES[name] ?? englishTitle) : englishTitle;
}

/** "21" -> "21st" in English; Spanish uses the bare number ("percentil 21"). */
export function ordinal(lang: Lang, n: number): string {
  if (lang !== "en") return String(n);
  const suffix = { one: "st", two: "nd", few: "rd", other: "th" } as Record<string, string>;
  return `${n}${suffix[new Intl.PluralRules("en-US", { type: "ordinal" }).select(n)] ?? "th"}`;
}

/** Number/date locale for each UI language. */
export const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-US" };

const DIR_KEYS: Record<string, Key> = {
  north: "dirNorth",
  south: "dirSouth",
  east: "dirEast",
  west: "dirWest",
};
export function translateDirection(t: TFn, dir: string): string {
  const k = DIR_KEYS[dir.trim().toLowerCase()];
  return k ? t(k) : dir;
}

function isLang(v: unknown): v is Lang {
  return v === "en" || v === "es";
}

const STORAGE_KEY = "scm-lang";

/** Initial language: shared link (#lang=es) > saved choice > browser language. */
export function detectLang(hash: string): Lang {
  const fromHash = new URLSearchParams(hash.replace(/^#/, "")).get("lang");
  if (isLang(fromHash)) return fromHash;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage unavailable (private mode) */
  }
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
  locale: string;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  // Screen readers pick pronunciation from <html lang>.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars), locale: LOCALE[lang] }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
