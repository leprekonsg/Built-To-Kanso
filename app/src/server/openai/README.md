# OpenAI sketch pipeline (operational notes)

Code: `app/src/app/api/sketches/{plan,life,wind,hero}` plus this directory.
Tests: `route.test.ts` next to each handler; `cache.test.ts` here.

## Required env

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | for live calls | none | Without it, routes emit deterministic fallbacks; PNG paths fall through to SVG. |
| `OPENAI_ORG_ID` | optional | none | Sent as `OpenAI-Organization` header when set. |
| `OPENAI_IMAGE_MODEL` | optional | `gpt-image-2` | Override only for compatibility tests. Common `ChatGPT Image 2.0` labels normalize to `gpt-image-2`. |
| `OPENAI_REVIEW_MODEL` | optional | `gpt-4.1-mini` | Responses vision model that reviews Life Sketch candidates before caching. |
| `OPENAI_TIMEOUT_MS` | optional | `120000` | AbortController timeout for every OpenAI call. Local GPT Image 2 edits can take around a minute. |

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
| `LIFE_SKETCH_CACHE_ROOT` | optional | `<cwd>/public` | Test/prebake override for accepted Life Sketch PNG + JSON root. |

Plan Sketches, Life anchors, and accepted Life Sketches live separately at
`<cwd>/public/plan-sketches/<templateId>/plan.png` and
`<cwd>/public/life-anchors/<templateId>/anchor.png`, and
`<cwd>/public/life-sketches/<templateId>/accepted.{png,json}`. The runtime
routes read these files directly for the no-cloud path; nothing remote is
consulted. The default Life Sketch serves the QA-accepted GPT Image 2 prebake
when present, then falls back to deterministic sumi-e. Live GPT Image 2
materialization is explicit via `?materialize=1`.

## Optional rasterizer

`@resvg/resvg-js` is an `optionalDependencies` entry. When absent, the Plan
route returns deterministic SVG instead of calling GPT Image 2 — no error is
surfaced to the user; `X-Sketch-Rasterizer` carries the reason.

## Reference assets

When `?materialize=1` is used, Life Sketch sends structural inputs first: Image 1 is
`public/life-anchors/<templateId>/anchor.png`; Image 2 is
`public/plan-sketches/<templateId>/plan.png`. Optional style references live at
`app/public/references/{brand-v3-poster.png,hdb-material-board.png}` with
`japandi-material-board.png` retained as a legacy fallback. Reference bytes
participate in the cache key.

Run `npm run prebake:references` to regenerate the text-free local style
references from deterministic SVG sources.

Life Sketch requests 3 candidates. Only the accepted candidate is cached;
candidate rejection metadata is kept beside the cached PNG for file cache and
in memory for runtime cache. If the Responses review rejects every candidate,
the route falls back to the deterministic sumi-e Life Sketch and does not cache
an image.

## Telemetry

Every GPT PNG response carries `X-From-Cache`, `X-Prompt-Id`, and
`X-Evidence-Tier: prototype_visualisation`. SVG fallbacks carry
`X-Sketch-Fallback` with one of:

- `deterministic-svg` / `deterministic-anchor-svg` — no-key path.
- `openai-error` — OpenAI rejected the request (rate limit, auth, content).
- `openai-timeout` — AbortController fired at `OPENAI_TIMEOUT_MS`.
- `openai-unreachable` — network failure before any response.

Accepted prebake responses carry
`X-Sketch-Source: accepted-gpt-image-2-prebake`,
`X-Life-Sketch-Mode: accepted-gpt-image-2-prebake`,
`X-Life-Sketch-Cache-Path`, and `X-Life-Sketch-Metadata-Path`.
Deterministic fallback responses carry
`X-Sketch-Source: deterministic-sumi-e-life-sketch`,
`X-Life-Sketch-Mode: deterministic-sumi-e`, and
`X-Sketch-Fallback: missing-accepted-gpt-prebake`. Life anchors additionally
surface `X-Life-Anchor-Source` (`cache-png` | `deterministic-svg` |
`request-png`) and `X-Life-Anchor-Cache-Path`.
Materialized Life Sketch responses also surface `X-Life-Topology-Proof`,
`X-Life-Brand-Reference`, `X-Life-Material-Reference`,
`X-Life-Sketch-Candidates`, `X-Life-Sketch-Accepted-Candidate`, and
`X-Life-Sketch-QA-Model`.

## Fallback semantics

A "fallback" never blocks the user. Life Sketch degrades in this order:
accepted prebake -> deterministic sumi-e. `?materialize=1` degrades as:
in-memory cache hit -> OpenAI live call -> deterministic sumi-e SVG. Every
failure mode (rate limit, 5xx, network, timeout) returns 200 with the
deterministic SVG and `X-Sketch-Fallback`; the route layer never surfaces a
5xx for an OpenAI miss. The deterministic SVG is generated from
`plan-geometry.json`, which is the compliance source of truth (brief Section
18). Streamlines never pass through GPT Image; only structural references do.

## Evidence tier

All sketch outputs are tier `prototype_visualisation` per
`app/src/server/evidence/evidence.ts`. They are reference imagery, not
compliance truth. Compliance flags must be computed from `plan-geometry.json`.
