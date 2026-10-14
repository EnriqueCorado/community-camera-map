import { useRef, type ReactNode } from "react";
import type { LayerInfo } from "../api/client";
import { useI18n, layerTitle, type Lang } from "../i18n";
import { useDialog } from "../hooks/useDialog";

interface Props {
  layers: LayerInfo[];
  bakedAt: string | null;
  onClose: () => void;
}

const CBS_URL =
  "https://www.cbsnews.com/sacramento/news/modesto-license-plate-readers-shared-data-federal-agencies/";

// Long-form copy is written per language (not stitched from fragments) so the
// Spanish reads naturally.
const COPY: Record<
  Lang,
  {
    title: string;
    intro: ReactNode;
    howTo: string;
    howToItems: ReactNode[];
    record: string;
    recordItems: ReactNode[];
    sources: string;
    baseMap: string;
    principles: string;
    principleItems: ReactNode[];
    asOf: (d: string) => string;
    live: string;
  }
> = {
  en: {
    title: "About this map",
    intro: (
      <>
        A public map of government surveillance and civic data in Stanislaus County, California. Its
        purpose is <strong>transparency about public infrastructure</strong> — where traffic and
        license-plate cameras are, and what the public record says about them.
      </>
    ),
    howTo: "How to read the data",
    howToItems: [
      <>
        <strong>Traffic cameras</strong> are live public Caltrans feeds.
      </>,
      <>
        <strong>License plate readers (ALPR)</strong> are crowdsourced from OpenStreetMap / DeFlock.
        Treat them as a <strong>floor, not a full count</strong> — a camera appears only once someone
        has spotted and logged it.
      </>,
      <>Everything else comes from the government sources listed below.</>,
    ],
    record: "On the record",
    recordItems: [
      <>
        In March 2026, Modesto PD said its plate-reader system had been connected to several federal
        agencies, including the U.S. Marshals Service, IRS Criminal Investigation and Border Patrol’s San
        Diego Sector. California’s SB&nbsp;34 prohibits sharing this data with federal agencies. Modesto PD
        cut the connections; how long they existed, and whether those agencies searched the data, is
        unclear.{" "}
        <a href={CBS_URL} target="_blank" rel="noopener noreferrer">
          CBS Sacramento
        </a>
      </>,
      <>
        Turlock PD holds the area’s only confirmed Flock contract (about $1.13M over 5 years, 52
        Falcon cameras, Resolution 2025-017). Most Modesto readers are Motorola/Vigilant, not Flock.
      </>,
    ],
    sources: "Where the data comes from",
    baseMap: "Base map",
    principles: "Principles",
    principleItems: [
      <>
        This maps <strong>public infrastructure, not people.</strong>
      </>,
      <>No personal data is collected, and nothing here tracks individuals or officers.</>,
      <>
        It documents surveillance; it does not perform it. Camera and plate-reader locations come from
        public records and open data.
      </>,
    ],
    asOf: (d) => `Data as of ${d}.`,
    live: "live (served from the API)",
  },
  es: {
    title: "Acerca de este mapa",
    intro: (
      <>
        Un mapa público de la vigilancia gubernamental y de datos cívicos del condado de Stanislaus,
        California. Su propósito es la <strong>transparencia sobre la infraestructura pública</strong>:
        dónde están las cámaras de tráfico y los lectores de placas, y qué dicen los registros públicos
        sobre ellos.
      </>
    ),
    howTo: "Cómo leer los datos",
    howToItems: [
      <>
        Las <strong>cámaras de tráfico</strong> son transmisiones públicas en vivo de Caltrans.
      </>,
      <>
        Los <strong>lectores automáticos de placas (ALPR)</strong> los registran voluntarios en
        OpenStreetMap / DeFlock. Considérelos <strong>un mínimo, no un conteo completo</strong>: una
        cámara aparece solo después de que alguien la ve y la registra.
      </>,
      <>Todo lo demás proviene de las fuentes gubernamentales que se indican abajo.</>,
    ],
    record: "Lo que consta en los registros",
    recordItems: [
      <>
        En marzo de 2026, la policía de Modesto dijo que su sistema de lectores de placas había estado
        conectado a varias agencias federales, entre ellas el Servicio de Alguaciles de EE. UU., la
        división de Investigación Criminal del IRS y el sector San Diego de la Patrulla Fronteriza. La ley
        SB&nbsp;34 de California prohíbe compartir estos datos con agencias federales. La policía de Modesto
        cortó esas conexiones; no está claro cuánto tiempo existieron ni si esas agencias consultaron los
        datos.{" "}
        <a href={CBS_URL} target="_blank" rel="noopener noreferrer" hrefLang="en">
          CBS Sacramento (en inglés)
        </a>
      </>,
      <>
        La policía de Turlock tiene el único contrato confirmado con Flock en la zona (unos $1.13
        millones en 5 años, 52 cámaras Falcon, Resolución 2025-017). La mayoría de los lectores de
        Modesto son de Motorola/Vigilant, no de Flock.
      </>,
    ],
    sources: "De dónde provienen los datos",
    baseMap: "Mapa base",
    principles: "Principios",
    principleItems: [
      <>
        Este mapa muestra <strong>infraestructura pública, no personas.</strong>
      </>,
      <>No se recopilan datos personales, y nada aquí rastrea a individuos ni a agentes.</>,
      <>
        Documenta la vigilancia; no la realiza. Las ubicaciones de cámaras y lectores de placas
        provienen de registros públicos y datos abiertos.
      </>,
    ],
    asOf: (d) => `Datos al ${d}.`,
    live: "en vivo (servidos por la API)",
  },
};

export function About({ layers, bakedAt, onClose }: Props) {
  const { lang, t, locale } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose, { modal: true });
  const c = COPY[lang];
  const asOf = bakedAt ? c.asOf(new Date(bakedAt).toLocaleString(locale)) : c.asOf(c.live);

  return (
    <div
      className="about"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(); // click on the backdrop
      }}
    >
      <div
        ref={ref}
        className="about__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        tabIndex={-1}
      >
        <div className="about__bar">
          <h2 id="about-title">{c.title}</h2>
          <button type="button" className="detail__close" onClick={onClose} aria-label={t("close")}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="about__body">
          <p>{c.intro}</p>

          <h3>{c.howTo}</h3>
          <ul>
            {c.howToItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h3>{c.record}</h3>
          <ul>
            {c.recordItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h3>{c.sources}</h3>
          <dl className="about__sources">
            {layers
              .filter((l) => l.source)
              .map((l) => (
                <div key={l.name}>
                  <dt>{layerTitle(lang, l.name, l.title)}</dt>
                  <dd>{l.source}</dd>
                </div>
              ))}
            <div>
              <dt>{c.baseMap}</dt>
              <dd>OpenFreeMap · © OpenStreetMap contributors</dd>
            </div>
          </dl>

          <h3>{c.principles}</h3>
          <ul>
            {c.principleItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <p className="about__asof">{asOf}</p>
        </div>
      </div>
    </div>
  );
}
