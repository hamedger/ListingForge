import Constants from 'expo-constants';

export type BackgroundStyle =
  | 'original'
  | 'auto_best'
  | 'studio_white'
  | 'studio_gray'
  | 'showroom'
  | 'outdoor_soft'
  | 'blur_subtle'
  | 'clean_white'
  | 'soft_gradient'
  | 'dark_studio'
  | 'neutral_lifestyle'
  | 'light_texture';

export interface EnhancePhotoInput {
  imageBase64: string;
  mode: 'auto' | 'electronics' | 'general';
  stepId?: string;
  backgroundStyle: BackgroundStyle;
  /** -1 (lighter) to 1 (darker) */
  backgroundDarkness?: number;
  enhanceLevel?: 'standard' | 'pro' | 'wow';
  adjustments?: {
    exposure?: number;
    contrast?: number;
    saturation?: number;
    sharpen?: number;
    denoise?: number;
  };
  logoBase64?: string;
  logoOpacity?: number;
  logoPosition?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center';
}

export interface EnhancePhotoResult {
  optimizedImageBase64: string;
  backgroundRemoved: boolean;
  backgroundStyleApplied: BackgroundStyle;
  provider: 'remove_bg' | 'internal' | 'fallback';
  latencyMs?: number;
}

export interface UpscalePhotoInput {
  imageBase64: string;
  scale: 2 | 4;
  format?: 'jpg' | 'png' | 'webp';
  backgroundDarkness?: number;
  enhanceLevel?: 'standard' | 'pro' | 'wow';
}

export interface UpscalePhotoResult {
  upscaledImageBase64: string;
  scaleApplied: 2 | 4;
  width: number;
  height: number;
  formatApplied: 'jpg' | 'png' | 'webp';
  provider: 'internal';
  latencyMs?: number;
}

export interface EnhanceUpscalePhotoInput extends EnhancePhotoInput {
  scale: 2 | 4;
  format?: 'jpg' | 'png' | 'webp';
}

export interface EnhanceUpscalePhotoResult {
  optimizedImageBase64: string;
  backgroundRemoved: boolean;
  backgroundStyleApplied: BackgroundStyle;
  enhanceProvider: 'remove_bg' | 'internal' | 'fallback';
  upscaleProvider: 'internal';
  scaleApplied: 2 | 4;
  width: number;
  height: number;
  formatApplied: 'jpg' | 'png' | 'webp';
  latencyMs?: number;
  timing?: {
    enhanceLatencyMs: number | null;
    upscaleLatencyMs: number | null;
  };
}

export interface AnalyzeVehicleDefectsInput {
  imageBase64: string;
  stepId?: string;
}

export interface AnalyzeVehicleDefectsResult {
  summary: string | null;
  tags: string[];
  confidence: number;
  metrics?: {
    entropy: number;
    darkRatio: number;
    darkEdgeRatio: number;
    brightEdgeRatio: number;
    luminanceMean: number;
  };
}

export interface BatchEnhancePhotoInput {
  id: string;
  imageBase64: string;
  mode: 'auto' | 'electronics' | 'general';
  stepId?: string;
  backgroundStyle: BackgroundStyle;
  backgroundDarkness?: number;
  enhanceLevel?: 'standard' | 'pro' | 'wow';
}

export type BatchEnhancePhotoResult =
  | ({ id: string; ok: true } & EnhancePhotoResult)
  | { id: string; ok: false; error: string };

const endpoint =
  process.env.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL ??
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL as string | undefined);

function deriveEndpoint(path: '/v1/photo/upscale' | '/v1/photo/enhance-upscale') {
  if (!endpoint) return null;
  const baseEndpoint = endpoint.replace(/\/$/, '');
  if (baseEndpoint.endsWith('/v1/photo/enhance')) {
    return `${baseEndpoint.replace(/\/v1\/photo\/enhance$/, '')}${path}`;
  }
  return `${baseEndpoint}${path}`;
}

