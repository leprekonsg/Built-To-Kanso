import type { Metadata } from "next";
import Link from "next/link";
import type { UrlObject } from "url";
import VoiceToggle from "@/components/VoiceToggle";
import { TEMPLATES, type TemplateId } from "@/lib/templates";
import {
  parseThresholdParams,
  type ThresholdParamIssue,
} from "@/lib/thresholdParams";
import { EVIDENCE_TIER_LABELS, type EvidenceTier } from "@/server/evidence";
import { getPlanGeometry } from "@/server/geometry/registry";
import type { Point } from "@/server/geometry/types";
import { buildRecommendationProof, type RecommendationAction, type RecommendationProof } from "@/server/recommendations/proof";
import type { SimulationStreamline } from "@/server/simulation/types";
import LifeSketchPanel from "./LifeSketchPanel";
import styles from "./recommendation-proof.module.css";

export const metadata: Metadata = {
  title: "Recommendation Proof · Built-To-Kanso",
};

type SearchParams = Record<string, string | string[] | undefined>;

interface RecommendationProofPageProps {
  searchParams?: Promise<SearchParams>;
}

export default async function RecommendationProofPage({ searchParams }: RecommendationProofPageProps) {
  const params = (await searchParams) ?? {};
  const parsed = parseThresholdParams({
    template: first(params.template),
    compass: first(params.compass),
    floor: first(params.floor),
    scenario: first(params.scenario),
  });
  const { templateId, compassDeg, floor, scenarioId, issues } = parsed;
  const scenario = scenarioId ?? undefined;

  if (issues.length > 0) {
    return <ParamErrorsState issues={issues} />;
  }
  if (templateId === null || compassDeg === null || floor === null) {
    return <MissingInputs />;
  }

  const plan = getPlanGeometry(templateId);
  const template = TEMPLATES.find((item) => item.id === templateId);
  const proof = buildRecommendationProof({ plan, compassDeg, floor });
  const backHref = bonesHref({ templateId, compassDeg, floor, scenario });

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/threshold" className={styles.brand} aria-label="Back to Threshold">
          <span className={styles.brandMark}>
            Built<span className={styles.brandHyphen}>-</span>To<span className={styles.brandHyphen}>-</span>Kanso
          </span>
          <span className={styles.brandSub}>Stage Six · Recommendation Proof</span>
        </Link>
        <nav className={styles.crumbs} aria-label="Journey">
          <Link href={backHref} className={styles.crumbDim}>
            <span className={styles.crumbNum}>02</span> Bones
          </Link>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbActive}><span className={styles.crumbNum}>06</span> Proof</span>
        </nav>
        <VoiceToggle />
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Action proof</span>
          <h1>Place these. Leave that clear.</h1>
          <p>
            {template?.name ?? templateId} keeps geometry, airflow, and materialization on separate rails.
            The plan decides the moves; the Life Sketch only makes the home visible.
          </p>
        </div>
        <aside className={styles.inputStrip} aria-label="Threshold inputs">
          <InputStat label="Door" value={`${String(compassDeg).padStart(3, "0")} deg`} />
          <InputStat label="Floor" value={String(floor)} />
          <InputStat label="Reserve" value={`${proof.reservePct}% empty`} />
        </aside>
      </section>

      <section className={styles.proofGrid}>
        <section className={styles.flowPanel} aria-label="Deterministic airflow and placement proof" data-testid="recommendation-proof-flow">
          <div className={styles.panelTopline}>
            <span className={styles.eyebrow}>Flow and placement</span>
            <span className={styles.tierBadge}>{formatTier(proof.simulationTier)}</span>
          </div>
          <ol className={styles.markerStrip} aria-label="Placement marker key">
            {proof.actions.map((action) => (
              <li key={action.id}>
                <span>{action.marker}</span>
                <strong>{action.label}</strong>
                <em>{action.object}, {action.roomLabel}</em>
              </li>
            ))}
          </ol>
          <ProofPlan proof={proof} />
          <div className={styles.sourceRail} aria-label="Proof sources">
            <SourceItem label="Geometry" value={proof.source.geometry} />
            <SourceItem label="Airflow" value={proof.source.airflow} />
            <SourceItem label="Life" value={proof.source.lifeSketch} />
          </div>
        </section>

        <LifeSketchPanel
          templateId={templateId}
          anchorSrc={`/life-anchors/${templateId}/anchor.png`}
        />
      </section>

      <section className={styles.actionSection} aria-label="Recommended moves" data-testid="recommendation-proof-actions">
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>First moves</span>
          <h2>Three decisions, one receipt.</h2>
        </div>
        <div className={styles.actionGrid}>
          {proof.actions.map((action) => (
            <article key={action.id} className={styles.actionCard}>
              <span className={styles.actionMarker}>{action.marker}</span>
              <div>
                <span className={styles.actionKind}>{formatActionKind(action.kind)}</span>
                <h3>{action.label}</h3>
                <p className={styles.objectLine}>{action.object}</p>
                <p>{action.copy}</p>
              </div>
              <dl>
                <div>
                  <dt>Room</dt>
                  <dd>{action.roomLabel}</dd>
                </div>
                <div>
                  <dt>Point</dt>
                  <dd>{formatPoint(action.point)}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>{formatTier(action.tier)}</dd>
                </div>
              </dl>
              <p className={styles.proofLine}>{action.proof}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.comparisonGrid} aria-label="Sketch comparison">
        <figure>
          <img src={`/life-anchors/${templateId}/anchor.png`} alt={`${templateId} locked camera greybox anchor`} />
          <figcaption>Image 1: locked greybox anchor</figcaption>
        </figure>
        <figure>
          <img src={`/plan-sketches/${templateId}/plan.png`} alt={`${templateId} topology proof`} />
          <figcaption>Image 2: topology proof</figcaption>
        </figure>
        <section className={styles.receiptPanel} aria-label="House Changelog">
          <span className={styles.eyebrow}>House Changelog</span>
          <ul>
            {proof.changelog.map((line) => (
              <li key={line}>{line}.</li>
            ))}
          </ul>
        </section>
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
          <span className={styles.brandSub}>Stage Six · Recommendation Proof</span>
        </Link>
      </header>
      <section className={styles.missingHero}>
        <span className={styles.eyebrow}>Proof needs a home</span>
        <h1>The proof waits for the threshold.</h1>
        <p>Choose a template, door direction, and floor first. The recommendations need those readings before they can point to a room.</p>
        <Link href="/threshold" className={styles.primaryLink}>Return to Threshold</Link>
      </section>
    </main>
  );
}

