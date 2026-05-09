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
            We are reading the locked plan for {template?.name ?? templateId}. HDB and SCDF areas stay
            untouched. The first read points to the few places worth checking.
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
              <span className={styles.eyebrow}>Locked plan</span>
              <h2>{template?.shortName ?? templateId}</h2>
            </div>
            <span className={plan.openingAreaPct >= 12 ? styles.goodBadge : styles.warnBadge}>
              {openingBadgeCopy(plan.openingAreaPct)}
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
            <span className={styles.eyebrow}>What stays untouched</span>
            <dl className={styles.metrics}>
              <Metric label="Ready" value={counts.green} />
              <Metric label="Check" value={counts.amber} />
              <Metric label="Caution" value={counts.red} />
              <Metric label="Fixed" value={plan.fixedElements.length} />
            </dl>
            <p className={styles.smallCopy}>
              Fixed areas include {blackKinds.map(formatKind).join(", ")}. Tokens cannot alter these
              areas. Shaft Buffer is the only exception, and only within the 0.6m pipeshaft clearance.
            </p>
          </section>

          <section className={styles.panel}>
            <span className={styles.eyebrow}>What the home is asking</span>
            <ul className={styles.askingList}>
              {scout.askingPoints.map((point) => (
                <li key={point.id}>
                  <span>{formatScout(point.scout)}</span>
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
                      ? `${dampSummary.highCount} bedroom${dampSummary.highCount === 1 ? "" : "s"} share this damp recommendation.`
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
            <span>Next: see how air moves</span>
          </div>
        </aside>
      </section>
    </main>
  );
}

function MissingInputs() {
  return (
    <main className={styles.missingPage}>
      <header className={styles.masthead}>
        <Link href="/threshold" className={styles.brand} aria-label="Built-To-Kanso, return to Threshold">
          <span className={styles.brandMark}>
            Built<span className={styles.brandHyphen}>-</span>To<span className={styles.brandHyphen}>-</span>Kanso
          </span>
          <span className={styles.brandSub}>Stage Two · Anteroom</span>
        </Link>
        <nav className={styles.crumbs} aria-label="Journey">
          <span className={styles.crumbDim}><span className={styles.crumbNum}>01</span> Threshold</span>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbActive}><span className={styles.crumbNum}>02</span> Bones</span>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbDim}><span className={styles.crumbNum}>03</span> Weather</span>
        </nav>
      </header>

      <section className={styles.missingHero}>
        <span className={styles.eyebrow}>Stage Two · Anteroom</span>
        <h1 className={styles.missingHeadline}>
          The house has not yet<br />
          <em>heard you</em>.
        </h1>
        <p className={styles.missingLede}>
          Bones reads a unit&rsquo;s plan after the threshold lands. It cannot listen until it
          knows which home to listen to. Choose a template, set the door and floor; ninety
          seconds will do it.
        </p>
        <Link href="/threshold" className={styles.missingPrimary}>
          Step back to the threshold
          <span className={styles.missingArrow} aria-hidden>&rarr;</span>
        </Link>
      </section>

      <hr className={styles.missingDivider} aria-hidden />

      <section className={styles.missingMethod} aria-labelledby="bones-anteroom-method">
        <svg
          className={styles.methodGlyph}
          viewBox="0 0 96 36"
          role="img"
          aria-label="Streamline mark"
        >
          <path d="M4 10 C 24 4, 44 16, 64 10 S 92 6, 92 6" />
          <path d="M4 20 C 28 14, 48 26, 68 20 S 92 16, 92 16" />
          <path d="M4 30 C 22 26, 42 32, 62 28 S 88 26, 92 26" />
        </svg>
        <span id="bones-anteroom-method" className={styles.eyebrow}>Method</span>
        <p className={styles.methodBody}>
          We are the <em>Nanyang</em> tropical school: wind welcomed, not hidden. Calibrated for
          1.35°&nbsp;N, not transplanted from Hong Kong or Beijing. The compass logic is
          Form-School feng shui (峦头派), an environment-driven tradition. <em>Kansō</em> names
          the aesthetic (Japanese, restraint); it is not <em>kasō</em> (Japanese house
          astrology). Every claim is physical: opening areas, pillow-level humidity, west-sun
          heat path. Nothing is metaphysical.
        </p>
      </section>

      <hr className={styles.missingDivider} aria-hidden />

      <section className={styles.missingPreview} aria-label="What Bones will read">
        <span className={styles.eyebrow}>Preview · Bones will read</span>
        <ul className={styles.previewList}>
          <li className={styles.previewItem}>
            <span className={styles.previewKey}>Air</span>
            <h2 className={styles.previewTitle}>The first cross-vent corridor</h2>
            <p className={styles.previewBody}>
              Drawn from the locked plan and the door angle you set, before any token lands.
            </p>
          </li>
          <li className={styles.previewItem}>
            <span className={styles.previewKey}>Damp</span>
            <h2 className={styles.previewTitle}>The bedroom most likely to mould</h2>
            <p className={styles.previewBody}>
              Pillow-level humidity, paired with the buffer that prevents it. One bedroom, one
              recommendation.
            </p>
          </li>
          <li className={styles.previewItem}>
            <span className={styles.previewKey}>Quiet</span>
            <h2 className={styles.previewTitle}>The corner to leave alone</h2>
            <p className={styles.previewBody}>
              Anti-cure: one corner the home is asking you not to fill for ninety days.
            </p>
          </li>
        </ul>
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

function openingBadgeCopy(openingAreaPct: number): string {
  return openingAreaPct >= 12
    ? `${openingAreaPct}% openings. Wind Gate ready.`
    : `${openingAreaPct}% openings. Fan Anchor likely.`;
}

function formatScout(scout: "breath" | "glow" | "quiet" | "damp"): string {
  const labels = {
    breath: "Air",
    glow: "Heat",
    quiet: "Quiet",
    damp: "Damp",
  };
  return labels[scout];
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
  return roomId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
