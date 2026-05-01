import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore, FieldValue } from "firebase-admin/firestore";
import sharp from "sharp";

import { runListingAnalyze } from "./listingAnalyze";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: `${process.env.MAX_IMAGE_MB ?? "12"}mb` }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "listforge-enhance-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "listforge-enhance-api",
    message: "Use GET /health or POST /v1/photo/enhance",
    endpoints: {
      health: "GET /health",
      enhance: "POST /v1/photo/enhance",
      enhanceBatch: "POST /v1/photo/enhance/batch",
      upscale: "POST /v1/photo/upscale",
      enhanceUpscale: "POST /v1/photo/enhance-upscale",
      defectAnalyze: "POST /v1/photo/defects/analyze",
      listingAnalyze: "POST /v1/listing/analyze",
    },
  });
});

type BackgroundStyle =
  | "original"
  | "auto_best"
  | "studio_white"
  | "studio_gray"
  | "showroom"
  | "outdoor_soft"
  | "blur_subtle"
  | "clean_white"
  | "soft_gradient"
  | "dark_studio"
  | "neutral_lifestyle"
  | "light_texture";

type EnhanceMode = "auto" | "electronics" | "general";
type BillingModeMultipliers = Record<EnhanceMode, number>;
type LedgerEntryType = "topup" | "consume" | "auto_refill";

type CreditPack = {
  id: string;
  label: string;
  credits: number;
  priceUsd: number;
  popular?: boolean;
};

type WalletState = {
  credits_balance: number;
  auto_refill_enabled: boolean;
  auto_refill_pack_id: string | null;
  auto_refill_threshold: number;
};

type EnhanceRequest = {
  imageBase64: string;
  mode: EnhanceMode;
  stepId?: string;
  backgroundStyle?: BackgroundStyle;
  /** -1 (lighter) to 1 (darker) */
  backgroundDarkness?: number;
  enhanceLevel?: "standard" | "pro" | "wow";
  adjustments?: {
    exposure?: number;
    contrast?: number;
    saturation?: number;
    sharpen?: number;
    denoise?: number;
  };
  logoBase64?: string;
  logoOpacity?: number;
  logoPosition?: "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center";
};

type BatchEnhanceRequest = {
  photos: Array<{
    id: string;
    imageBase64: string;
    mode: EnhanceMode;
    stepId?: string;
    backgroundStyle?: BackgroundStyle;
    enhanceLevel?: "standard" | "pro" | "wow";
  }>;
};

type UpscaleRequest = {
  imageBase64: string;
  scale: 2 | 4;
  format?: "jpg" | "png" | "webp";
  enhanceLevel?: "standard" | "pro" | "wow";
  backgroundDarkness?: number;
  adjustments?: {
    exposure?: number;
    contrast?: number;
    saturation?: number;
    sharpen?: number;
    denoise?: number;
  };
};

type EnhanceUpscaleRequest = {
  imageBase64: string;
  mode: EnhanceMode;
  stepId?: string;
  backgroundStyle?: BackgroundStyle;
  backgroundDarkness?: number;
  enhanceLevel?: "standard" | "pro" | "wow";
  scale: 2 | 4;
  format?: "jpg" | "png" | "webp";
  adjustments?: {
    exposure?: number;
    contrast?: number;
    saturation?: number;
    sharpen?: number;
    denoise?: number;
  };
  logoBase64?: string;
  logoOpacity?: number;
  logoPosition?: "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center";
};

type DefectAnalyzeRequest = {
  imageBase64: string;
  stepId?: string;
};

type ListingAnalyzeRequest = {
  mode: "electronics" | "general";
  imagesBase64: string[];
  notes?: string;
  serial?: string;
  includePricing?: boolean;
};

const allowedBackgrounds = new Set<BackgroundStyle>([
  "original",
  "auto_best",
  "studio_white",
  "studio_gray",
  "showroom",
  "outdoor_soft",
  "blur_subtle",
  "clean_white",
  "soft_gradient",
  "dark_studio",
  "neutral_lifestyle",
  "light_texture",
]);

function readNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readTopupPacks(): CreditPack[] {
  const envValue = process.env.BILLING_TOPUP_PACKS_JSON;
  if (envValue) {
    try {
      const parsed = JSON.parse(envValue) as CreditPack[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((p) => p && typeof p.id === "string" && Number.isFinite(p.credits) && Number.isFinite(p.priceUsd));
      }
    } catch {
      // fall back to defaults when invalid JSON is provided.
    }
  }
  return [
    { id: "starter", label: "Starter Pack", credits: 120, priceUsd: 9 },
    { id: "growth", label: "Growth Pack", credits: 400, priceUsd: 25, popular: true },
    { id: "pro", label: "Pro Pack", credits: 1200, priceUsd: 59 },
  ];
}

