import sharp from "sharp";

export type ListingAnalyzeMode = "electronics" | "general";

export type VisionCondition = "excellent" | "good" | "fair";

export type VisionElectronicsCategory =
  | "phone"
  | "laptop"
  | "tablet"
  | "console"
  | "audio"
  | "camera"
  | "device";

export type VisionGeneralCategory = "furniture" | "appliance" | "decor" | "tool" | "household";

export interface ListingProfilePayload {
  category: VisionElectronicsCategory | VisionGeneralCategory;
  condition: VisionCondition;
  brand?: string;
  model?: string;
  storage?: string;
  hasAccessories?: boolean;
  sourceSignals?: string[];
}

export interface ProviderQuotePayload {
  source: "ebay" | "market_comps";
  low: number;
  mid: number;
  high: number;
  sampleSize?: number;
  fetchedAt: string;
}

export interface PricePositioningPayload {
  band: { fastSell: number; fairMarket: number; premiumAsk: number };
  confidence: number;
  rationale: string;
  sources: string[];
  quotes: ProviderQuotePayload[];
}

export interface ListingAnalyzeResult {
  title: string;
  description: string;
  confidence: number;
  profile: ListingProfilePayload;
  pricing: PricePositioningPayload | null;
  latencyMs: number;
}

type VisionJson = {
  title: string;
  description: string;
  confidence: number;
  category: string;
  condition: string;
  brand?: string | null;
  model?: string | null;
  storage?: string | null;
  hasAccessories?: boolean | null;
  attributes?: string[];
  suggestedPriceMidUsd?: number | null;
};

const ELECTRONICS_CATS = new Set<VisionElectronicsCategory>([
  "phone",
  "laptop",
  "tablet",
  "console",
  "audio",
  "camera",
  "device",
]);

const GENERAL_CATS = new Set<VisionGeneralCategory>([
  "furniture",
  "appliance",
  "decor",
  "tool",
  "household",
]);

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function shrinkImageBase64(imageBase64: string, maxSide: number, jpegQuality: number): Promise<string> {
  const buf = Buffer.from(imageBase64, "base64");
  if (!buf.length) throw new Error("Invalid base64 image.");
  const img = sharp(buf, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) throw new Error("Could not read image dimensions.");
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  const out = await img
    .resize(targetW, targetH, { fit: "inside", withoutEnlargement: false })
    .jpeg({ quality: jpegQuality, mozjpeg: true })
    .toBuffer();
  return out.toString("base64");
}

function parseVisionJson(text: string): VisionJson {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? jsonMatch[0]! : trimmed;
  const parsed = JSON.parse(raw) as VisionJson;
  if (!parsed.title || !parsed.description) {
    throw new Error("Vision model returned incomplete JSON.");
  }
  return parsed;
}

function normalizeElectronicsCategory(raw: string): VisionElectronicsCategory {
  const s = raw.toLowerCase();
  if (s.includes("phone") || s.includes("iphone") || s.includes("android")) return "phone";
  if (s.includes("laptop") || s.includes("macbook") || s.includes("notebook")) return "laptop";
  if (s.includes("tablet") || s.includes("ipad")) return "tablet";
  if (s.includes("console") || s.includes("playstation") || s.includes("xbox") || s.includes("switch")) return "console";
  if (s.includes("camera")) return "camera";
  if (s.includes("speaker") || s.includes("audio") || s.includes("headphone")) return "audio";
  return "device";
}

function normalizeGeneralCategory(raw: string): VisionGeneralCategory {
  const s = raw.toLowerCase();
  if (s.includes("sofa") || s.includes("chair") || s.includes("table") || s.includes("dresser")) return "furniture";
  if (s.includes("washer") || s.includes("dryer") || s.includes("fridge") || s.includes("appliance")) return "appliance";
  if (s.includes("lamp") || s.includes("decor") || s.includes("art")) return "decor";
  if (s.includes("drill") || s.includes("tool") || s.includes("wrench")) return "tool";
  return "household";
}

function normalizeCondition(raw: string): VisionCondition {
  const s = raw.toLowerCase();
  if (s.includes("excellent") || s.includes("like new") || s.includes("mint")) return "excellent";
  if (s.includes("fair") || s.includes("wear") || s.includes("damage")) return "fair";
  return "good";
}

