export type AccountPlan = 'free' | 'trial' | 'pro' | 'business' | 'enterprise';

export type TrialStatus = 'active' | 'expired' | 'none';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  phone: string | null;
  plan: AccountPlan;
  credits_balance: number;
  auto_refill_enabled: boolean;
  auto_refill_pack_id: string | null;
  auto_refill_threshold: number;
  trial_ends_at: string | null;
  trial_status: TrialStatus;
  created_at: string;
  updated_at: string;
}

export interface Entitlements {
  canUseMarketPricing: boolean;
  canUseUnlimitedListings: boolean;
  canUseDealerBranding: boolean;
  isTrial: boolean;
}
