import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getTokenPersonalityProfile, isTokenId, isTokenPersonalityVariant, type TokenId, type TokenPersonalityVariant } from "@/server/rules/tokens";

export type TokenVisualProvider = "local-demo" | "tripo" | "hunyuan";
export type TokenVisualProviderRequest = "auto" | TokenVisualProvider;
export type TokenVisualStatus = "success" | "unavailable";

export interface TokenVisualRequest {
  tokenId: TokenId;
  variant: TokenPersonalityVariant;
  provider?: TokenVisualProviderRequest;
  referenceImageDataUrl?: string;
}

export interface TokenVisualAttempt {
  provider: TokenVisualProvider;
  status: TokenVisualStatus;
  message: string;
}

export interface TokenVisualResult {
  ok: true;
  tokenId: TokenId;
  variant: TokenPersonalityVariant;
  requestedProvider: TokenVisualProviderRequest;
  provider: TokenVisualProvider;
  modelUrl: string;
  cacheKey: string;
  prompt: string;
  tier: "prototype_visualisation";
  visualOnly: true;
  attempts: TokenVisualAttempt[];
  disclaimer: string;
}

export interface TokenVisualHealth {
  ok: true;
  visualOnly: true;
  cacheDir: string;
  providers: Record<TokenVisualProvider, { configured: boolean; role: string }>;
}

export interface TokenVisualEnv {
  [key: string]: string | undefined;
  TOKEN_3D_CACHE_DIR?: string;
  TOKEN_3D_PROVIDER?: string;
  TOKEN_3D_POLL_TIMEOUT_MS?: string;
  TOKEN_3D_POLL_INTERVAL_MS?: string;
  TOKEN_3D_TRIPO_API_BASE?: string;
  TOKEN_3D_TRIPO_MODEL_VERSION?: string;
  TOKEN_3D_TRIPO_API_KEY?: string;
  TRIPO_API_KEY?: string;
  TOKEN_3D_HUNYUAN_API_BASE?: string;
  TOKEN_3D_HUNYUAN_CREATE_PATH?: string;
  TOKEN_3D_HUNYUAN_STATUS_PATH?: string;
}

export const TOKEN_VISUAL_TIER = "prototype_visualisation" as const;
export const TOKEN_VISUAL_ONLY_DISCLAIMER =
  "Token GLBs are prototype visualisation only. plan-geometry.json, token rules, and simulation remain the source of truth for placement, dimensions, clearance, airflow, and Damp Risk.";
export const DEFAULT_TOKEN_VISUAL_CACHE_DIR = join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".cache",
  "token-visuals",
);
export const DEFAULT_TOKEN_VISUAL_TIMEOUT_MS = 25_000;
export const DEFAULT_TOKEN_VISUAL_POLL_INTERVAL_MS = 2_500;

const GLB_MIME = "model/gltf-binary";

const TOKEN_COLOR: Record<TokenId, [number, number, number]> = {
  wind_gate: [0.49, 0.52, 0.43],
  soft_screen: [0.79, 0.71, 0.55],
  wood_anchor: [0.54, 0.4, 0.29],
  solar_shield: [0.85, 0.64, 0.29],
  fan_anchor: [0.62, 0.59, 0.53],
  shaft_buffer: [0.36, 0.42, 0.3],
};

export function normalizeTokenVisualRequest(input: unknown): TokenVisualRequest | string {
  if (!input || typeof input !== "object") return "Request body must include tokenId.";
  const body = input as Partial<Record<keyof TokenVisualRequest, unknown>>;
  if (!isTokenId(body.tokenId)) {
    return "tokenId must be one of: wind_gate, soft_screen, wood_anchor, solar_shield, fan_anchor, shaft_buffer.";
  }
  const variant = body.variant === undefined ? "japandi" : body.variant;
  if (!isTokenPersonalityVariant(variant)) {
    return "variant must be one of: wabi_sabi, japandi, tropical_modernist.";
  }
  const provider = normalizeProviderRequest(body.provider);
  if (!provider) return "provider must be one of: auto, local-demo, tripo, hunyuan.";
  const referenceImageDataUrl = typeof body.referenceImageDataUrl === "string" ? body.referenceImageDataUrl : undefined;
  return {
    tokenId: body.tokenId,
    variant,
    provider,
    ...(referenceImageDataUrl ? { referenceImageDataUrl } : {}),
  };
}