function mapToProfile(mode: ListingAnalyzeMode, v: VisionJson): ListingProfilePayload {
  const condition = normalizeCondition(v.condition || "good");
  let categoryStr = (v.category || "device").toLowerCase();
  if (mode === "electronics") {
    const cat = ELECTRONICS_CATS.has(categoryStr as VisionElectronicsCategory)
      ? (categoryStr as VisionElectronicsCategory)
      : normalizeElectronicsCategory(categoryStr);
    return {
      category: cat,
      condition,
      brand: v.brand?.trim() || undefined,
      model: v.model?.trim() || undefined,
      storage: v.storage?.trim() || undefined,
      hasAccessories: v.hasAccessories ?? undefined,
      sourceSignals: ["vision_llm"],
    };
  }
  const cat = GENERAL_CATS.has(categoryStr as VisionGeneralCategory)
    ? (categoryStr as VisionGeneralCategory)
    : normalizeGeneralCategory(categoryStr);
  return {
    category: cat,
    condition,
    brand: v.brand?.trim() || undefined,
    model: v.model?.trim() || undefined,
    storage: undefined,
    hasAccessories: v.hasAccessories ?? undefined,
    sourceSignals: ["vision_llm"],
  };
}

function defaultMidPriceForCategory(mode: ListingAnalyzeMode, profile: ListingProfilePayload): number {
  if (mode === "general") {
    if (profile.category === "furniture") return 180;
    if (profile.category === "appliance") return 220;
    return 65;
  }
  switch (profile.category) {
    case "phone":
      return 420;
    case "laptop":
      return 650;
    case "tablet":
      return 320;
    case "console":
      return 320;
    case "camera":
      return 450;
    case "audio":
      return 180;
    default:
      return 200;
  }
}

