// Phase 1 ships exactly these three HDB Archetype templates (brief §6.1).
// Each carries the metadata Stage 1 needs; full plan-geometry.json arrives
// in the Studio.

export type TemplateId = "tampines-greenweave" | "tengah-5room" | "resale-exec-1990s";

export type CrossVent = "capable" | "marginal";

export interface HdbTemplate {
  id: TemplateId;
  name: string;
  shortName: string;
  estate: string;
  era: string;
  rooms: string;
  floorAreaSqm: number;
  // brief §7.5 — combined operable opening area threshold
  crossVent: CrossVent;
  openingPct: number;
  // brief §7 — every Phase 1 template has a marked pipeshaft
  pipeshaftRoom: string;
  notes: string;
}

export const TEMPLATES: HdbTemplate[] = [
  {
    id: "tampines-greenweave",
    name: "Tampines GreenWeave",
    shortName: "Tampines",
    estate: "BTO · Tampines North",
    era: "2020s",
    rooms: "4-room",
    floorAreaSqm: 93,
    crossVent: "capable",
    openingPct: 14,
    pipeshaftRoom: "Kitchen, north wall",
    notes: "Modern stack, generous balcony, well-aligned door-to-window axis.",
  },
  {
    id: "tengah-5room",
    name: "Tengah Open-Kitchen",
    shortName: "Tengah",
    estate: "BTO · Tengah Plantation",
    era: "2020s",
    rooms: "5-room",
    floorAreaSqm: 113,
    crossVent: "capable",
    openingPct: 13,
    pipeshaftRoom: "Service yard, west wall",
    notes: "Open kitchen meets the living room; service yard breaks the cross-axis.",
  },
  {
    id: "resale-exec-1990s",
    name: "Resale Executive",
    shortName: "Executive",
    estate: "Resale · 1990s archetype",
    era: "1990s",
    rooms: "Executive Apt.",
    floorAreaSqm: 142,
    crossVent: "marginal",
    openingPct: 9,
    pipeshaftRoom: "Master bath, east wall",
    notes: "Long corridor, smaller windows. Fan Anchor recommended; cross-vent marginal.",
  },
];
