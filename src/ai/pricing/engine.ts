import type { ConditionTier } from '@/src/domain/types';

import { fetchEdmundsQuote, fetchKbbQuote, fetchMarketCompsQuote } from './providers';
import type { PricePositioning, PricingInput, ProviderQuote } from './types';

function heuristicFallback(year: number, condition: ConditionTier): ProviderQuote {
  const age = Math.max(0, 2026 - year);
  let midpoint = 22000 - age * 900;
  midpoint = Math.max(4500, Math.min(65000, midpoint));
  const mult = condition === 'excellent' ? 1.06 : condition === 'good' ? 1 : 0.88;
  const center = midpoint * mult;
  return {
    source: 'market_comps',
    low: center * 0.88,
    mid: center,
    high: center * 1.12,
    fetchedAt: new Date().toISOString(),
  };
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
}

export async function getAutoPricePositioning(input: PricingInput): Promise<PricePositioning> {
  const [kbb, edmunds, comps] = await Promise.allSettled([
    fetchKbbQuote(input),
    fetchEdmundsQuote(input),
    fetchMarketCompsQuote(input),
  ]);

  const quotes = [kbb, edmunds, comps]
    .filter((r): r is PromiseFulfilledResult<ProviderQuote | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is ProviderQuote => v != null);

  const withFallback =
    quotes.length > 0
      ? quotes
      : [heuristicFallback(Number(input.vinVehicle.year || 0), input.condition)];

  const fastSell = average(withFallback.map((q) => q.low));
  const fairMarket = average(withFallback.map((q) => q.mid));
  const premiumAsk = average(withFallback.map((q) => q.high));

  const hasNamedSources = quotes.length > 0;
  const confidence = hasNamedSources
    ? Math.min(0.95, 0.55 + quotes.length * 0.12 + (quotes.some((q) => q.sampleSize && q.sampleSize > 20) ? 0.1 : 0))
    : 0.35;

  const sourceNames = Array.from(
    new Set(
      withFallback.map((q) =>
        q.source === 'kbb'
          ? 'KBB'
          : q.source === 'edmunds'
            ? 'Edmunds'
            : q.source === 'ebay'
              ? 'eBay'
              : 'Market comps',
      ),
    ),
  );

  return {
    band: { fastSell, fairMarket, premiumAsk },
    confidence,
    sources: sourceNames,
    quotes: withFallback,
    rationale: hasNamedSources
      ? `Based on ${sourceNames.join(', ')} adjusted by selected condition (${input.condition}).`
      : 'Fallback estimate only. Connect KBB/Edmunds/comps APIs for market-backed pricing.',
  };
}
