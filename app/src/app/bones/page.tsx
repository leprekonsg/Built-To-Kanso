import type { Route } from "next";
import { permanentRedirect } from "next/navigation";

// `/bones` was renamed to `/studio` as part of the v4.1 IA reframe (the
// seven-stage journey is narrative, not screen structure). 308 redirect
// preserves the deep-link contract documented in CLAUDE.md so external
// links and bookmarks keep working with their existing query strings.
export default async function BonesRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      qs.set(key, value);
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      qs.set(key, value[0]);
    }
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  permanentRedirect(`/studio${suffix}` as Route);
}