function billingConfig() {
  const multipliers: BillingModeMultipliers = {
    auto: readNumberEnv("MODE_MULTIPLIER_AUTO", 1.5),
    electronics: readNumberEnv("MODE_MULTIPLIER_ELECTRONICS", 1.0),
    general: readNumberEnv("MODE_MULTIPLIER_GENERAL", 0.8),
  };
  const packs = readTopupPacks();
  const defaultAutoRefillPackId = process.env.DEFAULT_AUTO_REFILL_PACK_ID ?? "growth";
  const fallbackPack = packs[0]?.id ?? "starter";
  return {
    topupPacks: packs,
    modeMultipliers: multipliers,
    defaultAutoRefillThreshold: readNumberEnv("DEFAULT_AUTO_REFILL_THRESHOLD", 20),
    defaultAutoRefillPackId: packs.some((p) => p.id === defaultAutoRefillPackId) ? defaultAutoRefillPackId : fallbackPack,
  };
}

let firestoreClient: Firestore | null = null;

function ensureFirestore() {
  if (firestoreClient) return firestoreClient;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const creds = JSON.parse(serviceAccountJson) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: creds.project_id,
          clientEmail: creds.client_email,
          privateKey: creds.private_key.replace(/\\n/g, "\n"),
        }),
      });
    }
    firestoreClient = getFirestore();
    return firestoreClient;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firestore is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.");
  }
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
  }
  firestoreClient = getFirestore();
  return firestoreClient;
}

function defaultWallet(config: ReturnType<typeof billingConfig>): WalletState {
  return {
    credits_balance: readNumberEnv("DEFAULT_CREDITS_BALANCE", 40),
    auto_refill_enabled: false,
    auto_refill_pack_id: config.defaultAutoRefillPackId,
    auto_refill_threshold: config.defaultAutoRefillThreshold,
  };
}

function userDoc(db: Firestore, userId: string) {
  return db.collection("users").doc(userId);
}

function ledgerDoc(db: Firestore, userId: string, idempotencyKey: string) {
  return db.collection("users").doc(userId).collection("credit_ledger").doc(idempotencyKey);
}

function modeCost(mode: EnhanceMode, multipliers: BillingModeMultipliers) {
  return multipliers[mode] ?? 1;
}

function authorizeBillingRequest(req: express.Request, res: express.Response) {
  const expected = process.env.BILLING_API_KEY;
  if (!expected) return true;
  const provided = req.header("x-billing-api-key") ?? "";
  if (provided !== expected) {
    res.status(401).json({ error: "Unauthorized", message: "Missing or invalid billing API key." });
    return false;
  }
  return true;
}

function authorizeOwnerRequest(req: express.Request, res: express.Response) {
  const expected = process.env.BILLING_OWNER_PIN;
  if (!expected) {
    res.status(500).json({ error: "OwnerPinNotConfigured", message: "BILLING_OWNER_PIN is not configured." });
    return false;
  }
  const provided = req.header("x-owner-pin") ?? "";
  if (!provided || provided !== expected) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid owner PIN." });
    return false;
  }
  return true;
}

function isExteriorStep(stepId?: string) {
  return stepId === "front_3_4" || stepId === "side" || stepId === "rear_3_4";
}

function selectAutoBestStyle(mode: EnhanceMode): BackgroundStyle {
  if (mode === "electronics") return "clean_white";
  if (mode === "general") return "neutral_lifestyle";
  return "studio_white";
}

function normalizeBackgroundStyle(
  mode: EnhanceMode,
  stepId: string | undefined,
  requested: BackgroundStyle,
): BackgroundStyle {
  const picked = requested === "auto_best" ? selectAutoBestStyle(mode) : requested;
  if (mode === "auto" && !isExteriorStep(stepId)) return "original";
  return picked;
}

