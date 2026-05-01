export type ListingMode = 'electronics' | 'auto' | 'general';

export type ConditionTier = 'excellent' | 'good' | 'fair';

export interface VinDecodedVehicle {
  vin: string;
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  series?: string;
  manufacturer?: string;
  bodyClass?: string;
  driveType?: string;
  fuelTypePrimary?: string;
  fuelTypeSecondary?: string;
  transmissionStyle?: string;
  transmissionSpeeds?: string;
  doors?: string;
  seats?: string;
  seatRows?: string;
  engineCylinders?: string;
  engineHP?: string;
  engineKW?: string;
  engineModel?: string;
  engineConfiguration?: string;
  displacementL?: string;
  electrificationLevel?: string;
  batteryKWh?: string;
  batteryA?: string;
  batteryV?: string;
  chargingLevel?: string;
  gvwr?: string;
}

export interface CapturedStepPhoto {
  stepId: string;
  originalUri: string;
  enhancedUri?: string;
  backgroundRemoved?: boolean;
  backgroundStyleApplied?: string;
  enhancementProvider?: 'remove_bg' | 'internal' | 'fallback' | 'local';
}

export interface CapturedItemPhoto {
  originalUri: string;
  enhancedUri: string;
}

export interface ItemProductProfile {
  category: 'phone' | 'laptop' | 'tablet' | 'console' | 'audio' | 'camera' | 'device' | 'furniture' | 'appliance' | 'decor' | 'tool' | 'household';
  condition: ConditionTier;
  brand?: string;
  model?: string;
  storage?: string;
  hasAccessories?: boolean;
  sourceSignals?: string[];
}

export interface GeneratedListing {
  title: string;
  priceRange: string;
  description: string;
  copyReady: string;
  platformCopies?: Partial<Record<ListingPlatform, PlatformListingCopy>>;
}

export type ListingPlatform =
  | 'generic'
  | 'facebook'
  | 'autotrader'
  | 'edmunds'
  | 'carsforsale'
  | 'ebay'
  | 'offerup'
  | 'craigslist';

export interface PlatformListingCopy {
  title: string;
  description: string;
  copyReady: string;
  notes?: string[];
}

export interface PendingVinJob {
  vin: string;
  createdAt: number;
}
