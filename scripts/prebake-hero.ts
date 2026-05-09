// Bake all five Empty Room hero rotations into app/public/hero/.
//
// tsx is not installed by default in this repo. Install it on demand:
//   npx --yes tsx scripts/prebake-hero.ts
//
// Run from repo root with the OPENAI_API_KEY env var present:
//   OPENAI_API_KEY=sk-... npx --yes tsx scripts/prebake-hero.ts
//
// On Windows PowerShell:
//   $env:OPENAI_API_KEY = "sk-..."; npx --yes tsx scripts/prebake-hero.ts
//
// The script reads scripts/tsconfig.json so the "@/..." alias inside
// app/src/server/openai resolves correctly when invoked from the repo root.
//
// If OPENAI_API_KEY is not set the script prints a calm message and exits 0
// so it never breaks builds.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  HERO_ROTATION_COUNT,
  generateEmptyRoomHero,
  type HeroRotationIndex,
} from "../app/src/server/openai/sketches";

const HERO_DIR = resolve(process.cwd(), "app", "public", "hero");

async function main(): Promise<number> {
  if (!process.env.OPENAI_API_KEY) {
    process.stdout.write(
      "Set OPENAI_API_KEY in env to bake hero images. Skipping prebake.\n",
    );
    return 0;
  }

  await mkdir(HERO_DIR, { recursive: true });

  let baked = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < HERO_ROTATION_COUNT; i++) {
    const rotation = i as HeroRotationIndex;
    const result = await generateEmptyRoomHero(rotation);
    if (!result.ok) {
      process.stderr.write(
        `rotation ${rotation}: ${result.reason}${result.detail ? ` — ${result.detail}` : ""}\n`,
      );
      failed += 1;
      continue;
    }
    if (result.fromCache) {
      skipped += 1;
    }
    const out = join(HERO_DIR, `empty-room-${rotation}.png`);
    await writeFile(out, new Uint8Array(result.png));
    baked += 1;
    process.stdout.write(`baked rotation ${rotation} -> ${out}\n`);
  }

  process.stdout.write(
    `prebake-hero done. baked=${baked} cached=${skipped} failed=${failed}\n`,
  );
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(
      `prebake-hero crashed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  },
);