function ParamErrorsState({ issues }: { issues: ThresholdParamIssue[] }) {
  return (
    <main className={styles.missingPage} data-testid="recommendation-proof-param-errors">
      <header className={styles.masthead}>
        <Link href="/threshold" className={styles.brand} aria-label="Built-To-Kanso, return to Threshold">
          <span className={styles.brandMark}>
            Built<span className={styles.brandHyphen}>-</span>To<span className={styles.brandHyphen}>-</span>Kanso
          </span>
          <span className={styles.brandSub}>Stage Six · Recommendation Proof</span>
        </Link>
      </header>
      <section className={styles.missingHero}>
        <span className={styles.eyebrow}>Threshold reading didn&rsquo;t parse</span>
        <h1>The URL was read, not understood.</h1>
        <p>
          {issues.length === 1
            ? "One Threshold input didn’t match what the proof expects."
            : `${issues.length} Threshold inputs didn’t match what the proof expects.`}{" "}
          Fix the URL using the rows below, or set the inputs again at the Threshold.
        </p>
        <dl className={styles.issueList} data-testid="recommendation-proof-param-issues">
          {issues.map((issue) => (
            <div className={styles.issueRow} key={`${issue.field}:${issue.raw}`} data-issue-field={issue.field}>
              <dt className={styles.issueField}>{issue.field}</dt>
              <dd>
                <code className={styles.issueRaw}>{issue.raw}</code>
                <span className={styles.issueReason}>{issue.reason}</span>
              </dd>
            </div>
          ))}
        </dl>
        <Link href="/threshold" className={styles.primaryLink}>Return to Threshold</Link>
      </section>
    </main>
  );
}

function ProofPlan({ proof }: { proof: RecommendationProof }) {
  const { plan } = proof;
  const viewBox = `${plan.bounds.x - 0.45} ${plan.bounds.y - 0.45} ${plan.bounds.width + 0.9} ${plan.bounds.height + 0.9}`;

  return (
    <svg className={styles.proofPlan} viewBox={viewBox} role="img" aria-label={`${plan.templateId} recommendation proof plan`}>
      <rect
        x={plan.bounds.x}
        y={plan.bounds.y}
        width={plan.bounds.width}
        height={plan.bounds.height}
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
      <g aria-label="Deterministic airflow streamlines">
        {proof.streamlines.map((line) => (
          <path
            key={line.id}
            d={streamlinePath(line)}
            className={line.material === "sumi_ink" ? styles.shaftStreamline : styles.cleanStreamline}
          />
        ))}
      </g>
      <g aria-label="Air particles">
        {proof.particles.map((particle) => (
          <circle
            key={particle.id}
            cx={particle.x}
            cy={particle.y}
            r={particle.kind === "pipeshaft_drift" ? 0.08 : 0.07}
            className={particle.kind === "pipeshaft_drift" ? styles.shaftParticle : styles.cleanParticle}
          />
        ))}
      </g>
      <g aria-label="Recommended placement markers">
        {proof.actions.map((action) => (
          <g key={action.id} className={styles.actionPoint}>
            <circle cx={action.point.x} cy={action.point.y} r="0.22" />
            <text x={action.point.x} y={action.point.y + 0.04}>{action.marker}</text>
          </g>
        ))}
      </g>
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

function SourceItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function streamlinePath(line: SimulationStreamline): string {
  return line.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function bonesHref(input: {
  templateId: TemplateId;
  compassDeg: number;
  floor: number;
  scenario?: string;
}): UrlObject {
  return {
    pathname: "/bones",
    query: {
      template: input.templateId,
      compass: String(input.compassDeg),
      floor: String(input.floor),
      ...(input.scenario ? { scenario: input.scenario } : {}),
    },
  };
}

function formatPoint(point: Point): string {
  return `${point.x.toFixed(2)}m, ${point.y.toFixed(2)}m`;
}

function formatTier(tier: EvidenceTier): string {
  return EVIDENCE_TIER_LABELS[tier];
}

function formatActionKind(kind: RecommendationAction["kind"]): string {
  if (kind === "keep_clear") return "Keep clear";
  if (kind === "behavior") return "Behavior";
  return "Place";
}
