"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { UrlObject } from "url";
import { useThresholdStore } from "@/lib/store";
import { TEMPLATES } from "@/lib/templates";
import TemplateCard from "./TemplateCard";
import Compass from "./Compass";
import FloorSlider from "./FloorSlider";
import ScenarioPicker from "./ScenarioPicker";
import ReadingPanel from "./ReadingPanel";
import styles from "./threshold.module.css";

const EASE_KANSO: [number, number, number, number] = [0.22, 0.61, 0.36, 1];

export default function ThresholdClient() {
  // Boolean derivation runs in selector; primitive equality avoids re-render.
  const ready = useThresholdStore(
    (s) => s.templateId !== null && s.scenarioId !== null,
  );
  const templateId = useThresholdStore((s) => s.templateId);
  const compassIndex = useThresholdStore((s) => s.compassIndex);
  const floor = useThresholdStore((s) => s.floor);
  const scenarioId = useThresholdStore((s) => s.scenarioId);
  const bonesHref: "/bones" | UrlObject =
    ready && templateId && scenarioId
      ? {
          pathname: "/bones",
          query: {
            template: templateId,
            compass: compassIndex * 15,
            floor,
            scenario: scenarioId,
          },
        }
      : "/bones";

  return (
    <div className={styles.studio}>
      <div className={styles.stages}>
        <Stage num="01" title="Choose the unit" caption="HDB Archetype · three canonical layouts ship in Phase 1.">
          <div className={styles.templateGrid}>
            {TEMPLATES.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        </Stage>

        <Stage
          num="02"
          title="Turn the door"
          caption="Rotate until the arrow matches your real main door's facing. Snaps to 24 directions."
        >
          <Compass />
        </Stage>

        <Stage
          num="03"
          title="Choose the floor"
          caption="Wind behaves differently on a low floor, the Golden range, and high turbulence above."
        >
          <FloorSlider />
        </Stage>

        <Stage
          num="04"
          title="Where are you in the home?"
          caption="Common Household Scenario. We do not infer demographics from your answer."
        >
          <ScenarioPicker />
        </Stage>

        <motion.div
          className={styles.continueRow}
          initial={false}
          animate={{ opacity: ready ? 1 : 0.35 }}
          transition={{ duration: 0.32, ease: EASE_KANSO }}
        >
          <p className={styles.continueCopy}>
            {ready
              ? "All four set. The house is listening."
              : "Set all four to begin Reading the Bones."}
          </p>
          <Link
            href={bonesHref}
            aria-disabled={!ready}
            className={`${styles.continueBtn} ${ready ? styles.continueReady : ""}`}
            tabIndex={ready ? 0 : -1}
            onClick={(e) => { if (!ready) e.preventDefault(); }}
          >
            <span>Continue</span>
            <span className={styles.arrow} aria-hidden>→</span>
          </Link>
        </motion.div>
      </div>

      <ReadingPanel />
    </div>
  );
}

interface StageProps {
  num: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}

function Stage({ num, title, caption, children }: StageProps) {
  return (
    <section className={styles.stage}>
      <header className={styles.stageHd}>
        <span className={styles.stageNum}>{num}</span>
        <h2 className={styles.stageTitle}>{title}</h2>
        <p className={styles.stageCaption}>{caption}</p>
      </header>
      <div className={styles.stageBody}>{children}</div>
    </section>
  );
}
