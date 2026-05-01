import type { ConditionTier, VinDecodedVehicle } from '@/src/domain/types';

export interface PricingInput {
  vinVehicle: VinDecodedVehicle;
  condition: ConditionTier;
}

export interface PriceBand {
  fastSell: number;
  fairMarket: number;
  premiumAsk: number;
}

export interface ProviderQuote {
  source: 'kbb' | 'edmunds' | 'market_comps' | 'ebay';
  low: number;
  mid: number;
  high: number;
  sampleSize?: number;
  fetchedAt: string;
}

export interface PricePositioning {
  band: PriceBand;
  confidence: number; // 0..1
  rationale: string;
  sources: string[];
  quotes: ProviderQuote[];
}
