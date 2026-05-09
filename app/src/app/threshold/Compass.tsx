"use client";

import { useCallback, useRef } from "react";
import { useThresholdStore } from "@/lib/store";
import styles from "./threshold.module.css";

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 142;
const R_INNER = 110;
const R_NEEDLE = 96;

const TICKS_24 = Array.from({ length: 24 }, (_, i) => i);
const CARDINAL_AT = { 0: "N", 6: "E", 12: "S", 18: "W" } as const;
const ORDINAL_AT = { 3: "NE", 9: "SE", 15: "SW", 21: "NW" } as const;

// Server (Node V8) and client (browser V8) Math.sin/cos can differ in the last
// few ULPs, which React surfaces as a hydration mismatch on numeric SVG
// attributes. Quantize to 2 decimals — well under 1px at 320px canvas.
const r = (n: number): number => Math.round(n * 100) / 100;

function snapFromPoint(clientX: number, clientY: number, rect: DOMRect): number {
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  const radFromNorth = Math.atan2(dx, -dy);
  const deg = (radFromNorth * 180) / Math.PI;
  const norm = ((deg % 360) + 360) % 360;
  return Math.round(norm / 15) % 24;
}

export default function Compass() {
  const compassIndex = useThresholdStore((s) => s.compassIndex);
  const setCompass = useThresholdStore((s) => s.setCompass);
  const markCompassTouched = useThresholdStore((s) => s.markCompassTouched);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const idx = snapFromPoint(clientX, clientY, svg.getBoundingClientRect());
      setCompass(idx);
    },
    [setCompass],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    // Hard Rule #25: explicit interaction is consent.
    markCompassTouched();
    handlePointer(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    handlePointer(e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      markCompassTouched();
      setCompass(compassIndex - 1);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      markCompassTouched();
      setCompass(compassIndex + 1);
    }
  };

  const angle = compassIndex * 15;
  const angleRad = (angle * Math.PI) / 180;
  const needleX = r(CX + R_NEEDLE * Math.sin(angleRad));
  const needleY = r(CY - R_NEEDLE * Math.cos(angleRad));

  return (
    <div className={styles.compassWrap}>
      <div className={styles.compassReadout}>
        <span className={styles.compassDeg}>
          {String(angle).padStart(3, "0")}°
        </span>
        <span className={styles.compassFacing}>{facingLabel(angle)}</span>
        <span className={styles.compassHint}>Door facing</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={styles.compassSvg}
        role="slider"
        aria-label="Door facing direction"
        aria-valuenow={angle}
        aria-valuemin={0}
        aria-valuemax={345}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {/* sun-glow background, faint */}
        <defs>
          <radialGradient id="cgrad" cx="70%" cy="20%">
            <stop offset="0%" stopColor="rgba(216,162,74,0.22)" />
            <stop offset="60%" stopColor="rgba(216,162,74,0)" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={R_OUTER + 8} fill="url(#cgrad)" />

        {/* outer ring */}
        <circle cx={CX} cy={CY} r={R_OUTER} className={styles.compassRing} />
        <circle cx={CX} cy={CY} r={R_INNER} className={styles.compassRingInner} />

        {/* 24 tick marks */}
        {TICKS_24.map((i) => {
          const a = (i * 15 * Math.PI) / 180;
          const isCardinal = i in CARDINAL_AT;
          const isOrdinal = i in ORDINAL_AT;
          const tickLen = isCardinal ? 14 : isOrdinal ? 10 : 6;
          const x1 = r(CX + (R_OUTER - tickLen) * Math.sin(a));
          const y1 = r(CY - (R_OUTER - tickLen) * Math.cos(a));
          const x2 = r(CX + R_OUTER * Math.sin(a));
          const y2 = r(CY - R_OUTER * Math.cos(a));
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={
                isCardinal
                  ? styles.tickCardinal
                  : isOrdinal
                    ? styles.tickOrdinal
                    : styles.tickFine
              }
            />
          );
        })}

        {/* cardinal letters */}
        {(Object.entries(CARDINAL_AT) as [string, string][]).map(([i, lbl]) => {
          const a = (Number(i) * 15 * Math.PI) / 180;
          const lx = r(CX + (R_OUTER + 22) * Math.sin(a));
          const ly = r(CY - (R_OUTER + 22) * Math.cos(a));
          return (
            <text
              key={lbl}
              x={lx}
              y={ly}
              className={styles.compassLabel}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {lbl}
            </text>
          );
        })}

        {/* needle */}
        <line
          x1={CX}
          y1={CY}
          x2={needleX}
          y2={needleY}
          className={styles.needleStroke}
        />
        <polygon
          points={needlePoints(angleRad, needleX, needleY)}
          className={styles.needleHead}
        />
        <circle cx={CX} cy={CY} r={5} className={styles.needleHub} />
        <circle cx={CX} cy={CY} r={2} className={styles.needleHubDot} />
      </svg>
    </div>
  );
}

function facingLabel(deg: number): string {
  // 8-rose grouping for human readability; snap is still 24.
  const segments: { lo: number; hi: number; lbl: string }[] = [
    { lo: 348, hi: 360, lbl: "North" },
    { lo: 0,   hi: 22,  lbl: "North" },
    { lo: 22,  hi: 67,  lbl: "Northeast" },
    { lo: 67,  hi: 112, lbl: "East" },
    { lo: 112, hi: 157, lbl: "Southeast" },
    { lo: 157, hi: 202, lbl: "South" },
    { lo: 202, hi: 247, lbl: "Southwest" },
    { lo: 247, hi: 292, lbl: "West" },
    { lo: 292, hi: 348, lbl: "Northwest" },
  ];
  const found = segments.find(({ lo, hi }) => deg >= lo && deg < hi);
  return found?.lbl ?? "North";
}

function needlePoints(a: number, tipX: number, tipY: number): string {
  const w = 6;
  const px = Math.cos(a) * w;
  const py = Math.sin(a) * w;
  const baseX = CX + (R_NEEDLE - 14) * Math.sin(a);
  const baseY = CY - (R_NEEDLE - 14) * Math.cos(a);
  return [
    `${r(tipX)},${r(tipY)}`,
    `${r(baseX + px)},${r(baseY + py)}`,
    `${r(baseX - px)},${r(baseY - py)}`,
  ].join(" ");
}
