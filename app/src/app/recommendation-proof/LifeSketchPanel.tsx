"use client";

import { useEffect, useMemo, useState } from "react";
import type { TemplateId } from "@/server/geometry/types";
import styles from "./recommendation-proof.module.css";

interface LifeSketchPanelProps {
  templateId: TemplateId;
  anchorSrc: string;
}

interface LifeSketchState {
  status: "loading" | "ready" | "fallback" | "error";
  src: string;
  label: string;
  meta: string[];
}

export default function LifeSketchPanel({ templateId, anchorSrc }: LifeSketchPanelProps) {
  const [state, setState] = useState<LifeSketchState>({
    status: "loading",
    src: anchorSrc,
    label: "Life Sketch resolving",
    meta: ["prototype_visualisation", "accepted GPT Image 2 or deterministic fallback"],
  });

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    async function materialize() {
      setState({
        status: "loading",
        src: anchorSrc,
        label: "Life Sketch resolving",
        meta: ["prototype_visualisation", "accepted GPT Image 2 or deterministic fallback"],
      });

      try {
        const response = await fetch("/api/sketches/life", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "image/png,image/svg+xml",
          },
          body: JSON.stringify({ templateId }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Life Sketch request returned ${response.status}`);

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        const fallback = response.headers.get("X-Sketch-Fallback");
        const source = response.headers.get("X-Sketch-Source");
        const mode = response.headers.get("X-Life-Sketch-Mode");
        const anchorSource = response.headers.get("X-Life-Anchor-Source");
        const anchorScene = response.headers.get("X-Life-Anchor-Scene");
        const candidateCount = response.headers.get("X-Life-Sketch-Candidates");
        const acceptedCandidate = response.headers.get("X-Life-Sketch-Accepted-Candidate");
        const qaModel = response.headers.get("X-Life-Sketch-QA-Model");
        const cachePath = response.headers.get("X-Life-Sketch-Cache-Path");
        const tier = response.headers.get("X-Evidence-Tier") ?? "prototype_visualisation";
        const accepted = source === "accepted-gpt-image-2-prebake";
        const meta = [
          tier,
          mode ?? (accepted ? "accepted-gpt-image-2-prebake" : "deterministic-sumi-e"),
          source ?? "deterministic-sumi-e-life-sketch",
          candidateCount ? `${candidateCount} candidates` : null,
          acceptedCandidate ? `accepted ${acceptedCandidate}` : null,
          qaModel ? `reviewed by ${qaModel}` : null,
          cachePath ? `cache ${cachePath}` : null,
          fallback ? `fallback ${fallback}` : null,
          anchorSource ? `anchor ${anchorSource}` : "anchor source unavailable",
          anchorScene ?? "three-perspective-greybox-scene-manifest",
        ].filter((item): item is string => Boolean(item));

        setState({
          status: fallback ? "fallback" : "ready",
          src: objectUrl,
          label: accepted ? "Life Sketch accepted" : "Life Sketch deterministic fallback",
          meta,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          src: anchorSrc,
          label: "Life Sketch unavailable",
          meta: [
            "deterministic anchor shown",
            error instanceof Error ? error.message : "life sketch derivation failed",
          ],
        });
      }
    }

    materialize();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [anchorSrc, templateId]);

  const statusClass = useMemo(() => {
    if (state.status === "ready") return styles.lifeStatusReady;
    if (state.status === "fallback") return styles.lifeStatusFallback;
    if (state.status === "error") return styles.lifeStatusError;
    return styles.lifeStatusLoading;
  }, [state.status]);

  return (
    <section className={styles.lifePanel} aria-label="Life Sketch visual" data-testid="life-sketch-materialization">
      <div className={styles.panelTopline}>
        <span className={styles.eyebrow}>Life Sketch</span>
        <span className={`${styles.lifeStatus} ${statusClass}`}>{state.label}</span>
      </div>
      <div className={styles.lifeImageFrame}>
        <img src={state.src} alt={`${templateId} accepted Life Sketch or deterministic anchor`} />
      </div>
      <ul className={styles.lifeMeta} aria-label="Life Sketch provenance">
        {state.meta.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