function deriveAnalyzeEndpoint() {
  if (!endpoint) return null;
  const baseEndpoint = endpoint.replace(/\/$/, '');
  if (baseEndpoint.endsWith('/v1/photo/enhance')) {
    return `${baseEndpoint.replace(/\/v1\/photo\/enhance$/, '')}/v1/photo/defects/analyze`;
  }
  return `${baseEndpoint}/v1/photo/defects/analyze`;
}

export async function enhancePhotoViaBackend(input: EnhancePhotoInput): Promise<EnhancePhotoResult> {
  if (!endpoint) {
    throw new Error('Photo enhancement endpoint is not configured.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      mode: input.mode,
      stepId: input.stepId,
      backgroundStyle: input.backgroundStyle,
      backgroundDarkness: input.backgroundDarkness ?? 0,
      enhanceLevel: input.enhanceLevel ?? 'pro',
      adjustments: input.adjustments,
      logoBase64: input.logoBase64,
      logoOpacity: input.logoOpacity ?? 0.2,
      logoPosition: input.logoPosition ?? 'bottom_right',
    }),
  });

  if (!response.ok) {
    throw new Error(`Photo enhancement failed (${response.status})`);
  }

  return (await response.json()) as EnhancePhotoResult;
}

export async function enhancePhotoBatchViaBackend(
  photos: BatchEnhancePhotoInput[],
): Promise<BatchEnhancePhotoResult[]> {
  if (!endpoint) {
    throw new Error('Photo enhancement endpoint is not configured.');
  }

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photos }),
  });

  if (!response.ok) {
    throw new Error(`Photo batch enhancement failed (${response.status})`);
  }

  const payload = (await response.json()) as { results?: BatchEnhancePhotoResult[] };
  return payload.results ?? [];
}

export async function upscalePhotoViaBackend(input: UpscalePhotoInput): Promise<UpscalePhotoResult> {
  const upscaleEndpoint = deriveEndpoint('/v1/photo/upscale');
  if (!upscaleEndpoint) {
    throw new Error('Photo enhancement endpoint is not configured.');
  }

  const response = await fetch(upscaleEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      scale: input.scale,
      format: input.format ?? 'jpg',
      backgroundDarkness: input.backgroundDarkness ?? 0,
      enhanceLevel: input.enhanceLevel ?? 'pro',
    }),
  });

  if (!response.ok) {
    throw new Error(`Photo upscale failed (${response.status})`);
  }

  return (await response.json()) as UpscalePhotoResult;
}

export async function enhanceUpscalePhotoViaBackend(
  input: EnhanceUpscalePhotoInput,
): Promise<EnhanceUpscalePhotoResult> {
  const enhanceUpscaleEndpoint = deriveEndpoint('/v1/photo/enhance-upscale');
  if (!enhanceUpscaleEndpoint) {
    throw new Error('Photo enhancement endpoint is not configured.');
  }

  const response = await fetch(enhanceUpscaleEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      mode: input.mode,
      stepId: input.stepId,
      backgroundStyle: input.backgroundStyle,
      backgroundDarkness: input.backgroundDarkness ?? 0,
      enhanceLevel: input.enhanceLevel ?? 'pro',
      scale: input.scale,
      format: input.format ?? 'jpg',
      logoBase64: input.logoBase64,
      logoOpacity: input.logoOpacity ?? 0.2,
      logoPosition: input.logoPosition ?? 'bottom_right',
    }),
  });

  if (!response.ok) {
    throw new Error(`Photo enhance+upscale failed (${response.status})`);
  }

  return (await response.json()) as EnhanceUpscalePhotoResult;
}

export async function analyzeVehicleDefectsViaBackend(
  input: AnalyzeVehicleDefectsInput,
): Promise<AnalyzeVehicleDefectsResult> {
  const analyzeEndpoint = deriveAnalyzeEndpoint();
  if (!analyzeEndpoint) {
    throw new Error('Photo enhancement endpoint is not configured.');
  }
  const response = await fetch(analyzeEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: input.imageBase64,
      stepId: input.stepId,
    }),
  });
  if (!response.ok) {
    throw new Error(`Defect analysis failed (${response.status})`);
  }
  return (await response.json()) as AnalyzeVehicleDefectsResult;
}
