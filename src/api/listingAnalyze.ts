import Constants from 'expo-constants';

import type { ConditionTier, ItemProductProfile, ListingMode } from '@/src/domain/types';
import type { PricePositioning } from '@/src/ai/pricing/types';

export interface ListingAnalyzeRequest {
  mode: Exclude<ListingMode, 'auto'>;
  imagesBase64: string[];
  notes?: string;
  serial?: string;
  /** When false, skips live comps / estimate aggregation on the server. Default true. */
  includePricing?: boolean;
}

export interface ListingAnalyzeResponse {
  title: string;
  description: string;
  confidence: number;
  profile: {
    category: string;
    condition: ConditionTier;
    brand?: string;
    model?: string;
    storage?: string;
    hasAccessories?: boolean;
    sourceSignals?: string[];
  };
  pricing: PricePositioning | null;
  latencyMs: number;
}

function deriveListingAnalyzeEndpoint(): string | null {
  const endpoint =
    process.env.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL ??
    (Constants.expoConfig?.extra?.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL as string | undefined);
  if (!endpoint) return null;
  const baseEndpoint = endpoint.replace(/\/$/, '');
  if (baseEndpoint.endsWith('/v1/photo/enhance')) {
    return `${baseEndpoint.replace(/\/v1\/photo\/enhance$/, '')}/v1/listing/analyze`;
  }
  return `${baseEndpoint}/v1/listing/analyze`;
}

export function mapAnalyzeProfileToItemProfile(
  raw: ListingAnalyzeResponse['profile'],
  mode: Exclude<ListingMode, 'auto'>,
): ItemProductProfile {
  let cat: ItemProductProfile['category'];
  if (mode === 'electronics') {
    const electronics = ['phone', 'laptop', 'tablet', 'console', 'audio', 'camera', 'device'] as const;
    cat = electronics.includes(raw.category as (typeof electronics)[number])
      ? (raw.category as (typeof electronics)[number])
      : 'device';
  } else {
    const general = ['furniture', 'appliance', 'decor', 'tool', 'household'] as const;
    cat = general.includes(raw.category as (typeof general)[number])
      ? (raw.category as (typeof general)[number])
      : 'household';
  }

  return {
    category: cat,
    condition: raw.condition,
    brand: raw.brand,
    model: raw.model,
    storage: raw.storage,
    hasAccessories: raw.hasAccessories,
    sourceSignals: [...(raw.sourceSignals ?? []), 'vision_llm'],
  };
}

export async function analyzeListingViaBackend(
  input: ListingAnalyzeRequest,
): Promise<ListingAnalyzeResponse> {
  const url = deriveListingAnalyzeEndpoint();
  if (!url) {
    throw new Error('Photo enhancement / listing API URL is not configured.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: input.mode,
      imagesBase64: input.imagesBase64,
      notes: input.notes ?? '',
      serial: input.serial ?? '',
      includePricing: input.includePricing !== false,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`Listing analyze failed (${response.status}) ${errBody.slice(0, 200)}`);
  }

  return (await response.json()) as ListingAnalyzeResponse;
}
