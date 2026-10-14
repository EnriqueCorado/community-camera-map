import type { LayerInfo } from "../api/client";

interface Props {
  layers: LayerInfo[];
  bakedAt: string | null;
  onClose: () => void;
}

export function About({ layers, bakedAt, onClose }: Props) {
  const asOf = bakedAt ? new Date(bakedAt).toLocaleString() : "live (served from the API)";
  return (
    <div className="about" role="dialog" aria-modal="true" aria-label="About this map">
      <div className="about__card">
        <div className="about__bar">
          <h2>About this map</h2>
          <button type="button" className="detail__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="about__body">
          <p>
            A public map of government surveillance and civic data in Stanislaus County, California.
            Its purpose is <strong>transparency about public infrastructure</strong> — where traffic
            and license-plate cameras are, and what the public record says about them.
          </p>

          <h3>How to read the data</h3>
          <ul>
            <li>
              <strong>Traffic cameras</strong> are live public Caltrans feeds.
            </li>
            <li>
              <strong>License plate readers (ALPR)</strong> are crowdsourced from OpenStreetMap /
              DeFlock. Treat them as a <strong>floor, not a full count</strong> — a camera appears
              only once someone has spotted and logged it.
            </li>
            <li>Everything else comes from the government sources listed below.</li>
          </ul>

          <h3>On the record</h3>
          <ul>
            <li>
              In March 2026, Modesto PD disclosed that seven federal agencies (incl. Border Patrol’s
              San Diego Sector and the U.S. Marshals) had live access to its plate-reader data —
              which California’s SB&nbsp;34 prohibits. It cut the access after a Modesto Bee records
              request.{" "}
              <a href="https://www.cbsnews.com/sacramento/news/modesto-license-plate-readers-shared-data-federal-agencies/" target="_blank" rel="noopener">
                CBS Sacramento
              </a>
            </li>
            <li>
              Turlock PD holds the area’s only confirmed Flock contract (≈$1.13M / 5&nbsp;yr, 52
              Falcon cameras, Reso 2025-017). Most Modesto readers are Motorola/Vigilant, not Flock.
            </li>
          </ul>

          <h3>Where the data comes from</h3>
          <dl className="about__sources">
            {layers
              .filter((l) => l.source)
              .map((l) => (
                <div key={l.name}>
                  <dt>{l.title}</dt>
                  <dd>{l.source}</dd>
                </div>
              ))}
            <div>
              <dt>Base map</dt>
              <dd>OpenFreeMap · © OpenStreetMap contributors</dd>
            </div>
          </dl>

          <h3>Principles</h3>
          <ul>
            <li>This maps <strong>public infrastructure, not people.</strong></li>
            <li>No personal data is collected, and nothing here tracks individuals or officers.</li>
            <li>
              It documents surveillance; it does not perform it. Camera and ALPR locations are drawn
              from public records and open data.
            </li>
          </ul>

          <p className="about__asof">Data as of {asOf}.</p>
        </div>
      </div>
    </div>
  );
}
