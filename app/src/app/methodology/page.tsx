import type { Metadata } from "next";
import styles from "./methodology.module.css";

export const metadata: Metadata = {
  title: "Methodology | Built-To-Kanso",
  description:
    "How Built-To-Kanso separates cultural framing, heuristic estimates, official constraints, weather context, and prototype visualisation.",
};

const evidenceTiers = [
  {
    tier: "Official constraint",
    source: "HDB, SCDF, fixed compliance limits",
    use: "Hard stops. The product does not suggest moving, hiding, or altering fixed regulated elements.",
  },
  {
    tier: "Template fact",
    source: "Curated HDB plan geometry",
    use: "Room outlines, walls, openings, shafts, and legal token zones read from the template file.",
  },
  {
    tier: "Heuristic estimate",
    source: "Rule-based Phase 1 briefing model",
    use: "Scout asks, Damp bands, stagnation hints, and token effects. Useful for triage, not certification.",
  },
  {
    tier: "Weather context",
    source: "Singapore wind, monsoon, humidity, and west-sun patterns",
    use: "Explains why a reading changes with NE or SW monsoon behavior and late-afternoon heat.",
  },
  {
    tier: "Prototype visualisation",
    source: "Cloud-grade design simulation",
    use: "Wind and material views that explain assumptions. Not engineering certification.",
  },
] as const;

const hardRules = [
  "AI never edits compliance geometry, walls, streamlines, Damp Risk logic, or Black-state decisions.",
  "Streamlines are deterministic first. Image generation may polish allowed visuals only after the facts are fixed.",
  "Scout Pass surfaces at most three Asking Points. No scanner language, severity dashboards, or ranked defect backlog.",
  "Damp Risk appears as Clear, Watch, or High, and Watch or High always comes with a recommended action.",
  "Cosmological vocabulary is Cultural framing only. It never becomes a physical prediction.",
] as const;

const measured = [
  "opening area and cross-vent potential",
  "door facing, floor band, and monsoon exposure",
  "room adjacency to shafts, baths, windows, and fixed elements",
  "west-sun heat path from 16:00 to 18:30",
  "bedroom Damp Risk band, kept band-only in homeowner UI",
] as const;

export default function MethodologyPage() {
  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <a className={styles.brand} href="/threshold" aria-label="Built-To-Kanso Threshold">
          <span className={styles.brandMark}>
            Built<span className={styles.brandHyphen}>-</span>To<span className={styles.brandHyphen}>-</span>Kanso
          </span>
          <span className={styles.brandSub}>Methodology</span>
        </a>
        <nav className={styles.nav} aria-label="Methodology sections">
          <a href="#evidence">Evidence</a>
          <a href="#rules">Hard rules</a>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="methodology-title">
        <div>
          <p className={styles.eyebrow}>Phase 1 surface 25</p>
          <h1 id="methodology-title" className={styles.headline}>
            How the house is read.
          </h1>
        </div>
        <p className={styles.lede}>
          Built-To-Kanso is a heuristic briefing system for Singapore HDB homes. It helps a resident
          ask better questions before placement, renovation, or follow-up measurement.
        </p>
      </section>

      <section className={styles.statement} aria-label="Methodology framing">
        <div className={styles.statementMain}>
          <p>
            The product uses a hidden Scout and Shikaku diagnostic spine. It stays behind the surface:
            Breath, Glow, Quiet, Damp, and Shelter checks become calm Asking Points, not a defect report.
          </p>
          <p>
            We are not Hong Kong feng shui. We are not Beijing feng shui. We are Nanyang feng shui,
            the tropical school calibrated for 1.35° N, where wind is welcomed and west sun is designed against.
          </p>
        </div>
        <aside className={styles.disclosure} aria-label="Cultural disclosure">
          <span className={styles.label}>Cultural framing</span>
          <p>
            Built-To-Kanso draws its name from kansō (簡素), pared-down simplicity. The geomantic
            logic is Chinese Form-School feng shui (峦头派) and building science, not Japanese kasō (家相).
          </p>
        </aside>
      </section>

      <section id="evidence" className={styles.section} aria-labelledby="evidence-title">
        <div className={styles.sectionHead}>
          <p className={styles.sectionNum}>01</p>
          <h2 id="evidence-title">Evidence ladder</h2>
          <p>
            Every physical claim receives one of five tiers. Cultural framing is separate and never
            used as evidence for a physical effect.
          </p>
        </div>
        <div className={styles.evidenceList}>
          {evidenceTiers.map((item) => (
            <article className={styles.evidenceRow} key={item.tier}>
              <h3>{item.tier}</h3>
              <p className={styles.source}>{item.source}</p>
              <p>{item.use}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="measure-title">
        <div className={styles.sectionHead}>
          <p className={styles.sectionNum}>02</p>
          <h2 id="measure-title">What we measure</h2>
          <p>
            Phase 1 reads geometry and context. It does not claim lab measurement, medical diagnosis,
            prosperity forecasting, or HDB approval.
          </p>
        </div>
        <ul className={styles.measureList}>
          {measured.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.audit} aria-labelledby="audit-title">
        <div>
          <p className={styles.sectionNum}>03</p>
          <h2 id="audit-title">Audit gap</h2>
        </div>
        <p>
          Apartment-scale qi-flow validation is essentially absent from peer-reviewed literature beyond
          So and Lu, 2001. Prototype visualisations therefore ship as design simulation, with solver
          assumptions and grid resolution disclosed when rendered.
        </p>
      </section>

      <section id="rules" className={styles.section} aria-labelledby="rules-title">
        <div className={styles.sectionHead}>
          <p className={styles.sectionNum}>04</p>
          <h2 id="rules-title">Hard rules</h2>
          <p>These rules protect compliance, cultural honesty, and the homeowner voice.</p>
        </div>
        <ol className={styles.ruleList}>
          {hardRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
