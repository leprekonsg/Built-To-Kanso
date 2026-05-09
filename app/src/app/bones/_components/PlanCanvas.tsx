"use client";

import { useCallback, useRef } from "react";
import type { PlanGeometry, Point } from "@/server/geometry/types";
import type { TokenId } from "@/server/rules/tokens";
import { TOKEN_DEFINITIONS } from "./TokenTray";
import styles from "./PlanCanvas.module.css";

export interface PlacedToken {
  placementId: string;
  tokenId: TokenId;
  point: Point;
}

interface PlanCanvasProps {
  plan: PlanGeometry;
  placed: ReadonlyArray<PlacedToken>;
  draggingTokenId: TokenId | null;
  selectedTokenId: TokenId | null;
  hoverPoint: Point | null;
  isPointAllowed: boolean | null;
  onPointerHover: (point: Point | null) => void;
  onCanvasDrop: (tokenId: TokenId, point: Point) => void;
  onCanvasClick: (point: Point) => void;
  onRemovePlaced: (placementId: string) => void;
}

const INITIAL_BY_ID: Record<TokenId, string> = TOKEN_DEFINITIONS.reduce(
  (map, token) => {
    map[token.id] = token.initial;
    return map;
  },
  {} as Record<TokenId, string>,
);

export default function PlanCanvas({
  plan,
  placed,
  draggingTokenId,
  selectedTokenId,
  hoverPoint,
  isPointAllowed,
  onPointerHover,
  onCanvasDrop,
  onCanvasClick,
  onRemovePlaced,
}: PlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointerCommitRef = useRef(false);
  const { bounds } = plan;
  const viewBox = `${bounds.x - 0.4} ${bounds.y - 0.4} ${bounds.width + 0.8} ${bounds.height + 0.8}`;
  const showShaftCircle = draggingTokenId === "shaft_buffer" || selectedTokenId === "shaft_buffer";

  const eventToPlanPoint = useCallback((event: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const inverse = ctm.inverse();
    const transformed = pt.matrixTransform(inverse);
    return { x: transformed.x, y: transformed.y };
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<SVGSVGElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const point = eventToPlanPoint(event);
      if (point) onPointerHover(point);
    },
    [eventToPlanPoint, onPointerHover],
  );

  const handleDragLeave = useCallback(() => {
    onPointerHover(null);
  }, [onPointerHover]);

  const handleDrop = useCallback(
    (event: React.DragEvent<SVGSVGElement>) => {
      event.preventDefault();
      const tokenId = event.dataTransfer.getData("text/plain") as TokenId;
      const point = eventToPlanPoint(event);
      if (!tokenId || !point) return;
      onCanvasDrop(tokenId, point);
    },
    [eventToPlanPoint, onCanvasDrop],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      // Only track hover when a chip is selected (keyboard fallback) or being dragged.
      if (!draggingTokenId && !selectedTokenId) return;
      const point = eventToPlanPoint(event);
      if (point) onPointerHover(point);
    },
    [draggingTokenId, selectedTokenId, eventToPlanPoint, onPointerHover],
  );

  const handlePointerLeave = useCallback(() => {
    onPointerHover(null);
  }, [onPointerHover]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!selectedTokenId || event.button !== 0) return;
      if (event.target !== event.currentTarget) return;
      const point = eventToPlanPoint(event);
      if (!point) return;
      pointerCommitRef.current = true;
      event.preventDefault();
      onCanvasClick(point);
    },
    [selectedTokenId, eventToPlanPoint, onCanvasClick],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (pointerCommitRef.current) {
        pointerCommitRef.current = false;
        return;
      }
      if (!selectedTokenId) return;
      const point = eventToPlanPoint(event);
      if (point) onCanvasClick(point);
    },
    [selectedTokenId, eventToPlanPoint, onCanvasClick],
  );

  const ghostClassName =
    isPointAllowed === false ? styles.ghostBlocked : styles.ghostValid;

  return (
    <svg
      ref={svgRef}
      className={`${styles.planSvg} ${draggingTokenId || selectedTokenId ? styles.canvasArmed : ""}`}
      viewBox={viewBox}
      role="application"
      aria-label={`${plan.templateId} plan canvas with ${placed.length} placed tokens`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
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
          <text
            x={room.x + room.width / 2}
            y={room.y + room.height / 2}
            className={styles.roomLabel}
          >
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

      {/* The 0.6m pipeshaft clearance circle. Always faint; pulses while shaft_buffer is in play. */}
      <circle
        cx={plan.pipeshaft.openingPoint.x}
        cy={plan.pipeshaft.openingPoint.y}
        r={plan.pipeshaft.bufferRadiusM}
        className={`${styles.bufferCircle} ${showShaftCircle ? styles.bufferCirclePulse : ""}`}
      />

      {/* Placed tokens. Click or Enter/Space to remove. */}
      {placed.map((token) => (
        <g
          key={token.placementId}
          className={styles.placedGroup}
          onClick={(event) => {
            event.stopPropagation();
            onRemovePlaced(token.placementId);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onRemovePlaced(token.placementId);
            }
          }}
          tabIndex={0}
          role="button"
          aria-label={`Remove ${token.tokenId.replace(/_/g, " ")} placed token`}
        >
          <circle
            cx={token.point.x}
            cy={token.point.y}
            r={0.22}
            className={styles.placedHalo}
          />
          <circle
            cx={token.point.x}
            cy={token.point.y}
            r={0.18}
            className={styles.placedDot}
          />
          <text
            x={token.point.x}
            y={token.point.y}
            className={styles.placedInitial}
          >
            {INITIAL_BY_ID[token.tokenId]}
          </text>
        </g>
      ))}

      {/* Ghost preview at cursor while dragging or with a selected chip. */}
      {hoverPoint && (draggingTokenId || selectedTokenId) ? (
        <g className={styles.ghostGroup} aria-hidden>
          <circle
            cx={hoverPoint.x}
            cy={hoverPoint.y}
            r={0.28}
            className={`${styles.ghostHalo} ${ghostClassName}`}
          />
          <circle
            cx={hoverPoint.x}
            cy={hoverPoint.y}
            r={0.16}
            className={`${styles.ghostDot} ${ghostClassName}`}
          />
        </g>
      ) : null}
    </svg>
  );
}
