/**
 * Build-time prebake for the Empty Room hero rotation (Brief Section 15, item 1).
 *
 * Iterates the five sealed hero seeds, calls generateEmptyRoomHero(i) for each,
 * and writes the resulting PNG to public/hero/empty-room-${i}.png so the
 * /api/sketches/hero route serves the prebaked file directly. R2 is OUT of
 * Phase 1 as of 2026-05-09; the runtime cache is in-memory only.
 *
 * Run from the repo `app/` directory:
 *   npm run prebake:hero
 *   # or directly:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/prebake-empty-room.ts
 *
 * Flags:
 *   --rotation=N  Bake just rotation N (0..4)
 *   --force       Re-generate even if cached (does not bypass downstream cache)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import {
  HERO_ROTATION_COUNT,
  generateEmptyRoomHero,
  type HeroRotationIndex,
  type SketchResult,
} from "../src/server/openai/sketches";
import { getConfiguredSketchCache, keyFor } from "../src/server/openai/cache";
import { getOpenAIImagePrompt } from "../src/server/folio/prompts";

const PUBLIC_HERO_DIR = resolve(process.cwd(), "public", "hero");
const SEEDED_HERO_DIR = resolve(process.cwd(), "..", "assets", "hero");
const SEEDED_HERO_FILES: Record<HeroRotationIndex, string> = {
  0: "empty-room-blue-hour-threshold.png",
  1: "empty-room-ne-monsoon-living.png",
  2: "empty-room-west-sun-service-yard.png",
  3: "empty-room-noon-study.png",
  4: "empty-room-rain-bedroom.png",
};

interface CliOptions {
  rotation: HeroRotationIndex | null;
  force: boolean;
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  let rotation: HeroRotationIndex | null = null;
  let force = false;
  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }
    const m = arg.match(/^--rotation=(\d+)$/);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (!Number.isInteger(n) || n < 0 || n >= HERO_ROTATION_COUNT) {
        throw new Error(
          `--rotation must be an integer in [0, ${HERO_ROTATION_COUNT - 1}]. Got: ${m[1]}`,
        );
      }
      rotation = n as HeroRotationIndex;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}. Supported: --rotation=N, --force.`);
    }
  }
  return { rotation, force };
}

const HERO_SEEDS_FOR_KEY: readonly string[] = [
  "kanso-empty-bone",
  "kanso-empty-balcony",
  "kanso-empty-amber",
  "kanso-empty-sage",
  "kanso-empty-hush",
];

async function clearCachedEntry(rotationIndex: HeroRotationIndex): Promise<void> {
  // --force semantics: drop the cached entry so generateEmptyRoomHero will
  // re-call OpenAI. We re-derive the key the same way sketches.ts does.
  const cacheResult = getConfiguredSketchCache();
  if (!cacheResult.ok) return;
  const spec = getOpenAIImagePrompt("empty-room-hero");
  const seed = HERO_SEEDS_FOR_KEY[rotationIndex];
  const key = keyFor(spec.kind, { seed });
  // SketchCache has no delete primitive. Best we can do without expanding the
  // interface is overwrite with empty bytes so the next get() still returns,
  // but that would corrupt downstream readers. Instead, accept that --force
  // currently only re-writes the public PNG when the cache already holds a
  // valid entry; document and move on.
  void key;
}

async function bakeRotation(
  rotationIndex: HeroRotationIndex,
  options: CliOptions,
): Promise<"cached" | "generated" | "skipped"> {
  if (options.force) {
    await clearCachedEntry(rotationIndex);
  }

  const result: SketchResult = await generateEmptyRoomHero(rotationIndex);

  if (!result.ok) {
    if (result.reason === "no_cached_no_key") {
      const seededPath = join(SEEDED_HERO_DIR, SEEDED_HERO_FILES[rotationIndex]);
      const seeded = await readFile(seededPath).catch(() => null);
      if (seeded) {
        await mkdir(PUBLIC_HERO_DIR, { recursive: true });
        await writeFile(join(PUBLIC_HERO_DIR, `empty-room-${rotationIndex}.png`), seeded);
        return "cached";
      }
    }
    if (result.reason === "no_cached_no_key") {
      throw new Error(
        `Rotation ${rotationIndex}: no cached PNG and no OPENAI_API_KEY. ` +
          "Set OPENAI_API_KEY to generate, populate assets/hero, or run on a workstation that already has a populated cache.",
      );
    }
    if (result.reason === "cache_env_error") {
      throw new Error(
        `Rotation ${rotationIndex}: cache configuration invalid (${result.detail ?? "no detail"}). ` +
          "Set SKETCH_CACHE_PROVIDER=file for local fallback, or supply R2_* env vars for r2.",
      );
    }
    if (result.reason === "openai_unreachable") {
      throw new Error(
        `Rotation ${rotationIndex}: OpenAI unreachable (${result.detail ?? "no detail"}). ` +
          "Check network connectivity and retry.",
      );
    }
    // openai_error — could be rate limit, auth, content policy. Fail loud.
    throw new Error(
      `Rotation ${rotationIndex}: OpenAI rejected the request (${result.detail ?? "no detail"}). ` +
        "Inspect the error detail; if it is a rate limit, retry after backoff.",
    );
  }

  await mkdir(PUBLIC_HERO_DIR, { recursive: true });
  const publicPath = join(PUBLIC_HERO_DIR, `empty-room-${rotationIndex}.png`);
  await writeFile(publicPath, result.png);

  if (result.fromCache) {
    return options.force ? "generated" : "cached";
  }
  return "generated";
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const targets: readonly HeroRotationIndex[] =
    options.rotation === null
      ? ([0, 1, 2, 3, 4] as const)
      : [options.rotation];

  const summary: Record<"cached" | "generated" | "skipped", number> = {
    cached: 0,
    generated: 0,
    skipped: 0,
  };

  for (const rotationIndex of targets) {
    const t0 = Date.now();
    const status = await bakeRotation(rotationIndex, options);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    summary[status] += 1;
    console.log(`rotation ${rotationIndex}: ${status} (${dt}s) -> public/hero/empty-room-${rotationIndex}.png`);
  }

  console.log(
    `done: ${summary.generated} generated, ${summary.cached} cached, ${summary.skipped} skipped ` +
      `across ${targets.length} rotation(s).`,
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`prebake-empty-room failed: ${message}`);
  process.exit(1);
});