export function tokenVisualHealth(env: TokenVisualEnv = process.env): TokenVisualHealth {
  const cacheDir = env.TOKEN_3D_CACHE_DIR ?? DEFAULT_TOKEN_VISUAL_CACHE_DIR;
  return {
    ok: true,
    visualOnly: true,
    cacheDir,
    providers: {
      tripo: {
        configured: Boolean(env.TOKEN_3D_TRIPO_API_KEY || env.TRIPO_API_KEY),
        role: "optional image-to-3D provider; key stays server-side",
      },
      hunyuan: {
        configured: Boolean(env.TOKEN_3D_HUNYUAN_API_BASE),
        role: "optional localhost Hunyuan3D provider",
      },
      "local-demo": {
        configured: true,
        role: "deterministic cached demo GLB fallback",
      },
    },
  };
}

export function providerPlan(requested: TokenVisualProviderRequest = "auto"): TokenVisualProvider[] {
  if (requested === "auto") return ["tripo", "hunyuan", "local-demo"];
  return [requested];
}

export function buildTokenVisualPrompt(tokenId: TokenId, variant: TokenPersonalityVariant): string {
  const profile = getTokenPersonalityProfile(variant);
  return [
    `A single integrated Built-To-Kanso token object: ${tokenId.replace(/_/g, " ")}.`,
    "This is a visual token asset only, not room geometry, not compliance evidence, not a furniture catalog item.",
    "Do not infer or set placement, dimensions, clearance, airflow effect, Damp Risk, wall positions, doors, windows, or streamlines.",
    "plan-geometry.json, deterministic token rules, and simulation outputs remain the source of truth.",
    `Preserve the token's functional silhouette and material cue: ${profile.materialCue}`,
    "Use calm Monsoon Atelier materials, honest HDB scale cues, clean matte PBR surfaces, and soft Singapore balcony light.",
    "Make it a single integrated object, not a flat relief, not a display base.",
    "No walls, no floor plan, no room, no people, no text, no arrows, no feng shui tropes, no red/gold, no plastic-AI-render sheen, no HDR clarity.",
  ].join("\n");
}

export async function resolveTokenVisual(
  request: TokenVisualRequest,
  env: TokenVisualEnv = process.env,
): Promise<TokenVisualResult> {
  const requestedProvider = request.provider ?? providerFromEnv(env);
  const prompt = buildTokenVisualPrompt(request.tokenId, request.variant);
  const attempts: TokenVisualAttempt[] = [];

  for (const provider of providerPlan(requestedProvider)) {
    const attempt = await tryProvider(provider, request, prompt, env);
    attempts.push(attempt.attempt);
    if (attempt.result) {
      return {
        ok: true,
        tokenId: request.tokenId,
        variant: request.variant,
        requestedProvider,
        provider,
        modelUrl: `/api/tokens/model/${attempt.result.fileName}`,
        cacheKey: attempt.result.cacheKey,
        prompt,
        tier: TOKEN_VISUAL_TIER,
        visualOnly: true,
        attempts,
        disclaimer: TOKEN_VISUAL_ONLY_DISCLAIMER,
      };
    }
  }

  const fallback = await ensureLocalDemoGlb(request, env);
  attempts.push({ provider: "local-demo", status: "success", message: "Local deterministic demo GLB fallback created." });
  return {
    ok: true,
    tokenId: request.tokenId,
    variant: request.variant,
    requestedProvider,
    provider: "local-demo",
    modelUrl: `/api/tokens/model/${fallback.fileName}`,
    cacheKey: fallback.cacheKey,
    prompt,
    tier: TOKEN_VISUAL_TIER,
    visualOnly: true,
    attempts,
    disclaimer: TOKEN_VISUAL_ONLY_DISCLAIMER,
  };
}

