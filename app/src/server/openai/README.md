# OpenAI sketch pipeline (operational notes)

Code: `app/src/app/api/sketches/{plan,life,wind,hero}` plus this directory.
Tests: `route.test.ts` next to each handler; `cache.test.ts` here.

## Required env

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | for live calls | none | Without it, routes emit deterministic fallbacks; PNG paths fall through to SVG. |
| `OPENAI_ORG_ID` | optional | none | Sent as `OpenAI-Organization` header when set. |
| `OPENAI_IMAGE_MODEL` | optional | `gpt-image-2` | Override only for compatibility tests. Common `ChatGPT Image 2.0` labels normalize to `gpt-image-2`. |
| `OPENAI_TIMEOUT_MS` | optional | `25000` | AbortController timeout for every OpenAI call. |

## Cache env

R2 is OUT of Phase 1 as of 2026-05-09. The runtime cache is a per-process
in-memory LRU; `file` is supported only for prebake artifacts on disk.

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `SKETCH_CACHE_PROVIDER` | optional | `memory` | `memory` or `file`. Selecting `r2` is rejected with `cache_env_error`. |
| `SKETCH_CACHE_DIR` | optional | `<cwd>/.cache/sketches` | Used when provider is `file`. |
| `SKETCH_CACHE_MAX_ENTRIES` | optional | `64` | LRU cap for the in-memory cache. |
| `SKETCH_CACHE_TTL_MS` | optional | `1800000` (30 min) | TTL on cached PNG bytes. |
| `PLAN_SKETCH_CACHE_ROOT` | optional | `<cwd>/public` | Test/prebake override for local Plan Sketch PNG root. |
| `LIFE_ANCHOR_CACHE_ROOT` | optional | `<cwd>/public` | Test/prebake override for local Life anchor PNG root. |

Plan Sketches and Life anchors live separately at
`<cwd>/public/plan-sketches/<templateId>/plan.png` and
`<cwd>/public/life-anchors/<templateId>/anchor.png`. The runtime routes read
these files directly for the no-cloud demo path; nothing remote is consulted.
Life Sketch image-edit materialization is opt-in via `?materialize=1`.

## Optional rasterizer

`@resvg/resvg-js` is an `optionalDependencies` entry. When absent, the Plan
route returns deterministic SVG instead of calling GPT Image 2 — no error is
surfaced to the user; `X-Sketch-Rasterizer` carries the reason.

## Reference assets

`app/public/references/{brand-v3-poster.png,japandi-material-board.png}` are
optional Life Sketch references. Their bytes participate in the cache key, so
swapping them invalidates cached output. Both are gitignored binaries.

## Telemetry

Every PNG response carries `X-From-Cache`, `X-Prompt-Id`, and
`X-Evidence-Tier: prototype_visualisation`. SVG fallbacks carry
`X-Sketch-Fallback` with one of:

- `deterministic-svg` / `deterministic-anchor-svg` — no-key path.
- `openai-error` — OpenAI rejected the request (rate limit, auth, content).
- `openai-timeout` — AbortController fired at `OPENAI_TIMEOUT_MS`.
- `openai-unreachable` — network failure before any response.

Life anchors additionally surface `X-Life-Anchor-Source` (`cache-png` |
`deterministic-svg` | `request-png`) and `X-Life-Anchor-Cache-Path`.

## Fallback semantics

A "fallback" never blocks the user. Routes degrade in this order:
in-memory cache hit -> OpenAI live call -> deterministic SVG. Every failure
mode (rate limit, 5xx, network, timeout) returns 200 with the deterministic
SVG and the `X-Sketch-Fallback` header set; the route layer never surfaces a
5xx for an OpenAI miss. The deterministic SVG is generated from
`plan-geometry.json`, which is the compliance source of truth (brief
Section 18). Streamlines never pass through GPT Image; only structural
references do.

## Evidence tier

All sketch outputs are tier `prototype_visualisation` per
`app/src/server/evidence/evidence.ts`. They are reference imagery, not
compliance truth. Compliance flags must be computed from `plan-geometry.json`.
