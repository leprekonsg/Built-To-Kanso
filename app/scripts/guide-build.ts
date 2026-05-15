import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS = path.resolve(__dirname, "..", "guide-output", "screenshots");
const OUTPUT = path.resolve(__dirname, "..", "guide-output", "User-Guide.html");

interface Step {
  file: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    file: "01-threshold-landing.png",
    title: "01 — Step over the Threshold",
    body: `Built-To-Kanso opens at **/threshold**. This is Stage 1 of four. The studio asks for the unit, the door direction, the floor, and the moment you are in — nothing more. The right rail lists the method honestly: Form-School feng shui, calibrated for Singapore at 1.35 N.

- **Unit**: one of three Phase 1 HDB archetypes.
- **Door**: 24-direction snap, every 15 degrees.
- **Floor**: 1 to 50, banded into four tiers.
- **Moment**: one of four common household scenarios.`,
  },
  {
    file: "02-template-selected.png",
    title: "02 — Choose the unit",
    body: `Tap a template card to select it. Each card shows a stylized plan glyph, the estate context, room count, floor area, and a cross-vent badge. The dot on the card lights up when chosen. Phase 1 ships three archetypes; **Plan Upload** stays disabled as a Phase 2 stub so the boundary is visible.`,
  },
  {
    file: "03-compass-set.png",
    title: "03 — Turn the door",
    body: `Drag, click, or arrow-press the compass to match your real main door's facing. The needle snaps to 24 directions. The readout shows the degree and the eight-rose facing label (here, **East-Southeast**). Defaults are starting points, not consent — the Continue button stays dim until you explicitly touch the compass.`,
  },
  {
    file: "04-floor-set.png",
    title: "04 — Choose the floor",
    body: `Wind behaves differently by tier. The slider runs 1 to 50, banded into **Ground Stagnation**, **Transition**, **Golden Floors**, and **Turbulent**. The tier badge follows the slider; one short line of copy explains what the tier means for cross-ventilation.`,
  },
  {
    file: "05-scenario-set-continue-ready.png",
    title: "05 — Where are you in the home?",
    body: `Pick the scenario that matches the moment, not the demographic. The four options are Just moved in, Mid-renovation, Considering changes, and Long-term resident. When all four inputs are set, the continue copy resolves to *"All four set. The house is listening."* and the Continue button comes forward.`,
  },
  {
    file: "06-bones-hero.png",
    title: "06 — Studio",
    body: `Continue takes you to the Studio at **/studio?template=...&compass=...&floor=...&scenario=...**. The locked plan renders as SVG with HDB and SCDF fixed elements protected. The right strip surfaces the Threshold inputs (Door, Floor, Scenario) so the reading is traceable.`,
  },
  {
    file: "07-bones-asking-points.png",
    title: "07 — What the home is asking",
    body: `Below the plan, **Asking Points** name a few places worth checking. Damp Risk shows as a band (**Clear**, **Watch**, **High**), never as a raw alarm number. Anti-cure surfaces one corner the home is asking you to leave unbuilt for ninety days.`,
  },
  {
    file: "08-bones-livestudio.png",
    title: "08 — LiveStudio airflow visual",
    body: `LiveStudio renders a deterministic airflow visualization keyed to the plan, the door angle, and the floor tier. The caption stays calm: *"Airflow visual. Prototype visualisation."* The tier (WebGPU live vs prebaked) is intentionally never surfaced to the resident.`,
  },
  {
    file: "09-weather-trial-active.png",
    title: "09 — Weather Trials",
    body: `Click a Weather Trial chip to swap conditions. The studio updates its **data-weather-trial** attribute and the status line reads *"Running: West Sun 17:20"*. Trials are deterministic and local; no cloud round-trip.`,
  },
  {
    file: "10-proof-hero.png",
    title: "10 — Recommendation Proof",
    body: `Stage 6 lives at **/recommendation-proof**. The headline reads *"Place these. Leave that clear."* Geometry, airflow, and life materialization are kept on separate rails so the proof is auditable. The right rail shows Door, Floor, and Reserve percent (how much of the plan stays empty).`,
  },
  {
    file: "11-proof-actions.png",
    title: "11 — Three decisions, one receipt",
    body: `Three action cards, each with a marker, an evidence tier, a room, an exact placement point, and a one-line proof string. *Place*, *Keep clear*, and *Behavior* kinds keep the moves grounded; nothing here is metaphysical.`,
  },
  {
    file: "12-proof-changelog.png",
    title: "12 — House Changelog",
    body: `The receipt: two locked images (greybox anchor, topology proof) and a short bullet log of what the home has been asked to do. Print, screenshot, or share — the receipt is the audit trail.`,
  },
  {
    file: "13-wind-sketch.png",
    title: "13 — Wind Sketch (Stage 6's third artifact)",
    body: `The **Wind Sketch** completes the brief's Stage 6 triptych. The full pipeline runs end-to-end here: Stage A WebGPU LBM solves the velocity field; Stage B calls GPT Image 2 with the **wind-sketch-base** prompt to produce a clean sumi-e top-down background with furniture and labels stripped; Stage C composes the deterministic LBM streamlines on top via SVG (100% IoU vs the solve); Stage D runs the GPT **wind-sketch-micro-polish** for ink-paper interaction. Streamline geometry never moves through any GPT pass.`,
  },
  {
    file: "14-resonance-hour.png",
    title: "14 — Resonance Hour",
    body: `The closing image, per the brief's Section 20: *"Your home is breathing right now. The kitchen window is the one to open."* The 3D Life Sketch is the source; the **resonance-hour-background** prompt makes evening wind visible through sheer curtain lift, dust motes catching late balcony light, and subtle leaf tilt — no arrows, no streamlines, no UI. Wind is implied through environmental change. This is the moment the system was built for: not the demo, but the Tuesday three weeks later when the home is in conversation with the city's atmosphere.`,
  },
  {
    file: "15-methodology-hero.png",
    title: "15 — Methodology",
    body: `**/methodology** explains the system's framing in one page. Built-To-Kanso is a heuristic briefing system, not a measurement device. It separates cultural framing, weather context, layout estimates, and hard constraints.`,
  },
  {
    file: "16-methodology-evidence.png",
    title: "16 — Evidence ladder and hard rules",
    body: `The Evidence ladder names every tier the app draws from, from Tier 1 (canonical LBM) down to Tier 4 (prebaked fallback). The Hard rules section enumerates the constraints that protect compliance, cultural honesty, and the homeowner voice.`,
  },
];