export async function readTokenVisualModel(file: string, env: TokenVisualEnv = process.env): Promise<Buffer | null> {
  const safe = basename(file);
  if (!safe || safe !== file || !safe.endsWith(".glb")) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ resolveCachePath(safe, env));
  } catch {
    return null;
  }
}

export function tokenVisualModelHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": GLB_MIME,
    "Cache-Control": "private, max-age=3600",
    "X-Evidence-Tier": TOKEN_VISUAL_TIER,
    "X-Token-Visual-Only": "true",
    ...extra,
  };
}

async function tryProvider(
  provider: TokenVisualProvider,
  request: TokenVisualRequest,
  prompt: string,
  env: TokenVisualEnv,
): Promise<{ attempt: TokenVisualAttempt; result?: { fileName: string; cacheKey: string } }> {
  try {
    if (provider === "local-demo") {
      const result = await ensureLocalDemoGlb(request, env);
      return { attempt: { provider, status: "success", message: "Using deterministic cached demo GLB." }, result };
    }
    if (provider === "tripo") {
      const result = await runTripoProvider(request, prompt, env);
      return { attempt: { provider, status: "success", message: "Tripo GLB cached locally." }, result };
    }
    const result = await runHunyuanProvider(request, prompt, env);
    return { attempt: { provider, status: "success", message: "Hunyuan GLB cached locally." }, result };
  } catch (error) {
    return {
      attempt: {
        provider,
        status: "unavailable",
        message: error instanceof Error ? error.message : `${provider} unavailable.`,
      },
    };
  }
}

async function runTripoProvider(
  request: TokenVisualRequest,
  prompt: string,
  env: TokenVisualEnv,
): Promise<{ fileName: string; cacheKey: string }> {
  const apiKey = env.TOKEN_3D_TRIPO_API_KEY || env.TRIPO_API_KEY;
  if (!apiKey) throw new Error("TRIPO_API_KEY is not configured; using local token GLB fallback.");
  if (!request.referenceImageDataUrl) throw new Error("Tripo token generation needs a referenceImageDataUrl; using local token GLB fallback.");

  const image = parseImageDataUrl(request.referenceImageDataUrl);
  const upload = await tripoRequest("/upload", apiKey, env, {
    method: "POST",
    body: (() => {
      const form = new FormData();
      const imageBuffer = new ArrayBuffer(image.bytes.length);
      new Uint8Array(imageBuffer).set(image.bytes);
      form.append("file", new Blob([imageBuffer], { type: image.mime }), `${request.tokenId}.${image.ext}`);
      return form;
    })(),
  });
  const fileToken = findFirstString(upload, ["file_token", "fileToken", "image_token", "imageToken", "token"]);
  if (!fileToken) throw new Error("Tripo upload did not return a file token.");

  const task = await tripoRequest("/task", apiKey, env, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "image_to_model",
      model_version: env.TOKEN_3D_TRIPO_MODEL_VERSION ?? "v3.0-20250812",
      file: { type: image.ext, file_token: fileToken },
      prompt,
      texture: true,
      pbr: true,
      texture_quality: "detailed",
      geometry_quality: "detailed",
      enable_image_autofix: true,
    }),
  });
  const taskId = findFirstString(task, ["task_id", "taskId", "id"]);
  if (!taskId) throw new Error("Tripo task response did not include a task id.");

  const status = await pollProviderTask(
    () => tripoStatus(taskId, apiKey, env),
    env,
  );
  if (!status.modelUrl) throw new Error("Tripo finished without a GLB URL.");
  return downloadRemoteModel(status.modelUrl, tokenVisualCacheKey(request, "tripo"), env, apiKey);
}

