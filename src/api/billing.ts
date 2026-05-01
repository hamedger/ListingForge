import Constants from 'expo-constants';

type EnhanceMode = 'auto' | 'electronics' | 'general';

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  priceUsd: number;
  popular?: boolean;
}

export interface BillingConfigResponse {
  topupPacks: CreditPack[];
  modeMultipliers: Record<EnhanceMode, number>;
  defaultAutoRefillThreshold: number;
  defaultAutoRefillPackId: string;
}

const photoEnhanceEndpoint =
  process.env.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL ??
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL as string | undefined);

function billingConfigEndpoint() {
  if (!photoEnhanceEndpoint) return null;
  const baseEndpoint = photoEnhanceEndpoint.replace(/\/$/, '');
  if (baseEndpoint.endsWith('/v1/photo/enhance')) {
    return `${baseEndpoint.replace(/\/v1\/photo\/enhance$/, '')}/v1/billing/config`;
  }
  return `${baseEndpoint}/v1/billing/config`;
}

export async function fetchBillingConfig(): Promise<BillingConfigResponse> {
  const endpoint = billingConfigEndpoint();
  if (!endpoint) {
    throw new Error('Billing endpoint is not configured.');
  }

  const response = await fetch(endpoint, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Billing config fetch failed (${response.status})`);
  }
  return (await response.json()) as BillingConfigResponse;
}
