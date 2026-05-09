"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanGeometry, Point } from "@/server/geometry/types";
import {
  TOKEN_PERSONALITY_PROFILES,
  type TokenId,
  type TokenPersonalityVariant,
} from "@/server/rules/tokens";
import TokenTray, { TOKEN_DEFINITIONS } from "./TokenTray";
import PlanCanvas, { type PlacedToken } from "./PlanCanvas";
import GhostPreview, { type GhostPreviewData } from "./GhostPreview";
import styles from "./TokenStudio.module.css";

interface TokenStudioProps {
  plan: PlanGeometry;
  compassDeg: number;
  floor: number;
  placed?: PlacedToken[];
  onPlacedChange?: (placed: PlacedToken[]) => void;
}

const MAX_TOKENS = 6;
const DEBOUNCE_MS = 120;
const COMMIT_TIMEOUT_MS = 8000;

interface GhostFuturesResponse {
  futures?: GhostPreviewData[];
  error?: string;
}

function makePlacementId(tokenId: TokenId, point: Point): string {
  // Stable enough for React keys without pulling in a uuid lib.
  return `${tokenId}-${point.x.toFixed(3)}-${point.y.toFixed(3)}-${Date.now().toString(36)}`;
}

export default function TokenStudio({
  plan,
  compassDeg,
  floor,
  placed: controlledPlaced,
  onPlacedChange,
}: TokenStudioProps) {
  const [internalPlaced, setInternalPlaced] = useState<PlacedToken[]>([]);
  const [draggingTokenId, setDraggingTokenId] = useState<TokenId | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<TokenId | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [ghostData, setGhostData] = useState<GhostPreviewData | GhostPreviewData[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [variant, setVariant] = useState<TokenPersonalityVariant>("wabi_sabi");

  // Hover state used only inside handlers; ref avoids subscribed re-renders during pointer moves.
  const hoverPointRef = useRef<Point | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refusalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const refusalIdRef = useRef<number>(0);
  const isCommittingRef = useRef<boolean>(false);
  const placed = controlledPlaced ?? internalPlaced;
  const setPlaced = useCallback(
    (updater: (current: PlacedToken[]) => PlacedToken[]) => {
      if (controlledPlaced && onPlacedChange) {
        onPlacedChange(updater(controlledPlaced));
        return;
      }
      setInternalPlaced(updater);
    },
    [controlledPlaced, onPlacedChange],
  );

  // Derived state — re-derived each render from current state.
  const remainingByToken = useMemo<Record<TokenId, number>>(() => {
    const counts = TOKEN_DEFINITIONS.reduce(
      (map, token) => {
        map[token.id] = 1;
        return map;
      },
      {} as Record<TokenId, number>,
    );
    // For Phase 1 we cap total tokens at 6 across all kinds. Each token id may be placed multiple times until the cap is reached.
    const totalRemaining = Math.max(0, MAX_TOKENS - placed.length);
    return TOKEN_DEFINITIONS.reduce(
      (map, token) => {
        map[token.id] = totalRemaining > 0 ? totalRemaining : 0;
        return map;
      },
      counts,
    );
  }, [placed.length]);

  const armedTokenId: TokenId | null = draggingTokenId ?? selectedTokenId;
  const trayDisabled = placed.length >= MAX_TOKENS;
  const isPointAllowed: boolean | null = ghostData && !Array.isArray(ghostData) ? ghostData.allowed : null;

  // Cleanup pending timers / fetches on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (refusalTimeoutRef.current) clearTimeout(refusalTimeoutRef.current);
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
    };
  }, []);

  const fetchGhostComparison = useCallback(async () => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setIsLoading(true);

    try {
      const response = await fetch("/api/ghost-futures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          templateId: plan.templateId,
          compassDeg,
          floor,
          placements: toTokenPlacements(placed),
        }),
      });
      if (!response.ok) {
        setGhostData(null);
        return;
      }
      const json = (await response.json()) as GhostFuturesResponse;
      setGhostData(json.futures ?? null);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setGhostData(null);
    } finally {
      if (fetchAbortRef.current === controller) {
        setIsLoading(false);
        fetchAbortRef.current = null;
      }
    }
  }, [plan.templateId, compassDeg, floor, placed]);

  useEffect(() => {
    if (draggingTokenId || selectedTokenId || refusal) return;
    void fetchGhostComparison();
  }, [draggingTokenId, selectedTokenId, refusal, fetchGhostComparison]);

  const fetchGhostFuture = useCallback(
    async (tokenId: TokenId, point: Point) => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      setIsLoading(true);

      try {
        const response = await fetch("/api/ghost-futures", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            templateId: plan.templateId,
            compassDeg,
            floor,
            placements: toTokenPlacements(placed),
            candidates: [{ tokenId, point }],
          }),
        });
        if (!response.ok) {
          setGhostData(null);
          return;
        }
        const json = (await response.json()) as GhostFuturesResponse;
        const future = json.futures?.[0] ?? null;
        setGhostData(future);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setGhostData(null);
      } finally {
        if (fetchAbortRef.current === controller) {
          setIsLoading(false);
          fetchAbortRef.current = null;
        }
      }
    },
    [plan.templateId, compassDeg, floor, placed],
  );

  const scheduleGhostFetch = useCallback(
    (tokenId: TokenId, point: Point) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchGhostFuture(tokenId, point);
      }, DEBOUNCE_MS);
    },
    [fetchGhostFuture],
  );

  const handleDragStart = useCallback((tokenId: TokenId) => {
    setDraggingTokenId(tokenId);
    setRefusal(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingTokenId(null);
    setHoverPoint(null);
    hoverPointRef.current = null;
    setGhostData(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleSelect = useCallback((tokenId: TokenId | null) => {
    setSelectedTokenId(tokenId);
    setRefusal(null);
    if (!tokenId) {
      setHoverPoint(null);
      hoverPointRef.current = null;
      setGhostData(null);
    }
  }, []);

  const handlePointerHover = useCallback(
    (point: Point | null) => {
      hoverPointRef.current = point;
      setHoverPoint(point);
      const tokenId = draggingTokenId ?? selectedTokenId;
      if (!point || !tokenId) return;
      scheduleGhostFetch(tokenId, point);
    },
    [draggingTokenId, selectedTokenId, scheduleGhostFetch],
  );

  const surfaceRefusal = useCallback((message: string) => {
    refusalIdRef.current += 1;
    const myId = refusalIdRef.current;
    setRefusal(message);
    if (refusalTimeoutRef.current) clearTimeout(refusalTimeoutRef.current);
    refusalTimeoutRef.current = setTimeout(() => {
      // Only clear if no newer refusal has been queued.
      if (refusalIdRef.current === myId) setRefusal(null);
    }, 4200);
  }, []);

  const commitPlacement = useCallback(
    async (tokenId: TokenId, point: Point) => {
      // Re-entrancy guard: a rapid second drop while the first request is still
      // in flight would otherwise fire a duplicate validation request.
      if (isCommittingRef.current) return;
      // Need at least one slot.
      if (placed.length >= MAX_TOKENS) {
        surfaceRefusal("Six tokens placed. Remove one before adding another.");
        return;
      }

      // Cancel any in-flight hover fetch so its older response cannot overwrite
      // the commit's ghostData after this returns.
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      isCommittingRef.current = true;
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, COMMIT_TIMEOUT_MS);

      // Synchronous validation via /api/ghost-futures (single-source-of-truth backend).
      try {
        const response = await fetch("/api/ghost-futures", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            templateId: plan.templateId,
            compassDeg,
            floor,
            placements: toTokenPlacements(placed),
            candidates: [{ tokenId, point }],
          }),
        });
        if (!response.ok) {
          surfaceRefusal("The home could not read this placement. Try again.");
          return;
        }
        const json = (await response.json()) as GhostFuturesResponse;
        const future = json.futures?.[0];
        if (!future) {
          surfaceRefusal("The home could not read this placement. Try again.");
          return;
        }
        if (!future.allowed) {
          // Refusal copy is the message from the server (Black-state or shaft buffer out-of-range).
          surfaceRefusal(future.preview);
          return;
        }

        // Functional setState for safe append.
        setPlaced((current) => {
          if (current.length >= MAX_TOKENS) return current;
          return [
            ...current,
            { placementId: makePlacementId(tokenId, point), tokenId, point },
          ];
        });
        setGhostData(future);
        setRefusal(null);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          if (timedOut) {
            surfaceRefusal("The home took too long to answer. Try again in a moment.");
          }
          // Otherwise the abort came from unmount; the user no longer needs a refusal.
          return;
        }
        surfaceRefusal("The home could not read this placement. Try again.");
      } finally {
        clearTimeout(timeoutId);
        if (fetchAbortRef.current === controller) fetchAbortRef.current = null;
        isCommittingRef.current = false;
      }
    },
    [placed, setPlaced, plan.templateId, compassDeg, floor, surfaceRefusal],
  );

  const handleCanvasDrop = useCallback(
    (tokenId: TokenId, point: Point) => {
      setDraggingTokenId(null);
      setHoverPoint(null);
      hoverPointRef.current = null;
      void commitPlacement(tokenId, point);
    },
    [commitPlacement],
  );

  const handleCanvasClick = useCallback(
    (point: Point) => {
      if (!selectedTokenId) return;
      const tokenId = selectedTokenId;
      setSelectedTokenId(null);
      setHoverPoint(null);
      hoverPointRef.current = null;
      void commitPlacement(tokenId, point);
    },
    [selectedTokenId, commitPlacement],
  );

  const handleRemovePlaced = useCallback((placementId: string) => {
    setPlaced((current) => current.filter((token) => token.placementId !== placementId));
    setRefusal(null);
  }, []);

  const idle = !armedTokenId && !ghostData;

  return (
    <section className={styles.studio} aria-label="Token tray and ghost-future preview">
      <div className={styles.canvasColumn}>
        <div className={styles.variantBar}>
          <label>
            <span>Token personality</span>
            <select
              aria-label="Token personality"
              value={variant}
              onChange={(event) => setVariant(event.currentTarget.value as TokenPersonalityVariant)}
            >
              {Object.values(TOKEN_PERSONALITY_PROFILES).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <PlanCanvas
          plan={plan}
          placed={placed}
          draggingTokenId={draggingTokenId}
          selectedTokenId={selectedTokenId}
          hoverPoint={hoverPoint}
          isPointAllowed={isPointAllowed}
          onPointerHover={handlePointerHover}
          onCanvasDrop={handleCanvasDrop}
          onCanvasClick={handleCanvasClick}
          onRemovePlaced={handleRemovePlaced}
        />
        <TokenTray
          variant={variant}
          selectedId={selectedTokenId}
          remainingByToken={remainingByToken}
          onSelect={handleSelect}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          disabled={trayDisabled}
        />
      </div>
      <div className={styles.previewColumn}>
        <GhostPreview
          idle={idle}
          data={ghostData}
          isLoading={isLoading}
          refusal={refusal}
          armedTokenId={armedTokenId}
          placedCount={placed.length}
        />
      </div>
    </section>
  );
}

function toTokenPlacements(tokens: ReadonlyArray<PlacedToken>) {
  return tokens.map(({ tokenId, point }) => ({ tokenId, point }));
}