async function runHunyuanProvider(
  request: TokenVisualRequest,
  prompt: string,
  env: TokenVisualEnv,
): Promise<{ fileName: string; cacheKey: string }> {
  const baseUrl = env.TOKEN_3D_HUNYUAN_API_BASE;
  if (!baseUrl) throw new Error("TOKEN_3D_HUNYUAN_API_BASE is not configured; using local token GLB fallback.");
  if (!request.referenceImageDataUrl) throw new Error("Hunyuan token generation needs a referenceImageDataUrl; using local token GLB fallback.");

  const image = parseImageDataUrl(request.referenceImageDataUrl);
  const createPath = env.TOKEN_3D_HUNYUAN_CREATE_PATH ?? "/send";
  const statusPath = env.TOKEN_3D_HUNYUAN_STATUS_PATH ?? "/status";
  const created = await jsonFetch(`${baseUrl.replace(/\/$/, "")}${createPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: request.referenceImageDataUrl,
      image_base64: image.bytes.toString("base64"),
      prompt,
      remove_background: true,
      texture: true,
      pbr: true,
      face_count: 30_000,
    }),
  });

  const modelBase64 = findFirstString(created, ["model_base64", "modelBase64", "glb_base64", "glbBase64"]);
  const taskId = findFirstString(created, ["uid", "task_id", "taskId", "id"]);
  const rawModelUrl = findModelUrl(created);
  const cacheKey = tokenVisualCacheKey(request, "hunyuan");
  if (modelBase64) return writeModelBase64(modelBase64, cacheKey, env);
  if (rawModelUrl) return downloadRemoteModel(rawModelUrl, cacheKey, env);
  if (!taskId) throw new Error("Hunyuan response did not include a task id or model.");

  const status = await pollProviderTask(
    async () => {
      const raw = await jsonFetch(`${baseUrl.replace(/\/$/, "")}${statusPath}/${encodeURIComponent(taskId)}`);
      const nextBase64 = findFirstString(raw, ["model_base64", "modelBase64", "glb_base64", "glbBase64"]);
      const nextUrl = findModelUrl(raw);
      return {
        done: isDone(findFirstString(raw, ["status", "task_status", "state", "message"])),
        failed: isFailed(findFirstString(raw, ["status", "task_status", "state", "message"])),
        error: findFirstString(raw, ["error", "message"]),
        modelUrl: nextUrl,
        modelBase64: nextBase64,
      };
    },
    env,
  );
  if (status.modelBase64) return writeModelBase64(status.modelBase64, cacheKey, env);
  if (status.modelUrl) return downloadRemoteModel(status.modelUrl, cacheKey, env);
  throw new Error("Hunyuan finished without a GLB model.");
}

async function tripoStatus(taskId: string, apiKey: string, env: TokenVisualEnv) {
  const raw = await tripoRequest(`/task/${encodeURIComponent(taskId)}`, apiKey, env);
  const rawRecord = raw && typeof raw === "object" ? (raw as { data?: unknown }) : {};
  const data = rawRecord.data && typeof rawRecord.data === "object" ? rawRecord.data : raw;
  const status = findFirstString(data, ["status", "task_status", "state"]);
  return {
    done: isDone(status),
    failed: isFailed(status),
    error: findFirstString(data, ["error", "message"]),
    modelUrl: findModelUrl(data),
  };
}

async function pollProviderTask<T extends { done: boolean; failed: boolean; error?: string }>(
  readStatus: () => Promise<T>,
  env: TokenVisualEnv,
): Promise<T> {
  const timeoutMs = positiveInt(env.TOKEN_3D_POLL_TIMEOUT_MS, DEFAULT_TOKEN_VISUAL_TIMEOUT_MS);
  const intervalMs = positiveInt(env.TOKEN_3D_POLL_INTERVAL_MS, DEFAULT_TOKEN_VISUAL_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await readStatus();
    if (status.failed) throw new Error(status.error || "3D provider generation failed.");
    if (status.done) return status;
    await delay(intervalMs);
  }
  throw new Error("3D provider generation timed out; using local token GLB fallback.");
}

async function ensureLocalDemoGlb(
  request: Pick<TokenVisualRequest, "tokenId" | "variant">,
  env: TokenVisualEnv,
): Promise<{ fileName: string; cacheKey: string }> {
  const cacheKey = tokenVisualCacheKey(request, "local-demo");
  const fileName = `${cacheKey}.glb`;
  const filePath = resolveCachePath(fileName, env);
  try {
    await access(filePath);
  } catch {
    await mkdir(cacheDir(env), { recursive: true });
    await writeFile(filePath, createTokenDemoGlb(request.tokenId));
  }
  return { fileName, cacheKey };
}

function createTokenDemoGlb(tokenId: TokenId): Buffer {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const part of tokenDemoParts(tokenId)) appendBox(positions, normals, indices, part);

  const positionBuffer = float32Buffer(positions);
  const normalBuffer = float32Buffer(normals);
  const indexBuffer = uint16Buffer(indices);
  const binary = Buffer.concat([positionBuffer, normalBuffer, indexBuffer]);
  const [r, g, b] = TOKEN_COLOR[tokenId];
  const bounds = boundsForPositions(positions);
  const json = {
    asset: { version: "2.0", generator: "Built-To-Kanso local token visual" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: `${tokenId} visual-only token` }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
      }],
    }],
    materials: [{
      name: `${tokenId} matte token material`,
      pbrMetallicRoughness: {
        baseColorFactor: [r, g, b, 1],
        metallicFactor: 0,
        roughnessFactor: 0.92,
      },
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min: bounds.min, max: bounds.max },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: positionBuffer.length, byteLength: normalBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: positionBuffer.length + normalBuffer.length, byteLength: indexBuffer.length, target: 34963 },
    ],
    buffers: [{ byteLength: binary.length }],
  };

  return writeGlb(json, binary);
}

interface TokenDemoPart {
  center: [number, number, number];
  size: [number, number, number];
}

function tokenDemoParts(tokenId: TokenId): TokenDemoPart[] {
  switch (tokenId) {
    case "wind_gate":
      return [
        { center: [-0.32, 0, 0], size: [0.08, 0.88, 0.12] },
        { center: [0.32, 0, 0], size: [0.08, 0.88, 0.12] },
        { center: [0, 0.42, 0], size: [0.72, 0.08, 0.14] },
        { center: [0, -0.44, 0], size: [0.86, 0.06, 0.16] },
      ];
    case "soft_screen":
      return [
        { center: [0, 0, 0], size: [0.92, 0.48, 0.05] },
        { center: [-0.32, 0, 0.04], size: [0.04, 0.58, 0.05] },
        { center: [0, 0, 0.04], size: [0.04, 0.58, 0.05] },
        { center: [0.32, 0, 0.04], size: [0.04, 0.58, 0.05] },
      ];
    case "wood_anchor":
      return [
        { center: [0, -0.12, 0], size: [0.56, 0.42, 0.42] },
        { center: [0, 0.18, 0], size: [0.36, 0.18, 0.34] },
        { center: [0, 0.34, 0], size: [0.18, 0.16, 0.22] },
      ];
    case "solar_shield":
      return [
        { center: [0, 0.1, 0], size: [0.96, 0.38, 0.06] },
        { center: [-0.24, -0.18, 0.06], size: [0.16, 0.08, 0.08] },
        { center: [0.02, -0.18, 0.06], size: [0.16, 0.08, 0.08] },
        { center: [0.28, -0.18, 0.06], size: [0.16, 0.08, 0.08] },
      ];
    case "fan_anchor":
      return [
        { center: [0, 0, 0], size: [0.16, 0.16, 0.16] },
        { center: [0.34, 0, 0], size: [0.58, 0.08, 0.08] },
        { center: [-0.34, 0, 0], size: [0.58, 0.08, 0.08] },
        { center: [0, 0.34, 0], size: [0.08, 0.58, 0.08] },
        { center: [0, -0.34, 0], size: [0.08, 0.58, 0.08] },
      ];
    case "shaft_buffer":
      return [
        { center: [-0.12, 0, 0], size: [0.12, 0.82, 0.14] },
        { center: [0.18, -0.32, 0], size: [0.52, 0.12, 0.14] },
        { center: [0.18, 0.32, 0], size: [0.52, 0.12, 0.14] },
        { center: [0.46, 0, 0], size: [0.1, 0.58, 0.1] },
      ];
  }
}

function appendBox(positions: number[], normals: number[], indices: number[], part: TokenDemoPart): void {
  const [cx, cy, cz] = part.center;
  const [sx, sy, sz] = part.size;
  const x = sx / 2;
  const y = sy / 2;
  const z = sz / 2;
  const base = positions.length / 3;
  positions.push(
    cx - x, cy - y, cz + z, cx + x, cy - y, cz + z, cx + x, cy + y, cz + z, cx - x, cy + y, cz + z,
    cx + x, cy - y, cz - z, cx - x, cy - y, cz - z, cx - x, cy + y, cz - z, cx + x, cy + y, cz - z,
    cx - x, cy + y, cz + z, cx + x, cy + y, cz + z, cx + x, cy + y, cz - z, cx - x, cy + y, cz - z,
    cx - x, cy - y, cz - z, cx + x, cy - y, cz - z, cx + x, cy - y, cz + z, cx - x, cy - y, cz + z,
    cx + x, cy - y, cz + z, cx + x, cy - y, cz - z, cx + x, cy + y, cz - z, cx + x, cy + y, cz + z,
    cx - x, cy - y, cz - z, cx - x, cy - y, cz + z, cx - x, cy + y, cz + z, cx - x, cy + y, cz - z,
  );
  normals.push(
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  );
  for (const index of [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]) {
    indices.push(base + index);
  }
}

function boundsForPositions(positions: number[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    min[0] = Math.min(min[0], positions[i]);
    min[1] = Math.min(min[1], positions[i + 1]);
    min[2] = Math.min(min[2], positions[i + 2]);
    max[0] = Math.max(max[0], positions[i]);
    max[1] = Math.max(max[1], positions[i + 1]);
    max[2] = Math.max(max[2], positions[i + 2]);
  }
  return { min, max };
}

function writeGlb(json: unknown, binary: Buffer): Buffer {
  const jsonBuffer = padBuffer(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binBuffer = padBuffer(binary, 0);
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuffer.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binBuffer], totalLength);
}

function float32Buffer(values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function uint16Buffer(values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  return padBuffer(buffer, 0);
}

function padBuffer(input: Buffer, padValue: number): Buffer {
  const pad = (4 - (input.length % 4)) % 4;
  if (pad === 0) return input;
  return Buffer.concat([input, Buffer.alloc(pad, padValue)]);
}

async function downloadRemoteModel(rawUrl: string, cacheKey: string, env: TokenVisualEnv, bearer?: string): Promise<{ fileName: string; cacheKey: string }> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("3D provider returned a non-local HTTP model URL.");
  }
  const response = await fetch(rawUrl, bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined);
  if (!response.ok) throw new Error(`Model download failed with ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isGlb(bytes)) throw new Error("3D provider did not return a GLB payload.");
  const fileName = `${cacheKey}.glb`;
  await mkdir(cacheDir(env), { recursive: true });
  await writeFile(resolveCachePath(fileName, env), bytes);
  return { fileName, cacheKey };
}

