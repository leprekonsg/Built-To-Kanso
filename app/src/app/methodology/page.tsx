import type { Metadata } from "next";
import styles from "./methodology.module.css";
import {
  methodologyDisclosures,
  methodologyEvidenceTiers,
  methodologyHardRules,
  methodologyMeasuredClaims,
} from "@/lib/methodologyContent";

export const metadata: Metadata = {
  title: "Methodology | Built-To-Kanso",
  description:
    "How Built-To-Kanso separates cultural framing, heuristic estimates, official constraints, weather context, and prototype visualisation.",
};

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
          <p>{methodologyDisclosures.systemFraming}</p>
          <p>{methodologyDisclosures.nanyangPositioning}</p>
        </div>
        <aside className={styles.disclosure} aria-label="Cultural disclosure">
          <span className={styles.label}>{methodologyDisclosures.culturalLabel}</span>
          <p>{methodologyDisclosures.etymology}</p>
        </aside>
      </section>

      <section id="evidence" className={styles.section} aria-labelledby="evidence-title">
        <div className={styles.sectionHead}>
          <p className={styles.sectionNum}>01</p>
          <h2 id="evidence-title">Evidence ladder</h2>
          <p>{methodologyDisclosures.evidenceIntro}</p>
        </div>
        <div className={styles.evidenceList}>
          {methodologyEvidenceTiers.map((item) => (
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
          <p>{methodologyDisclosures.measureIntro}</p>
        </div>
        <ul className={styles.measureList}>
          {methodologyMeasuredClaims.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.audit} aria-labelledby="audit-title">
        <div>
          <p className={styles.sectionNum}>03</p>
          <h2 id="audit-title">Audit gap</h2>
        </div>
        <p>{methodologyDisclosures.auditGap}</p>
      </section>

      <section id="rules" className={styles.section} aria-labelledby="rules-title">
        <div className={styles.sectionHead}>
          <p className={styles.sectionNum}>04</p>
          <h2 id="rules-title">Hard rules</h2>
          <p>These rules protect compliance, cultural honesty, and the homeowner voice.</p>
        </div>
        <ol className={styles.ruleList}>
          {methodologyHardRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