function applyDarknessToHex(hex: string, darkness: number): string {
  const d = Math.max(-1, Math.min(1, darkness));
  const ch = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const channels = [ch(0), ch(2), ch(4)].map((v) => {
    if (d >= 0) {
      return Math.round(v * (1 - d * 0.75));
    }
    return Math.round(v + (255 - v) * (-d * 0.55));
  });
  return channels.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

function backgroundColorForStyle(style: BackgroundStyle, darkness = 0): string | null {
  let baseHex: string | null = null;
  switch (style) {
    case "studio_white":
      baseHex = "ffffff";
      break;
    case "studio_gray":
      baseHex = "bcbfc6";
      break;
    case "showroom":
      baseHex = "d7dee8";
      break;
    case "outdoor_soft":
      baseHex = "d9e6ff";
      break;
    case "blur_subtle":
      baseHex = "dfe2e8";
      break;
    case "clean_white":
      baseHex = "fdfdfd";
      break;
    case "soft_gradient":
      baseHex = "cfd8ea";
      break;
    case "dark_studio":
      baseHex = "2a2d33";
      break;
    case "neutral_lifestyle":
      baseHex = "d8d0c2";
      break;
    case "light_texture":
      baseHex = "d7d0c3";
      break;
    case "original":
    case "auto_best":
    default:
      return null;
  }
  return applyDarknessToHex(baseHex, darkness);
}

async function callRemoveBg(
  imageBuffer: Buffer,
  backgroundStyle: BackgroundStyle,
  backgroundDarkness: number,
  timeoutMs: number,
): Promise<Buffer> {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  const baseUrl = process.env.REMOVE_BG_API_BASE_URL ?? "https://api.remove.bg/v1.0";
  if (!apiKey) {
    throw new Error("REMOVE_BG_API_KEY is not configured.");
  }

  const formData = new FormData();
  formData.append("image_file_b64", imageBuffer.toString("base64"));
  formData.append("size", "auto");
  formData.append("format", "jpg");

  const bgColor = backgroundColorForStyle(backgroundStyle, backgroundDarkness);
  if (bgColor) {
    formData.append("bg_color", bgColor);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/removebg`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`remove.bg failed (${response.status}): ${errorBody.slice(0, 240)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function polishImage(
  imageBuffer: Buffer,
  level: "standard" | "pro" | "wow" = "pro",
  adjustments?: {
    exposure?: number;
    contrast?: number;
    saturation?: number;
    sharpen?: number;
    denoise?: number;
  },
): Promise<Buffer> {
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const exposureAdj = clamp(adjustments?.exposure ?? 0, -1, 1);
  const contrastAdj = clamp(adjustments?.contrast ?? 0, -1, 1);
  const saturationAdj = clamp(adjustments?.saturation ?? 0, -1, 1);
  const sharpenAdj = clamp(adjustments?.sharpen ?? 0, -1, 1);
  const denoiseAdj = clamp(adjustments?.denoise ?? 0, -1, 1);

  const normalized = sharp(imageBuffer, { failOn: "none" }).rotate().toColorspace("srgb");
  const isWow = level === "wow";
  const isPro = level === "pro";
  const baseBrightness = isWow ? 1.06 : isPro ? 1.03 : 1.01;
  const baseSaturation = isWow ? 1.14 : isPro ? 1.06 : 1.03;
  const base = normalized
    .modulate({
      brightness: baseBrightness + exposureAdj * 0.18,
      saturation: baseSaturation + saturationAdj * 0.25,
    })
    .linear((isWow ? 1.08 : 1.03) + contrastAdj * 0.2, (isWow ? -(8 / 255) : -(3 / 255)) - exposureAdj * (8 / 255))
    .normalise({ lower: isWow ? 2 : 4, upper: isWow ? 98 : 96 })
    .gamma((isWow ? 1.08 : 1.04) + exposureAdj * 0.08);

  const sharpened =
    isWow
      ? (
          denoiseAdj > 0
            ? base.median(1)
            : base
        )
          .sharpen({
            sigma: Math.max(0.7, 1.45 + sharpenAdj * 0.6),
            m1: 1.05,
            m2: 0.32,
            x1: 2.2,
            y2: 12.0,
            y3: 20.0,
          })
          .modulate({ saturation: 1.03 })
      : isPro
      ? base.sharpen({
          sigma: Math.max(0.6, 1.1 + sharpenAdj * 0.6),
          m1: 0.9,
          m2: 0.25,
          x1: 2.0,
          y2: 10.0,
          y3: 18.0,
        })
      : base.sharpen({
          sigma: Math.max(0.5, 0.9 + sharpenAdj * 0.6),
          m1: 0.8,
          m2: 0.18,
          x1: 2.0,
          y2: 8.0,
          y3: 14.0,
        });

  return sharpened
    .jpeg({
      quality: isWow ? 92 : isPro ? 90 : 86,
      chromaSubsampling: "4:4:4",
      mozjpeg: true,
    })
    .toBuffer();
}

async function upscaleSingle(input: UpscaleRequest) {
  const start = Date.now();
  const imageBuffer = Buffer.from(input.imageBase64, "base64");
  if (!imageBuffer.length) {
    throw new Error("imageBase64 must be a valid base64 image.");
  }

  if (input.scale !== 2 && input.scale !== 4) {
    throw new Error("scale must be 2 or 4.");
  }

  const level = input.enhanceLevel ?? "pro";
  const format = input.format ?? "jpg";
  const polished = await polishImage(imageBuffer, level, input.adjustments);
  const base = sharp(polished, { failOn: "none" }).rotate();
  const metadata = await base.metadata();
  const width = Math.max(1, metadata.width ?? 0);
  const height = Math.max(1, metadata.height ?? 0);
  const targetWidth = Math.round(width * input.scale);
  const targetHeight = Math.round(height * input.scale);

  let pipeline = base.resize(targetWidth, targetHeight, {
    fit: "fill",
    kernel: sharp.kernel.lanczos3,
    withoutEnlargement: false,
  });

  if (format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality: 92, effort: 5 });
  } else {
    pipeline = pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true });
  }

  const outputBuffer = await pipeline.toBuffer();
  return {
    upscaledImageBase64: outputBuffer.toString("base64"),
    scaleApplied: input.scale,
    width: targetWidth,
    height: targetHeight,
    formatApplied: format,
    provider: "internal" as const,
    latencyMs: Date.now() - start,
  };
}

