import type { Metadata } from "next";
import Link from "next/link";
import { TEMPLATES, type TemplateId } from "@/lib/templates";
import { getPlanGeometry, isTemplateId } from "@/server/geometry/registry";
import type { ConfidenceState, FixedElementGeometry, PlanGeometry } from "@/server/geometry/types";
import { runScoutPass, type DampRiskReading } from "@/server/scout/scout";
import styles from "./bones.module.css";

export const metadata: Metadata = {
  title: "Reading the Bones · Built-To-Kanso",
};

type SearchParams = Record<string, string | string[] | undefined>;

interface BonesPageProps {
  searchParams?: Promise<SearchParams>;
}

const SCENARIO_LABELS: Record<string, string> = {
  "just-moved-in": "Just moved in",
  "mid-renovation": "Mid-renovation",
  "considering-changes": "Considering changes",
  "long-term-resident": "Long-term resident",
};

export default async function BonesPage({ searchParams }: BonesPageProps) {
  const params = (await searchParams) ?? {};
  const templateId = parseTemplate(first(params.template));
  const compassDeg = parseCompass(first(params.compass));
  const floor = parseFloor(first(params.floor));
  const scenario = first(params.scenario);

  if (!templateId || compassDeg === null || floor === null || !scenario || !SCENARIO_LABELS[scenario]) {
    return <MissingInputs />;
  }

  const plan = getPlanGeometry(templateId);
  const template = TEMPLATES.find((item) => item.id === templateId);
  const scout = runScoutPass({ plan, compassDeg, floor, tokenPlacements: [] });
  const counts = countConfidence(plan);
  const blackKinds = Array.from(new Set(plan.fixedElements.map((element) => element.kind)));
  const dampSummary = summarizeDampRisk(scout.dampRisk);

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/threshold" className={styles.brand} aria-label="Back to Threshold">
          <span className={styles.brandMark}>
            Built<span className={styles.brandHyphen}>-</span>To<span className={styles.brandHyphen}>-</span>Kanso
          </span>
          <span className={styles.brandSub}>Stage Two · Reading the Bones</span>
        </Link>
        <nav className={styles.crumbs} aria-label="Journey">
          <span className={styles.crumbDim}><span className={styles.crumbNum}>01</span> Threshold</span>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbActive}><span className={styles.crumbNum}>02</span> Bones</span>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbDim}><span className={styles.crumbNum}>03</span> Weather</span>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Architect-curated template</span>
          <h1>The house is listening.</h1>
          <p>
            {template?.name ?? templateId} loads as compliance truth. Black HDB and SCDF elements are
            fixed; the first read surfaces only what needs attention now.
          </p>
        </div>
        <aside className={styles.inputStrip} aria-label="Threshold inputs">
          <InputStat label="Door" value={`${compassDeg.toString().padStart(3, "0")}°`} />
          <InputStat label="Floor" value={String(floor)} />
          <InputStat label="Scenario" value={SCENARIO_LABELS[scenario]} />
        </aside>
      </section>

      <section className={styles.shell}>
        <div className={styles.planPanel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.eyebrow}>Plan truth</span>
              <h2>{template?.shortName ?? templateId}</h2>
            </div>
            <span className={plan.openingAreaPct >= 12 ? styles.goodBadge : styles.warnBadge}>
              {plan.openingAreaPct}% openings · {plan.openingAreaPct >= 12 ? "capable" : "marginal"}
            </span>
          </div>
          <PlanSvg plan={plan} />
          <div className={styles.legend} aria-label="Wall confidence legend">
            <LegendItem label="Template validated" tone="green" />
            <LegendItem label="Edge case" tone="amber" />
            <LegendItem label="Caution" tone="red" />
            <LegendItem label="HDB / SCDF fixed" tone="black" />
          </div>
        </div>

        <aside className={styles.sideStack}>
          <section className={styles.panel}>
            <span className={styles.eyebrow}>Fixed elements</span>
            <dl className={styles.metrics}>
              <Metric label="Green" value={counts.green} />
              <Metric label="Amber" value={counts.amber} />
              <Metric label="Red" value={counts.red} />
              <Metric label="Black" value={plan.fixedElements.length} />
            </dl>
            <p className={styles.smallCopy}>
              Black covers {blackKinds.map(formatKind).join(", ")}. Tokens cannot alter these elements;
              Shaft Buffer can only attach within the 0.6m pipeshaft clearance.
            </p>
          </section>

          <section className={styles.panel}>
            <span className={styles.eyebrow}>Asking points</span>
            <ul className={styles.askingList}>
              {scout.askingPoints.map((point) => (
                <li key={point.id}>
                  <span>{point.scout}</span>
                  {point.copy}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.panel}>
            <span className={styles.eyebrow}>Damp reading</span>
            {dampSummary ? (
              <div className={styles.dampCard}>
                <span
                  className={`${styles.statusDot} ${
                    dampSummary.worst.flag === "high" ? styles.statusHigh : styles.statusClear
                  }`}
                  aria-hidden
                />
                <div>
                  <strong>{formatRoom(dampSummary.worst.roomId)}</strong>
                  <p>
                    {dampSummary.worst.predictedRhPct}% RH at pillow. {dampSummary.worst.recommendation}
                  </p>
                  <span>
                    {dampSummary.highCount > 0
                      ? `${dampSummary.highCount} bedroom${dampSummary.highCount === 1 ? "" : "s"} asking for the same action.`
                      : "All bedrooms sit below the damp-risk flag after current buffers."}
                  </span>
                </div>
              </div>
            ) : null}
          </section>

          <div className={styles.actionRow}>
            <Link href="/threshold" className={styles.secondaryLink}>
              Adjust inputs
            </Link>
            <span>Next: Qi Weather Map</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

function MissingInputs() {
  return (
    <main className={styles.missingPage}>
      <section className={styles.missingCard}>
        <span className={styles.eyebrow}>Stage Two needs Threshold</span>
        <h1>The house is listening.</h1>
        <p>Choose a template, set the door, floor, and scenario before Reading the Bones.</p>
        <Link href="/threshold" className={styles.primaryLink}>
          Back to Threshold
        </Link>
      </section>
    </main>
  );
}

function PlanSvg({ plan }: { plan: PlanGeometry }) {
  const { bounds } = plan;
  const viewBox = `${bounds.x - 0.4} ${bounds.y - 0.4} ${bounds.width + 0.8} ${bounds.height + 0.8}`;

  return (
    <svg className={styles.planSvg} viewBox={viewBox} role="img" aria-label={`${plan.templateId} geometry plan`}>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        className={styles.planBounds}
      />
      {plan.rooms.map((room) => (
        <g key={room.id}>
          <rect
            x={room.x}
            y={room.y}
            width={room.width}
            height={room.height}
            className={`${styles.room} ${styles[room.confidence]}`}
          />
          <text x={room.x + room.width / 2} y={room.y + room.height / 2} className={styles.roomLabel}>
            {room.label}
          </text>
        </g>
      ))}
      {plan.openings.map((opening) => (
        <line
          key={opening.id}
          x1={opening.start.x}
          y1={opening.start.y}
          x2={opening.end.x}
          y2={opening.end.y}
          className={opening.operable ? styles.openingOperable : styles.openingFixed}
        />
      ))}
      {plan.fixedElements.map((element) => (
        <rect
          key={element.id}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          className={`${styles.fixedElement} ${element.bufferEligible ? styles.bufferEligible : ""}`}
        />
      ))}
      <circle
        cx={plan.pipeshaft.openingPoint.x}
        cy={plan.pipeshaft.openingPoint.y}
        r={plan.pipeshaft.bufferRadiusM}
        className={styles.bufferCircle}
      />
    </svg>
  );
}

function InputStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LegendItem({ label, tone }: { label: string; tone: ConfidenceState }) {
  return (
    <span className={styles.legendItem}>
      <i className={styles[tone]} aria-hidden />
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTemplate(value: string | undefined): TemplateId | null {
  return value && isTemplateId(value) ? value : null;
}

function parseCompass(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return ((Math.round(parsed / 15) * 15) % 360 + 360) % 360;
}

function parseFloor(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(50, Math.round(parsed)));
}

function countConfidence(plan: PlanGeometry): Record<ConfidenceState, number> {
  return plan.rooms.reduce<Record<ConfidenceState, number>>(
    (counts, room) => {
      counts[room.confidence] += 1;
      return counts;
    },
    { green: 0, amber: 0, red: 0, black: 0 },
  );
}

function summarizeDampRisk(readings: DampRiskReading[]) {
  if (readings.length === 0) return null;
  const worst = readings.reduce((currentWorst, reading) =>
    reading.predictedRhPct > currentWorst.predictedRhPct ? reading : currentWorst,
  );
  return {
    worst,
    highCount: readings.filter((reading) => reading.flag === "high").length,
  };
}

function formatKind(kind: FixedElementGeometry["kind"]): string {
  return kind.replaceAll("_", " ");
}

function formatRoom(roomId: string): string {
  return roomId.replaceAll("_", " ");
}
