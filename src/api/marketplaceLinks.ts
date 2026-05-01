import { Linking, Platform } from 'react-native';

export const MARKETPLACE_DEEP_LINKS = {
  facebookMarketplaceCreate: 'https://www.facebook.com/marketplace/create/item',
  facebookApp: 'fb://marketplace',
  craigslist: 'https://www.craigslist.org',
  offerup: Platform.select({
    ios: 'offerup://',
    android: 'com.offerup.android://',
    default: 'https://offerup.com',
  })!,
} as const;

export async function openMarketplaceListingStarter() {
  await Linking.openURL(MARKETPLACE_DEEP_LINKS.facebookMarketplaceCreate);
}
