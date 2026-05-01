import type { ProviderQuote, PricingInput } from './types';

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pricing provider failed (${res.status})`);
  return res.json();
}

export async function fetchKbbQuote(input: PricingInput): Promise<ProviderQuote | null> {
  const base = process.env.EXPO_PUBLIC_KBB_API_URL;
  if (!base) return null;
  const url = `${base}?year=${encodeURIComponent(input.vinVehicle.year ?? '')}&make=${encodeURIComponent(
    input.vinVehicle.make ?? '',
  )}&model=${encodeURIComponent(input.vinVehicle.model ?? '')}&trim=${encodeURIComponent(
    input.vinVehicle.trim ?? '',
  )}&condition=${encodeURIComponent(input.condition)}`;

  const data = (await fetchJson(url)) as Record<string, unknown>;
  const low = num(data.low);
  const mid = num(data.mid);
  const high = num(data.high);
  if (low == null || mid == null || high == null) return null;
  return {
    source: 'kbb',
    low,
    mid,
    high,
    sampleSize: num(data.sampleSize) ?? undefined,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchEdmundsQuote(input: PricingInput): Promise<ProviderQuote | null> {
  const base = process.env.EXPO_PUBLIC_EDMUNDS_API_URL;
  if (!base) return null;
  const url = `${base}?year=${encodeURIComponent(input.vinVehicle.year ?? '')}&make=${encodeURIComponent(
    input.vinVehicle.make ?? '',
  )}&model=${encodeURIComponent(input.vinVehicle.model ?? '')}&trim=${encodeURIComponent(
    input.vinVehicle.trim ?? '',
  )}&condition=${encodeURIComponent(input.condition)}`;

  const data = (await fetchJson(url)) as Record<string, unknown>;
  const low = num(data.low);
  const mid = num(data.mid);
  const high = num(data.high);
  if (low == null || mid == null || high == null) return null;
  return {
    source: 'edmunds',
    low,
    mid,
    high,
    sampleSize: num(data.sampleSize) ?? undefined,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchMarketCompsQuote(input: PricingInput): Promise<ProviderQuote | null> {
  const base = process.env.EXPO_PUBLIC_MARKET_COMPS_API_URL;
  if (!base) return null;
  const url = `${base}?year=${encodeURIComponent(input.vinVehicle.year ?? '')}&make=${encodeURIComponent(
    input.vinVehicle.make ?? '',
  )}&model=${encodeURIComponent(input.vinVehicle.model ?? '')}&trim=${encodeURIComponent(
    input.vinVehicle.trim ?? '',
  )}&condition=${encodeURIComponent(input.condition)}`;

  const data = (await fetchJson(url)) as Record<string, unknown>;
  const low = num(data.low);
  const mid = num(data.mid);
  const high = num(data.high);
  if (low == null || mid == null || high == null) return null;
  return {
    source: 'market_comps',
    low,
    mid,
    high,
    sampleSize: num(data.sampleSize) ?? undefined,
    fetchedAt: new Date().toISOString(),
  };
}
