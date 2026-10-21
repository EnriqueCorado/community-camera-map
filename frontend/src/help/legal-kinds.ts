// Label keys for the legal-help directory's kinds and costs, shared by the
// map popup and the Help list (no React, so the map bundle stays small).
import type { Key } from "../i18n";
import type { LegalKind, LegalOffice } from "./legal-dir";

export const LEGAL_KIND_KEYS: Record<LegalKind, Key> = {
  immigration: "kindImmigration",
  housing: "kindHousing",
  general: "kindGeneral",
  seniors: "kindSeniors",
  family: "kindFamily",
  workers: "kindWorkers",
  "court-self-help": "kindCourt",
  consumer: "kindConsumer",
};

export const LEGAL_COST_KEYS: Record<LegalOffice["cost"], Key> = {
  free: "costFree",
  "low-cost": "costLowCost",
  varies: "costVaries",
};
