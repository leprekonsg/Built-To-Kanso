/**
 * Prebake local Life Sketch reference PNGs.
 *
 * Writes:
 *   public/references/brand-v3-poster.png
 *   public/references/hdb-material-board.png
 *
 * These images intentionally contain no visible text. They are GPT Image 2
 * style references only; plan-geometry.json remains the compliance source.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { rasterizeSvgToPng } from "../src/server/openai/svgRaster";

const OUT_DIR = resolve(process.cwd(), "public", "references");

interface ReferenceSpec {
  fileName: string;
  svg: string;
}

const COLORS = {
  ink: "#111111",
  bone: "#F5F1E8",
  card: "#EFE9DC",
  voidDeck: "#C9C4BA",
  concrete: "#A79F93",
  sage: "#7C856D",
  banyan: "#5E6B4C",
  rattan: "#C9B68C",
  teak: "#8A664B",
  amber: "#D8A24A",
  glow: "#E5C37A",
  terracotta: "#B96F4D",
} as const;

function washiFibers(count: number, seed: number): string {
  return Array.from({ length: count }, (_, index) => {
    const x1 = (index * 73 + seed * 19) % 1024;
    const y1 = (index * 41 + seed * 31) % 1024;
    const len = 40 + ((index * 17 + seed) % 96);
    const opacity = 0.05 + ((index + seed) % 7) * 0.01;
    return `<path d="M ${x1} ${y1} l ${len} ${((index + seed) % 5) - 2}" stroke="${COLORS.ink}" stroke-opacity="${opacity.toFixed(
      2,
    )}" stroke-width="1" />`;
  }).join("\n");
}

function terrazzoDots(count: number, x: number, y: number, w: number, h: number): string {
  const tones = [COLORS.concrete, COLORS.voidDeck, COLORS.rattan, COLORS.teak, COLORS.terracotta];
  return Array.from({ length: count }, (_, index) => {
    const cx = x + ((index * 47) % w);
    const cy = y + ((index * 83) % h);
    const r = 2 + (index % 5);
    const fill = tones[index % tones.length];
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.38" />`;
  }).join("\n");
}

function brandPosterSvg(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img">
  <title>Built-To-Kanso brand atmosphere reference</title>
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.bone}" />
      <stop offset="0.58" stop-color="${COLORS.card}" />
      <stop offset="1" stop-color="${COLORS.voidDeck}" />
    </linearGradient>
    <radialGradient id="sun" cx="0.78" cy="0.28" r="0.48">
      <stop offset="0" stop-color="${COLORS.glow}" stop-opacity="0.46" />
      <stop offset="0.42" stop-color="${COLORS.amber}" stop-opacity="0.2" />
      <stop offset="1" stop-color="${COLORS.amber}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="sageWash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COLORS.sage}" stop-opacity="0.24" />
      <stop offset="1" stop-color="${COLORS.sage}" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#paper)" />
  <rect width="1024" height="1024" fill="url(#sun)" />
  <rect x="0" y="0" width="1024" height="420" fill="url(#sageWash)" />
  ${washiFibers(96, 3)}
  <path d="M 164 744 C 268 690 368 695 484 632 C 604 566 718 574 872 492" fill="none" stroke="${COLORS.ink}" stroke-opacity="0.7" stroke-width="8" stroke-linecap="round" />
  <path d="M 172 781 C 304 736 424 740 552 681 C 660 632 756 628 875 570" fill="none" stroke="${COLORS.ink}" stroke-opacity="0.38" stroke-width="3" stroke-linecap="round" />
  <path d="M 725 104 L 725 792" stroke="${COLORS.ink}" stroke-opacity="0.18" stroke-width="14" />
  <path d="M 814 92 L 814 804" stroke="${COLORS.ink}" stroke-opacity="0.13" stroke-width="10" />
  <path d="M 646 418 L 918 302" stroke="${COLORS.amber}" stroke-opacity="0.42" stroke-width="44" stroke-linecap="round" />
  <path d="M 664 532 L 944 414" stroke="${COLORS.amber}" stroke-opacity="0.22" stroke-width="28" stroke-linecap="round" />
  <rect x="150" y="136" width="310" height="472" fill="${COLORS.card}" stroke="${COLORS.ink}" stroke-opacity="0.18" stroke-width="2" />
  <rect x="188" y="174" width="78" height="396" fill="${COLORS.bone}" opacity="0.62" />
  <rect x="286" y="174" width="78" height="396" fill="${COLORS.bone}" opacity="0.46" />
  <rect x="384" y="174" width="38" height="396" fill="${COLORS.bone}" opacity="0.38" />
  <circle cx="235" cy="794" r="54" fill="${COLORS.terracotta}" opacity="0.7" />
  <circle cx="236" cy="793" r="28" fill="${COLORS.card}" opacity="0.74" />
  <path d="M 534 252 C 584 210 638 194 706 184" fill="none" stroke="${COLORS.sage}" stroke-opacity="0.52" stroke-width="22" stroke-linecap="round" />
  <path d="M 526 308 C 603 280 675 263 748 252" fill="none" stroke="${COLORS.banyan}" stroke-opacity="0.28" stroke-width="12" stroke-linecap="round" />
</svg>`;
}

function materialBoardSvg(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img">
  <title>HDB material board reference</title>
  <defs>
    <linearGradient id="plaster" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.bone}" />
      <stop offset="1" stop-color="${COLORS.card}" />
    </linearGradient>
    <linearGradient id="curtain" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${COLORS.bone}" stop-opacity="0.18" />
      <stop offset="0.52" stop-color="${COLORS.bone}" stop-opacity="0.72" />
      <stop offset="1" stop-color="${COLORS.bone}" stop-opacity="0.22" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="${COLORS.bone}" />
  ${washiFibers(72, 11)}
  <rect x="80" y="80" width="390" height="390" fill="url(#plaster)" stroke="${COLORS.ink}" stroke-opacity="0.12" />
  <path d="M 108 152 C 180 136 258 164 342 128 C 392 108 427 112 454 124" fill="none" stroke="${COLORS.concrete}" stroke-opacity="0.22" stroke-width="5" stroke-linecap="round" />
  <path d="M 104 276 C 178 255 258 286 336 250 C 386 228 430 232 458 244" fill="none" stroke="${COLORS.concrete}" stroke-opacity="0.16" stroke-width="4" stroke-linecap="round" />
  <rect x="554" y="80" width="390" height="390" fill="${COLORS.card}" stroke="${COLORS.ink}" stroke-opacity="0.12" />
  ${terrazzoDots(94, 584, 110, 330, 330)}
  <rect x="80" y="554" width="390" height="390" fill="${COLORS.rattan}" stroke="${COLORS.ink}" stroke-opacity="0.12" />
  ${Array.from({ length: 10 }, (_, i) => `<rect x="${96 + i * 36}" y="574" width="20" height="350" fill="${i % 2 ? COLORS.teak : COLORS.rattan}" opacity="${i % 2 ? "0.42" : "0.72"}" />`).join("\n")}
  <path d="M 96 660 H 452 M 96 744 H 452 M 96 828 H 452" stroke="${COLORS.ink}" stroke-opacity="0.08" stroke-width="4" />
  <rect x="554" y="554" width="390" height="390" fill="${COLORS.voidDeck}" stroke="${COLORS.ink}" stroke-opacity="0.12" />
  <rect x="620" y="554" width="56" height="390" fill="url(#curtain)" />
  <rect x="718" y="554" width="56" height="390" fill="url(#curtain)" />
  <rect x="816" y="554" width="56" height="390" fill="url(#curtain)" />
  <path d="M 602 722 C 696 696 772 694 900 664" fill="none" stroke="${COLORS.amber}" stroke-opacity="0.34" stroke-width="30" stroke-linecap="round" />
  <circle cx="746" cy="725" r="21" fill="${COLORS.ink}" opacity="0.78" />
  <path d="M 746 723 L 646 661 M 746 723 L 858 682 M 746 723 L 732 844" stroke="${COLORS.teak}" stroke-width="18" stroke-linecap="round" opacity="0.74" />
  <path d="M 166 504 H 858" stroke="${COLORS.ink}" stroke-opacity="0.14" stroke-width="2" />
  <path d="M 512 166 V 858" stroke="${COLORS.ink}" stroke-opacity="0.14" stroke-width="2" />
</svg>`;
}

const REFERENCES: readonly ReferenceSpec[] = [
  { fileName: "brand-v3-poster.png", svg: brandPosterSvg() },
  { fileName: "hdb-material-board.png", svg: materialBoardSvg() },
];

async function main(): Promise<void> {
  for (const ref of REFERENCES) {
    const target = resolve(OUT_DIR, ref.fileName);
    const raster = await rasterizeSvgToPng(ref.svg, 1024);
    if (!raster.ok) {
      throw new Error(`${ref.fileName}: ${raster.message}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, raster.png);
    console.log(`${ref.fileName}: image/png -> ${target}`);
  }
  console.log(`done: ${REFERENCES.length} Life Sketch reference PNGs.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prebake-life-references failed: ${message}`);
  process.exitCode = 1;
});