async function applyLogoOverlay(
  baseBuffer: Buffer,
  logoBase64: string,
  logoOpacity = 0.2,
  logoPosition: "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center" = "bottom_right",
): Promise<Buffer> {
  const base = sharp(baseBuffer, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) return baseBuffer;

  const logoBuffer = Buffer.from(logoBase64, "base64");
  if (!logoBuffer.length) return baseBuffer;

  const targetLogoWidth = Math.max(80, Math.round(width * 0.18));
  const logo = await sharp(logoBuffer, { failOn: "none" })
    .resize({ width: targetLogoWidth, fit: "inside", withoutEnlargement: true })
    .png()
    .ensureAlpha()
    .toBuffer();

  const logoMeta = await sharp(logo).metadata();
  const lw = logoMeta.width ?? targetLogoWidth;
  const lh = logoMeta.height ?? targetLogoWidth;
  const margin = Math.max(12, Math.round(width * 0.02));
  const safeOpacity = Math.max(0.05, Math.min(0.85, logoOpacity));

  let left = margin;
  let top = margin;
  if (logoPosition === "top_right") {
    left = Math.max(margin, width - lw - margin);
    top = margin;
  } else if (logoPosition === "bottom_left") {
    left = margin;
    top = Math.max(margin, height - lh - margin);
  } else if (logoPosition === "bottom_right") {
    left = Math.max(margin, width - lw - margin);
    top = Math.max(margin, height - lh - margin);
  } else if (logoPosition === "center") {
    left = Math.max(margin, Math.round((width - lw) / 2));
    top = Math.max(margin, Math.round((height - lh) / 2));
  }

  const svgOverlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lw}" height="${lh}"><image href="data:image/png;base64,${logo.toString(
      "base64",
    )}" width="${lw}" height="${lh}" opacity="${safeOpacity}"/></svg>`,
  );

  return base
    .composite([{ input: svgOverlay, left, top, blend: "over" }])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}

async function enhanceSingle(input: EnhanceRequest) {
  const start = Date.now();
  const requestedStyle = input.backgroundStyle ?? "original";
  const normalizedStyle = normalizeBackgroundStyle(input.mode, input.stepId, requestedStyle);
  const provider = process.env.ENHANCE_PROVIDER ?? "remove_bg";
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 12000);
  const level = input.enhanceLevel ?? "pro";
  const backgroundDarkness = Math.max(-1, Math.min(1, input.backgroundDarkness ?? 0));

  const originalBuffer = Buffer.from(input.imageBase64, "base64");
  if (!originalBuffer.length) {
    throw new Error("imageBase64 must be a valid base64 image.");
  }

  if (provider !== "remove_bg" || normalizedStyle === "original") {
    const polishedOriginal = await polishImage(originalBuffer, level, input.adjustments);
    return {
      optimizedImageBase64: polishedOriginal.toString("base64"),
      backgroundRemoved: false,
      backgroundStyleApplied: normalizedStyle,
      provider: provider === "remove_bg" ? "fallback" : "internal",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const enhancedBuffer = await callRemoveBg(originalBuffer, normalizedStyle, backgroundDarkness, timeoutMs);
    let polishedResult = await polishImage(enhancedBuffer, level, input.adjustments);
    if (input.logoBase64) {
      polishedResult = await applyLogoOverlay(
        polishedResult,
        input.logoBase64,
        input.logoOpacity ?? 0.2,
        input.logoPosition ?? "bottom_right",
      );
    }
    return {
      optimizedImageBase64: polishedResult.toString("base64"),
      backgroundRemoved: true,
      backgroundStyleApplied: normalizedStyle,
      provider: "remove_bg",
      latencyMs: Date.now() - start,
    };
  } catch {
    const polishedFallback = await polishImage(originalBuffer, level, input.adjustments);
    return {
      optimizedImageBase64: polishedFallback.toString("base64"),
      backgroundRemoved: false,
      backgroundStyleApplied: "original" as const,
      provider: "fallback" as const,
      latencyMs: Date.now() - start,
    };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function analyzeVehicleDefects(imageBuffer: Buffer, stepId?: string) {
  const width = 320;
  const height = 320;
  const raw = await sharp(imageBuffer, { failOn: "none" })
    .rotate()
    .resize(width, height, { fit: "cover" })
    .greyscale()
    .raw()
    .toBuffer();
  const total = raw.length || 1;

  let darkEdgeCount = 0;
  let brightEdgeCount = 0;
  let darkCount = 0;
  let sum = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i = y * width + x;
      const p = raw[i] ?? 0;
      const right = raw[i + 1] ?? p;
      const down = raw[i + width] ?? p;
      const grad = Math.abs(p - right) + Math.abs(p - down);
      sum += p;
      if (p < 72) darkCount += 1;
      if (p < 92 && grad > 96) darkEdgeCount += 1;
      if (p > 212 && grad > 88) brightEdgeCount += 1;
    }
  }

  const stats = await sharp(imageBuffer, { failOn: "none" }).rotate().greyscale().stats();
  const entropy = Number((stats as unknown as { entropy?: number }).entropy ?? 0);
  const mean = sum / total;
  const darkRatio = darkCount / total;
  const darkEdgeRatio = darkEdgeCount / total;
  const brightEdgeRatio = brightEdgeCount / total;

  const tags: string[] = [];
  if (darkEdgeRatio > 0.018 || brightEdgeRatio > 0.028) tags.push("scratch_scuff");
  if (entropy > 6.6 && brightEdgeRatio > 0.018) tags.push("dent_ding");
  if (darkRatio > 0.22 && darkEdgeRatio > 0.022) tags.push("paint_damage");

  const confidence = clamp(
    (darkEdgeRatio * 18 + brightEdgeRatio * 12 + Math.max(0, entropy - 6) * 0.35) /
      (stepId === "side" ? 1 : 1.08),
    0,
    0.95,
  );

  const summary =
    tags.length > 0
      ? `Possible ${tags
          .map((t) =>
            t === "scratch_scuff" ? "scratch/scuff marks" : t === "dent_ding" ? "minor dent/ding" : "paint damage",
          )
          .join(", ")} visible in ${stepId?.replace(/_/g, " ") ?? "exterior"} photo.`
      : null;

  return {
    summary,
    tags,
    confidence: Number(confidence.toFixed(2)),
    metrics: {
      entropy: Number(entropy.toFixed(2)),
      darkRatio: Number(darkRatio.toFixed(3)),
      darkEdgeRatio: Number(darkEdgeRatio.toFixed(3)),
      brightEdgeRatio: Number(brightEdgeRatio.toFixed(3)),
      luminanceMean: Number(mean.toFixed(1)),
    },
  };
}