async function getEbayApplicationToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const sandbox = process.env.EBAY_USE_SANDBOX === "1" || process.env.EBAY_USE_SANDBOX === "true";
  const tokenUrl = sandbox
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchEbayQuote(searchQuery: string): Promise<ProviderQuotePayload | null> {
  const token = await getEbayApplicationToken();
  if (!token) return null;

  const sandbox = process.env.EBAY_USE_SANDBOX === "1" || process.env.EBAY_USE_SANDBOX === "true";
  const base = sandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  const q = encodeURIComponent(searchQuery.slice(0, 180));
  const url = `${base}/buy/browse/v1/item_summary/search?q=${q}&limit=50`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      itemSummaries?: Array<{ price?: { value?: string } }>;
    };
    const summaries = data.itemSummaries ?? [];
    const prices = summaries
      .map((s) => Number(s.price?.value))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (prices.length === 0) return null;

    const midIdx = Math.floor(prices.length / 2);
    const mid = prices[midIdx] ?? prices[0]!;
    const low = prices[0]!;
    const high = prices[prices.length - 1]!;
    return {
      source: "ebay",
      low,
      mid,
      high,
      sampleSize: prices.length,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildSearchQuery(profile: ListingProfilePayload, title: string): string {
  const parts = [profile.brand, profile.model, profile.category === "device" ? "" : profile.category].filter(Boolean);
  const joined = parts.join(" ").trim();
  if (joined.length >= 8) return joined;
  return title.slice(0, 120);
}

function buildPricing(
  mode: ListingAnalyzeMode,
  profile: ListingProfilePayload,
  vision: VisionJson,
  includePricing: boolean,
): Promise<PricePositioningPayload | null> {
  return (async () => {
    if (!includePricing) return null;

    const midGuess =
      typeof vision.suggestedPriceMidUsd === "number" && Number.isFinite(vision.suggestedPriceMidUsd)
        ? clamp(vision.suggestedPriceMidUsd, 5, 500_000)
        : defaultMidPriceForCategory(mode, profile);

    const ebayPromise = fetchEbayQuote(buildSearchQuery(profile, vision.title));

    const ebay = await ebayPromise;

    if (ebay) {
      const band = {
        fastSell: Math.max(5, ebay.mid * 0.87),
        fairMarket: ebay.mid,
        premiumAsk: ebay.mid * 1.14,
      };
      const confidence = clamp(0.52 + Math.min(0.35, (ebay.sampleSize ?? 0) / 200), 0.45, 0.92);
      return {
        band,
        confidence,
        rationale: `Based on ${ebay.sampleSize ?? 0} active eBay US listings for "${buildSearchQuery(profile, vision.title)}". Tune price for condition and fees.`,
        sources: ["eBay"],
        quotes: [ebay],
      };
    }

    const spread = midGuess * 0.18;
    const fallbackQuote: ProviderQuotePayload = {
      source: "market_comps",
      low: clamp(midGuess - spread * 1.5, 5, midGuess * 3),
      mid: midGuess,
      high: clamp(midGuess + spread * 1.5, midGuess, midGuess * 4),
      sampleSize: 0,
      fetchedAt: new Date().toISOString(),
    };

    return {
      band: {
        fastSell: clamp(fallbackQuote.low * 0.95, 5, fallbackQuote.mid),
        fairMarket: fallbackQuote.mid,
        premiumAsk: clamp(fallbackQuote.high * 1.05, fallbackQuote.mid, fallbackQuote.high * 1.4),
      },
      confidence: 0.38,
      rationale:
        process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET
          ? "eBay search returned no usable prices; using vision-guided estimate. Refine title or add seller notes."
          : "Vision-guided estimate only. Configure EBAY_CLIENT_ID and EBAY_CLIENT_SECRET on the server for live marketplace comps.",
      sources: ["Estimate"],
      quotes: [fallbackQuote],
    };
  })();
}

async function callOpenAiVision(args: {
  mode: ListingAnalyzeMode;
  imagesBase64: string[];
  notes: string;
  serial: string;
}): Promise<VisionJson> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const modeHint =
    args.mode === "electronics"
      ? "electronics / consumer tech (phones, laptops, consoles, audio gear, cameras)."
      : "general marketplace items (furniture, appliances, decor, tools, household).";

  const system = `You help sellers list used items for online marketplaces.
Identify the object from photos. Mode context: ${modeHint}
Return ONLY valid JSON (no markdown) with this shape:
{
  "title": string (<= 72 chars, specific, no ALL CAPS),
  "description": string (2-5 short paragraphs: condition, what's included, buyer tips; avoid inventing specs not visible),
  "confidence": number between 0 and 1,
  "category": string (for electronics: one of phone,laptop,tablet,console,audio,camera,device; for general: furniture,appliance,decor,tool,household),
  "condition": one of excellent, good, fair,
  "brand": string or null,
  "model": string or null,
  "storage": string or null (for electronics if visible),
  "hasAccessories": boolean or null,
  "attributes": string[] (short bullet facts you can see),
  "suggestedPriceMidUsd": number or null (rough USD midpoint for used condition in US market, or null if unsure)
}
Never invent serial numbers. Use "null" for unknown fields. Be conservative on price.`;

  const userParts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  > = [
    {
      type: "text",
      text: `Seller notes: ${args.notes.trim() || "(none)"}\nSerial / extra text: ${args.serial.trim() || "(none)"}`,
    },
  ];

  for (const b64 of args.imagesBase64) {
    userParts.push({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${b64}`, detail: "low" },
    });
  }

  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
  const controller = new AbortController();
  const timeoutMs = Number(process.env.LISTING_ANALYZE_TIMEOUT_MS ?? 55000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 1400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userParts },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${errText.slice(0, 320)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("OpenAI returned empty content.");
    }
    return parseVisionJson(content);
  } finally {
    clearTimeout(timer);
  }
}

export async function runListingAnalyze(body: {
  mode: ListingAnalyzeMode;
  imagesBase64: string[];
  notes?: string;
  serial?: string;
  includePricing?: boolean;
}): Promise<ListingAnalyzeResult> {
  const start = Date.now();
  const mode = body.mode;
  if (mode !== "electronics" && mode !== "general") {
    throw new Error("mode must be electronics or general.");
  }
  const rawImages = Array.isArray(body.imagesBase64) ? body.imagesBase64.filter((s) => typeof s === "string" && s.length > 0) : [];
  if (rawImages.length === 0) {
    throw new Error("imagesBase64 must include at least one image.");
  }
  const maxImages = Math.min(4, Number(process.env.LISTING_ANALYZE_MAX_IMAGES ?? 4));
  const maxSide = Number(process.env.LISTING_ANALYZE_MAX_SIDE ?? 1024);
  const jpegQ = clamp(Number(process.env.LISTING_ANALYZE_JPEG_QUALITY ?? 82), 60, 92);

  const shrunk: string[] = [];
  for (const img of rawImages.slice(0, maxImages)) {
    shrunk.push(await shrinkImageBase64(img, maxSide, jpegQ));
  }

  const vision = await callOpenAiVision({
    mode,
    imagesBase64: shrunk,
    notes: body.notes ?? "",
    serial: body.serial ?? "",
  });

  const profile = mapToProfile(mode, vision);
  const includePricing = body.includePricing !== false;
  const pricing = await buildPricing(mode, profile, vision, includePricing);

  return {
    title: vision.title.trim(),
    description: vision.description.trim(),
    confidence: clamp(typeof vision.confidence === "number" ? vision.confidence : 0.7, 0, 1),
    profile,
    pricing,
    latencyMs: Date.now() - start,
  };
}
