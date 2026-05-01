import type { Entitlements, UserProfile } from './types';

function isTrialActive(profile: UserProfile | null): boolean {
  return profile?.trial_status === 'active';
}

export function buildEntitlements(profile: UserProfile | null): Entitlements {
  const plan = profile?.plan ?? 'free';
  const trial = isTrialActive(profile);

  const paidOrTrial = plan === 'pro' || plan === 'business' || plan === 'enterprise' || trial;

  return {
    canUseMarketPricing: paidOrTrial,
    canUseUnlimitedListings: paidOrTrial,
    canUseDealerBranding: paidOrTrial,
    isTrial: trial,
  };
}