async function writeModelBase64(modelBase64: string, cacheKey: string, env: TokenVisualEnv): Promise<{ fileName: string; cacheKey: string }> {
  const bytes = Buffer.from(modelBase64.replace(/^data:.*?;base64,/, ""), "base64");
  if (!isGlb(bytes)) throw new Error("3D provider returned an invalid GLB payload.");
  const fileName = `${cacheKey}.glb`;
  await mkdir(cacheDir(env), { recursive: true });
  await writeFile(resolveCachePath(fileName, env), bytes);
  return { fileName, cacheKey };
}

function isGlb(bytes: Buffer): boolean {
  return bytes.length > 20 && bytes.toString("utf8", 0, 4) === "glTF";
}

async function tripoRequest(pathname: string, apiKey: string, env: TokenVisualEnv, init: RequestInit = {}): Promise<unknown> {
  const base = env.TOKEN_3D_TRIPO_API_BASE ?? "https://api.tripo3d.ai/v2/openapi";
  return jsonFetch(`${base.replace(/\/$/, "")}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });
}

async function jsonFetch(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text || "Non-JSON provider response." };
  }
  if (!response.ok || (hasNumberCode(payload) && payload.code !== 0)) {
    throw new Error(findFirstString(payload, ["message", "error"]) || `Provider request failed with ${response.status}.`);
  }
  return payload;
}

function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Buffer; ext: "png" | "jpg" | "webp" } {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/);
  if (!match) throw new Error("referenceImageDataUrl must be PNG, JPEG, or WebP data URL.");
  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 1024) throw new Error("referenceImageDataUrl is too small for 3D generation.");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { mime, bytes, ext };
}

function findModelUrl(value: unknown): string {
  const urls: string[] = [];
  collectUrls(value, urls);
  return urls.find((url) => /\.glb(?:[?#]|$)/i.test(url)) ?? "";
}

function collectUrls(value: unknown, urls: string[]): void {
  if (!value) return;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) urls.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
    return;
  }
  if (typeof value === "object") Object.values(value).forEach((item) => collectUrls(item, urls));
}

function findFirstString(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return record[key];
  }
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findFirstString(item, keys);
        if (found) return found;
      }
    } else if (child && typeof child === "object") {
      const found = findFirstString(child, keys);
      if (found) return found;
    }
  }
  return "";
}

function isDone(status: string): boolean {
  return ["success", "succeeded", "completed", "complete", "done", "finish", "finished"].includes(status.toLowerCase());
}

function isFailed(status: string): boolean {
  return ["failed", "error", "cancelled", "canceled"].includes(status.toLowerCase());
}

function hasNumberCode(value: unknown): value is { code: number } {
  return Boolean(value && typeof value === "object" && typeof (value as { code?: unknown }).code === "number");
}

function providerFromEnv(env: TokenVisualEnv): TokenVisualProviderRequest {
  const provider = normalizeProviderRequest(env.TOKEN_3D_PROVIDER);
  return provider ?? "auto";
}

function normalizeProviderRequest(provider: unknown): TokenVisualProviderRequest | null {
  if (provider === undefined || provider === null || provider === "") return "auto";
  if (provider === "auto" || provider === "local-demo" || provider === "tripo" || provider === "hunyuan") return provider;
  return null;
}

function tokenVisualCacheKey(
  request: Pick<TokenVisualRequest, "tokenId" | "variant">,
  provider: TokenVisualProvider,
): string {
  return safePart(`token-${request.tokenId}-${request.variant}-${provider}`);
}

function cacheDir(env: TokenVisualEnv): string {
  if (env.TOKEN_3D_CACHE_DIR) return resolve(/*turbopackIgnore: true*/ env.TOKEN_3D_CACHE_DIR);
  return DEFAULT_TOKEN_VISUAL_CACHE_DIR;
}

function resolveCachePath(fileName: string, env: TokenVisualEnv): string {
  const dir = cacheDir(env);
  const full = resolve(/*turbopackIgnore: true*/ dir, fileName);
  if (full !== dir && !full.startsWith(`${dir}${sep}`)) throw new Error("Token model path escaped cache directory.");
  return full;
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
