"use client";

import { motion } from "framer-motion";
import type { Route } from "next";
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
  // Hard Rule #25: defaults are starting points, not consent. Continue
  // requires both template + scenario chosen AND explicit floor + compass
  // interaction. Boolean derivation runs in selector; primitive equality
  // avoids re-render.
  const ready = useThresholdStore(
    (s) =>
      s.templateId !== null &&
      s.scenarioId !== null &&
      s.compassTouched &&
      s.floorTouched,
  );
  const templateId = useThresholdStore((s) => s.templateId);
  const compassIndex = useThresholdStore((s) => s.compassIndex);
  const floor = useThresholdStore((s) => s.floor);
  const scenarioId = useThresholdStore((s) => s.scenarioId);
  const compassTouched = useThresholdStore((s) => s.compassTouched);
  const floorTouched = useThresholdStore((s) => s.floorTouched);
  const continueCopy = readyCopy({
    ready,
    hasTemplate: templateId !== null,
    hasScenario: scenarioId !== null,
    compassTouched,
    floorTouched,
  });
  const studioHref: Route | UrlObject =
    ready && templateId && scenarioId
      ? {
          pathname: "/studio",
          query: {
            template: templateId,
            compass: compassIndex * 15,
            floor,
            scenario: scenarioId,
          },
        }
      : ("/studio" as Route);

  return (
    <div className={styles.studio}>
      <div className={styles.stages}>
        <Stage num="01" title="Choose the unit" caption="HDB Archetype · three canonical layouts ship in Phase 1.">
          <div className={styles.templateEntry}>
            <PlanUploadStub />
            <div className={styles.templateGrid}>
              {TEMPLATES.map((t) => (
                <TemplateCard key={t.id} template={t} />
              ))}
            </div>
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
          <p className={styles.continueCopy}>{continueCopy}</p>
          <Link
            href={studioHref}
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

function PlanUploadStub() {
  return (
    <aside className={styles.uploadStub} aria-labelledby="plan-upload-title">
      <div className={styles.uploadStubCopy}>
        <span className={styles.uploadStubEyebrow}>Stub path</span>
        <h3 id="plan-upload-title" className={styles.uploadStubTitle}>
          Plan Upload
        </h3>
        <p className={styles.uploadStubBody}>
          Plan Upload is Phase 2. For Phase 1, choose one HDB template below.
        </p>
      </div>
      <button
        type="button"
        className={styles.uploadStubBtn}
        disabled
        aria-disabled="true"
      >
        Upload plan (Phase 2)
      </button>
    </aside>
  );
}

interface ReadyCopyArgs {
  ready: boolean;
  hasTemplate: boolean;
  hasScenario: boolean;
  compassTouched: boolean;
  floorTouched: boolean;
}

// Calm voice. No severity, no scolding — just names what's pending.
function readyCopy({
  ready,
  hasTemplate,
  hasScenario,
  compassTouched,
  floorTouched,
}: ReadyCopyArgs): string {
  if (ready) return "All four set. The house is listening.";

  const pending: string[] = [];
  if (!hasTemplate) pending.push("the unit");
  if (!compassTouched) pending.push("the door");
  if (!floorTouched) pending.push("the floor");
  if (!hasScenario) pending.push("the moment");

  if (pending.length === 4) return "Set all four to enter the Studio.";
  if (pending.length === 1) return `Confirm ${pending[0]} before continuing.`;
  if (pending.length === 2)
    return `Confirm ${pending[0]} and ${pending[1]} before continuing.`;
  // 3 pending — list with calm cadence.
  const head = pending.slice(0, -1).join(", ");
  const tail = pending[pending.length - 1];
  return `Confirm ${head}, and ${tail} before continuing.`;
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