app.post("/v1/photo/enhance", async (req, res) => {
  const body = req.body as EnhanceRequest;
  if (!body || typeof body.imageBase64 !== "string" || !body.imageBase64) {
    res.status(400).json({ error: "ValidationError", message: "imageBase64 is required." });
    return;
  }

  if (!body.mode || !["auto", "electronics", "general"].includes(body.mode)) {
    res.status(400).json({ error: "ValidationError", message: "mode must be auto|electronics|general." });
    return;
  }

  const backgroundStyle = body.backgroundStyle ?? "original";
  if (!allowedBackgrounds.has(backgroundStyle)) {
    res.status(400).json({ error: "ValidationError", message: "backgroundStyle is invalid." });
    return;
  }

  try {
    const result = await enhanceSingle(body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "EnhanceFailed",
      message: error instanceof Error ? error.message : "Enhancement failed.",
    });
  }
});

app.get("/v1/photo/enhance", (_req, res) => {
  res.status(405).json({
    error: "MethodNotAllowed",
    message: "Use POST /v1/photo/enhance with JSON body.",
  });
});

app.get("/v1/billing/config", (_req, res) => {
  res.status(200).json(billingConfig());
});

app.get("/v1/billing/wallet/:userId", async (req, res) => {
  if (!authorizeBillingRequest(req, res)) return;
  const userId = req.params.userId;
  if (!userId) {
    res.status(400).json({ error: "ValidationError", message: "userId is required." });
    return;
  }
  try {
    const db = ensureFirestore();
    const config = billingConfig();
    const ref = userDoc(db, userId);
    const snap = await ref.get();
    if (!snap.exists) {
      const wallet = defaultWallet(config);
      await ref.set(
        {
          ...wallet,
          updated_at: new Date().toISOString(),
          updated_server_ts: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      res.status(200).json({ userId, ...wallet });
      return;
    }
    const data = snap.data() ?? {};
    const wallet: WalletState = {
      credits_balance: typeof data.credits_balance === "number" ? data.credits_balance : defaultWallet(config).credits_balance,
      auto_refill_enabled: Boolean(data.auto_refill_enabled),
      auto_refill_pack_id: typeof data.auto_refill_pack_id === "string" ? data.auto_refill_pack_id : config.defaultAutoRefillPackId,
      auto_refill_threshold:
        typeof data.auto_refill_threshold === "number" ? data.auto_refill_threshold : config.defaultAutoRefillThreshold,
    };
    res.status(200).json({ userId, ...wallet });
  } catch (error) {
    res.status(500).json({
      error: "WalletFetchFailed",
      message: error instanceof Error ? error.message : "Failed to read wallet.",
    });
  }
});

app.post("/v1/billing/topup", async (req, res) => {
  if (!authorizeBillingRequest(req, res)) return;
  const body = req.body as {
    userId?: string;
    packId?: string;
    idempotencyKey?: string;
    paymentRef?: string;
  };
  if (!body?.userId || !body.packId || !body.idempotencyKey) {
    res.status(400).json({ error: "ValidationError", message: "userId, packId, and idempotencyKey are required." });
    return;
  }
  try {
    const db = ensureFirestore();
    const config = billingConfig();
    const pack = config.topupPacks.find((p) => p.id === body.packId);
    if (!pack) {
      res.status(400).json({ error: "ValidationError", message: "Invalid packId." });
      return;
    }

    const result = await db.runTransaction(async (tx) => {
      const uRef = userDoc(db, body.userId!);
      const lRef = ledgerDoc(db, body.userId!, body.idempotencyKey!);
      const [userSnap, ledgerSnap] = await Promise.all([tx.get(uRef), tx.get(lRef)]);
      if (ledgerSnap.exists) {
        return ledgerSnap.data();
      }

      const current = userSnap.data() ?? defaultWallet(config);
      const currentBalance = typeof current.credits_balance === "number" ? current.credits_balance : defaultWallet(config).credits_balance;
      const nextBalance = currentBalance + pack.credits;
      const nowIso = new Date().toISOString();

      tx.set(
        uRef,
        {
          credits_balance: Number(nextBalance.toFixed(2)),
          updated_at: nowIso,
          updated_server_ts: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(lRef, {
        type: "topup" as LedgerEntryType,
        userId: body.userId,
        packId: pack.id,
        creditsDelta: pack.credits,
        amountUsd: pack.priceUsd,
        paymentRef: body.paymentRef ?? null,
        idempotencyKey: body.idempotencyKey,
        created_at: nowIso,
        created_server_ts: FieldValue.serverTimestamp(),
      });
      return {
        type: "topup",
        creditsDelta: pack.credits,
        balanceAfter: Number(nextBalance.toFixed(2)),
      };
    });
    res.status(200).json({ ok: true, result });
  } catch (error) {
    res.status(500).json({
      error: "TopupFailed",
      message: error instanceof Error ? error.message : "Top-up failed.",
    });
  }
});

app.post("/v1/billing/consume", async (req, res) => {
  if (!authorizeBillingRequest(req, res)) return;
  const body = req.body as {
    userId?: string;
    mode?: EnhanceMode;
    idempotencyKey?: string;
    jobCount?: number;
    jobRef?: string;
  };
  if (!body?.userId || !body.mode || !body.idempotencyKey) {
    res.status(400).json({ error: "ValidationError", message: "userId, mode, and idempotencyKey are required." });
    return;
  }
  if (!["auto", "electronics", "general"].includes(body.mode)) {
    res.status(400).json({ error: "ValidationError", message: "mode must be auto|electronics|general." });
    return;
  }
  const jobCount = Number.isFinite(body.jobCount) && (body.jobCount ?? 0) > 0 ? Number(body.jobCount) : 1;
  try {
    const db = ensureFirestore();
    const config = billingConfig();
    const perJobCost = modeCost(body.mode, config.modeMultipliers);
    const consumeCost = Number((jobCount * perJobCost).toFixed(2));

    const result = await db.runTransaction(async (tx) => {
      const uRef = userDoc(db, body.userId!);
      const lRef = ledgerDoc(db, body.userId!, body.idempotencyKey!);
      const [userSnap, ledgerSnap] = await Promise.all([tx.get(uRef), tx.get(lRef)]);
      if (ledgerSnap.exists) {
        return ledgerSnap.data();
      }

      const defaults = defaultWallet(config);
      const current = userSnap.data() ?? defaults;
      let balance = typeof current.credits_balance === "number" ? current.credits_balance : defaults.credits_balance;
      const autoRefillEnabled = Boolean(current.auto_refill_enabled);
      const threshold =
        typeof current.auto_refill_threshold === "number" ? current.auto_refill_threshold : defaults.auto_refill_threshold;
      const refillPackId =
        typeof current.auto_refill_pack_id === "string" ? current.auto_refill_pack_id : defaults.auto_refill_pack_id;
      const refillPack = config.topupPacks.find((p) => p.id === refillPackId) ?? config.topupPacks[0];

      let refillApplied = false;
      let refillCredits = 0;
      if (balance < consumeCost && autoRefillEnabled && refillPack) {
        balance += refillPack.credits;
        refillApplied = true;
        refillCredits = refillPack.credits;
        const refillLedgerId = `${body.idempotencyKey}:auto_refill`;
        tx.set(ledgerDoc(db, body.userId!, refillLedgerId), {
          type: "auto_refill" as LedgerEntryType,
          userId: body.userId,
          packId: refillPack.id,
          creditsDelta: refillPack.credits,
          amountUsd: refillPack.priceUsd,
          triggerIdempotencyKey: body.idempotencyKey,
          created_at: new Date().toISOString(),
          created_server_ts: FieldValue.serverTimestamp(),
        });
      }

      if (balance < consumeCost) {
        throw new Error("INSUFFICIENT_CREDITS");
      }

      balance = Number((balance - consumeCost).toFixed(2));
      const nowIso = new Date().toISOString();

      tx.set(
        uRef,
        {
          credits_balance: balance,
          auto_refill_enabled: autoRefillEnabled,
          auto_refill_pack_id: refillPackId,
          auto_refill_threshold: threshold,
          updated_at: nowIso,
          updated_server_ts: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.set(lRef, {
        type: "consume" as LedgerEntryType,
        userId: body.userId,
        mode: body.mode,
        jobCount,
        costPerJob: perJobCost,
        creditsDelta: -consumeCost,
        balanceAfter: balance,
        idempotencyKey: body.idempotencyKey,
        jobRef: body.jobRef ?? null,
        autoRefillApplied: refillApplied,
        autoRefillCredits: refillCredits,
        created_at: nowIso,
        created_server_ts: FieldValue.serverTimestamp(),
      });
      return {
        type: "consume",
        mode: body.mode,
        jobCount,
        creditsCharged: consumeCost,
        balanceAfter: balance,
        autoRefillApplied: refillApplied,
        autoRefillCredits: refillCredits,
      };
    });
    res.status(200).json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Consumption failed.";
    if (message === "INSUFFICIENT_CREDITS") {
      res.status(402).json({ error: "InsufficientCredits", message: "Not enough credits to process this job." });
      return;
    }
    res.status(500).json({
      error: "ConsumeFailed",
      message,
    });
  }
});

app.get("/v1/billing/owner/weekly", async (req, res) => {
  if (!authorizeOwnerRequest(req, res)) return;
  try {
    const db = ensureFirestore();
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fromIso = from.toISOString();
    const toIso = now.toISOString();

    const [usersSnap, ledgerSnap] = await Promise.all([
      db.collection("users").where("created_at", ">=", fromIso).get(),
      db.collectionGroup("credit_ledger").where("created_at", ">=", fromIso).get(),
    ]);

    let consumed = 0;
    let topup = 0;
    let autoRefillTopup = 0;
    let topupUsd = 0;
    let consumeEvents = 0;
    let topupEvents = 0;
    let autoRefillEvents = 0;
    const activeBillingUsers = new Set<string>();
    const payingUsers = new Set<string>();

    for (const doc of ledgerSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const userId = typeof data.userId === "string" ? data.userId : "";
      const type = typeof data.type === "string" ? data.type : "";
      if (userId) activeBillingUsers.add(userId);

      if (type === "consume") {
        consumeEvents += 1;
        const delta = Number(data.creditsDelta ?? 0);
        consumed += Math.abs(delta);
      } else if (type === "topup") {
        topupEvents += 1;
        const delta = Number(data.creditsDelta ?? 0);
        topup += delta;
        topupUsd += Number(data.amountUsd ?? 0);
        if (userId) payingUsers.add(userId);
      } else if (type === "auto_refill") {
        autoRefillEvents += 1;
        const delta = Number(data.creditsDelta ?? 0);
        autoRefillTopup += delta;
        topupUsd += Number(data.amountUsd ?? 0);
        if (userId) payingUsers.add(userId);
      }
    }

    res.status(200).json({
      range: { fromIso, toIso },
      users: {
        newUsers: usersSnap.size,
        activeBillingUsers: activeBillingUsers.size,
        payingUsers: payingUsers.size,
      },
      credits: {
        consumed: Number(consumed.toFixed(2)),
        topup: Number(topup.toFixed(2)),
        autoRefillTopup: Number(autoRefillTopup.toFixed(2)),
      },
      revenue: {
        topupUsd: Number(topupUsd.toFixed(2)),
      },
      events: {
        consumeEvents,
        topupEvents,
        autoRefillEvents,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "OwnerWeeklyFailed",
      message: error instanceof Error ? error.message : "Failed to compute weekly owner metrics.",
    });
  }
});

app.post("/v1/photo/enhance/batch", async (req, res) => {
  const body = req.body as BatchEnhanceRequest;
  const photos = body?.photos;
  if (!Array.isArray(photos) || photos.length === 0) {
    res.status(400).json({ error: "ValidationError", message: "photos[] is required." });
    return;
  }

  const results = await Promise.all(
    photos.map(async (photo) => {
      if (!photo?.id || !photo?.imageBase64 || !photo?.mode) {
        return {
          id: photo?.id ?? "unknown",
          ok: false,
          error: "Invalid photo payload.",
        };
      }
      const style = photo.backgroundStyle ?? "original";
      if (!allowedBackgrounds.has(style)) {
        return {
          id: photo.id,
          ok: false,
          error: "Invalid backgroundStyle.",
        };
      }
      try {
        const enhanced = await enhanceSingle(photo);
        return {
          id: photo.id,
          ok: true,
          ...enhanced,
        };
      } catch (error) {
        return {
          id: photo.id,
          ok: false,
          error: error instanceof Error ? error.message : "Enhancement failed.",
        };
      }
    }),
  );

  res.status(200).json({ results });
});

app.post("/v1/photo/upscale", async (req, res) => {
  const body = req.body as UpscaleRequest;
  if (!body || typeof body.imageBase64 !== "string" || !body.imageBase64) {
    res.status(400).json({ error: "ValidationError", message: "imageBase64 is required." });
    return;
  }
  if (body.scale !== 2 && body.scale !== 4) {
    res.status(400).json({ error: "ValidationError", message: "scale must be 2 or 4." });
    return;
  }
  if (body.format && !["jpg", "png", "webp"].includes(body.format)) {
    res.status(400).json({ error: "ValidationError", message: "format must be jpg|png|webp." });
    return;
  }

  try {
    const result = await upscaleSingle(body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "UpscaleFailed",
      message: error instanceof Error ? error.message : "Upscale failed.",
    });
  }
});

app.post("/v1/photo/enhance-upscale", async (req, res) => {
  const body = req.body as EnhanceUpscaleRequest;
  if (!body || typeof body.imageBase64 !== "string" || !body.imageBase64) {
    res.status(400).json({ error: "ValidationError", message: "imageBase64 is required." });
    return;
  }
  if (!body.mode || !["auto", "electronics", "general"].includes(body.mode)) {
    res.status(400).json({ error: "ValidationError", message: "mode must be auto|electronics|general." });
    return;
  }
  const backgroundStyle = body.backgroundStyle ?? "original";
  if (!allowedBackgrounds.has(backgroundStyle)) {
    res.status(400).json({ error: "ValidationError", message: "backgroundStyle is invalid." });
    return;
  }
  if (body.scale !== 2 && body.scale !== 4) {
    res.status(400).json({ error: "ValidationError", message: "scale must be 2 or 4." });
    return;
  }
  if (body.format && !["jpg", "png", "webp"].includes(body.format)) {
    res.status(400).json({ error: "ValidationError", message: "format must be jpg|png|webp." });
    return;
  }

  try {
    const start = Date.now();
    const enhanced = await enhanceSingle({
      imageBase64: body.imageBase64,
      mode: body.mode,
      stepId: body.stepId,
      backgroundStyle,
      backgroundDarkness: body.backgroundDarkness ?? 0,
      enhanceLevel: body.enhanceLevel ?? "pro",
      adjustments: body.adjustments,
      logoBase64: body.logoBase64,
      logoOpacity: body.logoOpacity,
      logoPosition: body.logoPosition,
    });

    const upscaled = await upscaleSingle({
      imageBase64: enhanced.optimizedImageBase64,
      scale: body.scale,
      format: body.format ?? "jpg",
      enhanceLevel: body.enhanceLevel ?? "pro",
      adjustments: body.adjustments,
    });

    res.status(200).json({
      optimizedImageBase64: upscaled.upscaledImageBase64,
      backgroundRemoved: enhanced.backgroundRemoved,
      backgroundStyleApplied: enhanced.backgroundStyleApplied,
      enhanceProvider: enhanced.provider,
      upscaleProvider: upscaled.provider,
      scaleApplied: upscaled.scaleApplied,
      width: upscaled.width,
      height: upscaled.height,
      formatApplied: upscaled.formatApplied,
      latencyMs: Date.now() - start,
      timing: {
        enhanceLatencyMs: enhanced.latencyMs ?? null,
        upscaleLatencyMs: upscaled.latencyMs ?? null,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "EnhanceUpscaleFailed",
      message: error instanceof Error ? error.message : "Enhance+upscale failed.",
    });
  }
});

app.post("/v1/photo/defects/analyze", async (req, res) => {
  const body = req.body as DefectAnalyzeRequest;
  if (!body || typeof body.imageBase64 !== "string" || !body.imageBase64) {
    res.status(400).json({ error: "ValidationError", message: "imageBase64 is required." });
    return;
  }
  try {
    const imageBuffer = Buffer.from(body.imageBase64, "base64");
    if (!imageBuffer.length) {
      res.status(400).json({ error: "ValidationError", message: "imageBase64 must be valid base64." });
      return;
    }
    const analyzed = await analyzeVehicleDefects(imageBuffer, body.stepId);
    res.status(200).json(analyzed);
  } catch (error) {
    res.status(500).json({
      error: "DefectAnalyzeFailed",
      message: error instanceof Error ? error.message : "Defect analysis failed.",
    });
  }
});

app.post("/v1/listing/analyze", async (req, res) => {
  const body = req.body as ListingAnalyzeRequest;
  if (!body?.mode || !["electronics", "general"].includes(body.mode)) {
    res.status(400).json({ error: "ValidationError", message: "mode must be electronics or general." });
    return;
  }
  if (!Array.isArray(body.imagesBase64) || body.imagesBase64.length === 0) {
    res.status(400).json({ error: "ValidationError", message: "imagesBase64 must be a non-empty array." });
    return;
  }
  try {
    const result = await runListingAnalyze({
      mode: body.mode,
      imagesBase64: body.imagesBase64,
      notes: body.notes,
      serial: body.serial,
      includePricing: body.includePricing,
    });
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Listing analyze failed.";
    const lower = message.toLowerCase();
    if (lower.includes("openai_api_key") || lower.includes("not configured")) {
      res.status(503).json({ error: "ListingAnalyzeNotConfigured", message });
      return;
    }
    res.status(500).json({
      error: "ListingAnalyzeFailed",
      message,
    });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`listforge-enhance-api listening on port ${port}`);
});
