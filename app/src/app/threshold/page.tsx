import type { Metadata } from "next";
import ThresholdClient from "./ThresholdClient";
import styles from "./threshold.module.css";

export const metadata: Metadata = {
  title: "Threshold · Built-To-Kanso",
  description: "Pick your unit, set the compass, choose the floor. Ninety seconds to magic.",
};

// brief §6.1 — Stage 1: Threshold.
// Server shell renders editorial chrome; all input is on the client.
export default function ThresholdPage() {
  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            Built<span className={styles.brandHyphen}>-</span>To<span className={styles.brandHyphen}>-</span>Kanso
          </span>
          <span className={styles.brandSub}>Tropical Edition · 1.35° N</span>
        </div>
        <nav className={styles.crumbs} aria-label="Journey">
          <span className={styles.crumbActive}>
            <span className={styles.crumbNum}>01</span> Threshold
          </span>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbDim}>
            <span className={styles.crumbNum}>02</span> Bones
          </span>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbDim}>
            <span className={styles.crumbNum}>03</span> Weather
          </span>
          <span className={styles.crumbDot} aria-hidden />
          <span className={styles.crumbDim}>
            <span className={styles.crumbNum}>04</span> Tokens
          </span>
        </nav>
      </header>

      <section className={styles.intro}>
        <div className={styles.introCol}>
          <span className={styles.eyebrow}>
            <span className={styles.breath} aria-hidden /> Stage One
          </span>
          <h1 className={styles.headline}>
            Step over the<br />
            <em>threshold</em>.
          </h1>
          <p className={styles.lede}>
            Pick the unit. Turn the door to its facing. Choose the floor. Tell us where you are in the
            home — not who you are. In ninety seconds, the house begins to listen.
          </p>
        </div>
        <aside className={styles.disclosure} aria-label="Method">
          <span className={styles.disclosureLabel}>METHOD</span>
          <p className={styles.disclosureBody}>
            We are the <em>Nanyang</em>{" "}tropical school — wind welcomed, not hidden. Every rule
            here is calibrated for 1.35°&nbsp;N. The compass logic is Form-School feng shui (峦头派),
            not Japanese kasō.
          </p>
        </aside>
      </section>

      <ThresholdClient />
    </main>
  );
}
