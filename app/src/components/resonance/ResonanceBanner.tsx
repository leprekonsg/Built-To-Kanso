"use client";

// Brief 14.5 — in-app surface for Resonance Hours.
// VAPID/web-push is out of Phase 1, so the relationship loop lives here:
// poll /api/resonance/check on a 60s cadence, show ONE calm banner per real
// alignment event, and respect the user's prefers-reduced-motion setting.
//
// The dedup key is the alignmentEventId returned by the server: stable across
// consecutive polls of the same alignment, regenerated when wind drifts and
// re-aligns. We track dismissed and shown ids in sessionStorage so the user
// sees each event ONCE per browser session — re-opening the studio surfaces
// the next event, not the previous one.

import { useEffect, useMemo, useState } from "react";
import type { PlanGeometry } from "@/server/geometry/types";
import type { FloorTier } from "@/server/resonance/types";
import styles from "./ResonanceBanner.module.css";

type BannerKind = "alignment" | "quiet_floor" | "silent";

interface ResonanceBannerPayload {
  kind: BannerKind;
  title: string;
  body: string;
  alignmentEventId: string | null;
  floorTier: FloorTier;
  floorMessage: string;
}

interface ResonanceCheckResponse {
  banner?: ResonanceBannerPayload;
  wind?: { source?: "nea" | "mock"; stationId?: string };
}

interface ResonanceStatusResponse {
  pushDispatch?: {
    available: boolean;
    status: "configured" | "not_configured" | "dependency_unavailable";
    message?: string;
  };
}

export interface ResonanceBannerProps {
  plan: PlanGeometry;
  floor: number;
  /** Override poll interval (ms). Default 60_000 to honour NEA's 60s cache. */
  pollIntervalMs?: number;
  /** Optional site location passed through to the NEA station picker. */
  siteLocation?: { latitude: number; longitude: number };
}

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const SESSION_DISMISSED_KEY = "btk:resonance:dismissed";
const SESSION_QUIET_DISMISSED_KEY = "btk:resonance:quietFloorDismissed";

export default function ResonanceBanner({
  plan,
  floor,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  siteLocation,
}: ResonanceBannerProps) {
  const [banner, setBanner] = useState<ResonanceBannerPayload | null>(null);
  const [windSource, setWindSource] = useState<"nea" | "mock" | null>(null);
  const [pushStatus, setPushStatus] = useState<ResonanceStatusResponse["pushDispatch"] | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [quietDismissed, setQuietDismissed] = useState(false);

  // Hydrate dismissed sets from sessionStorage on mount. SSR-safe: window check.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = window.sessionStorage.getItem(SESSION_DISMISSED_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setDismissedIds(new Set(parsed.filter((id): id is string => typeof id === "string")));
          }
        }
        const quiet = window.sessionStorage.getItem(SESSION_QUIET_DISMISSED_KEY);
        if (quiet === "1") setQuietDismissed(true);
      } catch {
        // sessionStorage may be disabled (private browsing, sandboxed iframe).
        // The banner still works for the current session, just without dedup
        // persistence. Failing silently keeps the calm voice intact.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadStatus() {
      try {
        const response = await fetch("/api/resonance/check", {
          method: "GET",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const json = (await response.json()) as ResonanceStatusResponse;
        setPushStatus(json.pushDispatch ?? null);
      } catch {
        // Status note is informational; the in-app loop still polls below.
      }
    }
    void loadStatus();
    return () => controller.abort();
  }, []);

  // Polling loop. fetch on mount, then on the configured cadence. Cleans up
  // its abort controller and timer on unmount. Errors stay silent — the
  // banner simply doesn't appear, which matches the "silent unless aligned"
  // contract from brief 14.5.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const response = await fetch("/api/resonance/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan, floor, siteLocation }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const json = (await response.json()) as ResonanceCheckResponse;
        if (cancelled) return;
        if (json.wind?.source) setWindSource(json.wind.source);
        if (json.banner) {
          setBanner(json.banner);
        }
      } catch {
        // Aborted or network error: stay quiet.
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, pollIntervalMs);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [plan, floor, siteLocation, pollIntervalMs]);

  const visible = useMemo(() => {
    if (!banner) return null;
    if (banner.kind === "silent") return null;
    if (banner.kind === "quiet_floor") {
      return quietDismissed ? null : banner;
    }
    if (banner.kind === "alignment") {
      const id = banner.alignmentEventId;
      // Defensive: if the server forgot the id, treat as silent rather than
      // re-firing every poll.
      if (!id) return null;
      if (dismissedIds.has(id)) return null;
      return banner;
    }
    return null;
  }, [banner, dismissedIds, quietDismissed]);

  const onDismiss = () => {
    if (!banner) return;
    if (banner.kind === "alignment" && banner.alignmentEventId) {
      const dismissedId = banner.alignmentEventId;
      setDismissedIds((current) => {
        const next = new Set(current);
        next.add(dismissedId);
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              SESSION_DISMISSED_KEY,
              JSON.stringify(Array.from(next)),
            );
          }
        } catch {
          // sessionStorage unavailable — accept in-memory dedup only.
        }
        return next;
      });
      return;
    }
    if (banner.kind === "quiet_floor") {
      setQuietDismissed(true);
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(SESSION_QUIET_DISMISSED_KEY, "1");
        }
      } catch {
        // sessionStorage unavailable — accept in-memory dedup only.
      }
    }
  };

  const pushDisabled = pushStatus ? !pushStatus.available : true;

  if (!visible && !pushDisabled) return null;

  const isAlignment = visible?.kind === "alignment";
  const className = [
    styles.banner,
    isAlignment ? styles.bannerAlignment : styles.bannerQuiet,
    styles.fadeIn,
  ].join(" ");

  return (
    <section
      className={styles.region}
      role="region"
      aria-label="Resonance Hours"
      data-testid="resonance-banner"
    >
      {visible ? (
        <div
          className={className}
          role={isAlignment ? "status" : undefined}
          aria-live={isAlignment ? "polite" : undefined}
        >
          <div className={styles.copyStack}>
            <span className={styles.eyebrow}>
              {isAlignment ? "Resonance Hour" : "Resonance Hours"}
            </span>
            <p className={styles.title}>{visible.title}</p>
            <p className={`${styles.body} ${isAlignment ? "" : styles.bodyMuted}`}>
              {visible.body}
            </p>
            {isAlignment && windSource ? (
              <span className={styles.source}>
                <span>Source</span>
                <span>{windSource === "nea" ? "NEA wind station" : "mock vector"}</span>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={styles.dismiss}
            onClick={onDismiss}
            aria-label={isAlignment ? "Dismiss this Resonance Hour" : "Hide low-floor note"}
            data-testid="resonance-banner-dismiss"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {pushDisabled ? (
        <div className={styles.pushNote} data-testid="resonance-push-disabled">
          <span className={styles.eyebrow}>Push disabled</span>
          <p className={styles.body}>
            VAPID is not configured. Resonance stays in-app for this demo.
          </p>
        </div>
      ) : null}
    </section>
  );
}
