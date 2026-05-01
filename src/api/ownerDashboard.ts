import Constants from 'expo-constants';

export interface OwnerWeeklyStats {
  range: {
    fromIso: string;
    toIso: string;
  };
  users: {
    newUsers: number;
    activeBillingUsers: number;
    payingUsers: number;
  };
  credits: {
    consumed: number;
    topup: number;
    autoRefillTopup: number;
  };
  revenue: {
    topupUsd: number;
  };
  events: {
    consumeEvents: number;
    topupEvents: number;
    autoRefillEvents: number;
  };
}

const photoEnhanceEndpoint =
  process.env.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL ??
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_PHOTO_ENHANCE_API_URL as string | undefined);

function ownerWeeklyEndpoint() {
  if (!photoEnhanceEndpoint) return null;
  const baseEndpoint = photoEnhanceEndpoint.replace(/\/$/, '');
  if (baseEndpoint.endsWith('/v1/photo/enhance')) {
    return `${baseEndpoint.replace(/\/v1\/photo\/enhance$/, '')}/v1/billing/owner/weekly`;
  }
  return `${baseEndpoint}/v1/billing/owner/weekly`;
}

export async function fetchOwnerWeeklyStats(pin: string): Promise<OwnerWeeklyStats> {
  const endpoint = ownerWeeklyEndpoint();
  if (!endpoint) {
    throw new Error('Photo enhancement endpoint is not configured.');
  }
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'x-owner-pin': pin,
    },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid owner PIN');
    throw new Error(`Owner dashboard failed (${response.status})`);
  }
  return (await response.json()) as OwnerWeeklyStats;
}