function loadScreenshot(filename: string): string | null {
  const filepath = path.join(SCREENSHOTS, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`WARNING: missing screenshot ${filename}`);
    return null;
  }
  return fs.readFileSync(filepath).toString("base64");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markdownToHtml(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const content = inlineFormat(line.slice(2));
      out.push(`  <li>${content}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      if (line.length === 0) continue;
      out.push(`<p>${inlineFormat(line)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

function inlineFormat(s: string): string {
  const escaped = escapeHtml(s);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function renderStep(index: number, step: Step): string {
  const b64 = loadScreenshot(step.file);
  const body = markdownToHtml(step.body);
  const figure = b64
    ? `<figure class="screenshot-wrapper"><img src="data:image/png;base64,${b64}" alt="${escapeHtml(step.title)}" /></figure>`
    : `<div class="screenshot-missing">Screenshot missing: ${escapeHtml(step.file)}</div>`;
  return `<section class="step" id="step-${index + 1}">
    <header class="step-head">
      <h2>${escapeHtml(step.title)}</h2>
    </header>
    <div class="step-body">${body}</div>
    ${figure}
  </section>`;
}

function renderToc(): string {
  const rows = STEPS.map(
    (s, i) =>
      `<li><a href="#step-${i + 1}"><span>${escapeHtml(s.title)}</span><span class="dots" aria-hidden></span><span class="pn">${i + 1}</span></a></li>`,
  );
  return `<nav class="toc"><h2>Contents</h2><ol>${rows.join("")}</ol></nav>`;
}

const css = `
:root {
  --ink-black: #111111;
  --bone-white: #F5F1E8;
  --bg-panel: #EFE9DC;
  --night-soft: #2B1E18;
  --fg-1: #111111;
  --fg-2: #3A352C;
  --fg-3: #8A8377;
  --line-1: rgba(17,17,17,.12);
  --line-2: rgba(17,17,17,.22);
  --accent: #D8A24A;
  --accent-glow: #E5C37A;
  --font-serif: "Cormorant Garamond", "EB Garamond", Georgia, serif;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, monospace;
}
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  color: var(--fg-1);
  background: var(--bone-white);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.cover {
  height: 100vh;
  min-height: 720px;
  background:
    radial-gradient(ellipse at 75% 18%, rgba(216,162,74,.55) 0%, rgba(216,162,74,0) 55%),
    linear-gradient(160deg, #2B1E18 0%, #1a1410 55%, #0e0a08 100%);
  color: var(--bone-white);
  padding: 64px 72px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  page-break-after: always;
}
.cover-mast {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .22em;
  text-transform: uppercase;
  color: var(--accent-glow);
  opacity: .85;
}
.cover-title {
  font-family: var(--font-serif);
  font-weight: 500;
  font-size: 78px;
  line-height: 0.95;
  letter-spacing: -0.01em;
  margin: 0;
}
.cover-title em {
  font-style: italic;
  color: var(--accent-glow);
}
.cover-sub {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 22px;
  font-weight: 400;
  margin-top: 16px;
  max-width: 28ch;
  color: rgba(245,241,232,.78);
}
.cover-meta {
  display: flex;
  gap: 28px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: rgba(245,241,232,.6);
}
.cover-meta strong {
  display: block;
  color: var(--bone-white);
  margin-top: 6px;
  font-weight: 500;
  letter-spacing: .08em;
}

.toc {
  padding: 72px 72px;
  page-break-after: always;
}
.toc h2 {
  font-family: var(--font-serif);
  font-weight: 500;
  font-size: 44px;
  margin: 0 0 36px;
  letter-spacing: -0.01em;
}
.toc ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.toc li {
  border-top: 1px solid var(--line-1);
}
.toc li:last-child { border-bottom: 1px solid var(--line-1); }
.toc a {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 14px 0;
  text-decoration: none;
  color: var(--fg-1);
}
.toc a span:first-child {
  font-family: var(--font-serif);
  font-size: 18px;
}
.toc .dots {
  flex: 1;
  border-bottom: 1px dotted var(--line-2);
  transform: translateY(-4px);
}
.toc .pn {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg-3);
}

.steps { padding: 0 72px 72px; }
.step {
  padding: 56px 0;
  border-top: 1px solid var(--line-1);
  page-break-inside: avoid;
}
.step:first-child { border-top: none; }
.step-head {
  margin-bottom: 18px;
}
.step h2 {
  font-family: var(--font-serif);
  font-weight: 500;
  font-size: 32px;
  line-height: 1.15;
  margin: 0;
  letter-spacing: -0.005em;
  border-left: 0;
  padding-left: 0;
}
.step h2::before {
  display: none;
}
.step-head::after {
  content: "";
  display: block;
  width: 64px;
  height: 1px;
  background: var(--accent);
  margin-top: 14px;
}
.step-body {
  max-width: 70ch;
  margin-bottom: 28px;
  color: var(--fg-2);
}
.step-body p { margin: 0 0 12px; }
.step-body ul {
  margin: 8px 0 12px;
  padding-left: 18px;
}
.step-body li {
  margin: 4px 0;
}
.step-body strong {
  color: var(--fg-1);
  font-weight: 600;
}
.step-body em {
  font-style: italic;
  font-family: var(--font-serif);
  font-size: 1.04em;
  color: var(--fg-1);
}

.screenshot-wrapper {
  margin: 0;
  border: 1px solid var(--line-1);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 12px rgba(17,17,17,.06);
}
.screenshot-wrapper img {
  display: block;
  width: 100%;
  height: auto;
}
.screenshot-missing {
  padding: 32px;
  border: 1px dashed var(--line-2);
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 12px;
  border-radius: 4px;
}

@page { size: A4; margin: 15mm; }
@media print {
  .cover {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .screenshot-wrapper { box-shadow: none; }
  .step { padding: 32px 0; }
  body { font-size: 11.5px; }
}
`;

function buildHtml(): string {
  const today = new Date().toISOString().slice(0, 10);
  const stepsHtml = STEPS.map((s, i) => renderStep(i, s)).join("\n");
  const toc = renderToc();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Built-To-Kanso — End-to-End User Guide</title>
<style>${css}</style>
</head>
<body>

<section class="cover">
  <div class="cover-mast">Built-To-Kanso · Tropical Edition · 1.35 N</div>
  <div>
    <h1 class="cover-title">A walkthrough of <em>the home that listens</em>.</h1>
    <p class="cover-sub">From the Threshold to the Recommendation Proof, in fourteen frames.</p>
  </div>
  <div class="cover-meta">
    <div>Phase<strong>1 surface</strong></div>
    <div>Generated<strong>${today}</strong></div>
    <div>Pages<strong>Threshold · Studio · Proof · Methodology</strong></div>
  </div>
</section>

${toc}

<section class="steps">
  ${stepsHtml}
</section>

</body>
</html>`;
}

function main(): void {
  if (!fs.existsSync(SCREENSHOTS)) {
    console.error(`Screenshots folder missing: ${SCREENSHOTS}`);
    console.error(`Run guide:screenshots first.`);
    process.exit(1);
  }
  const html = buildHtml();
  fs.writeFileSync(OUTPUT, html, "utf8");
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`Wrote ${OUTPUT} (${kb} KB)`);
}

main();
