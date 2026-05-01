import type { ListingMode } from './types';

export function inferModeFromKeywords(text: string): ListingMode | null {
  const t = text.toLowerCase();
  const auto =
    /\b(car|truck|suv|van|motorcycle|bike|vehicle|auto|automobile|ford|chevy|chevrolet|toyota|honda|bmw|tesla)\b/i.test(
      t,
    );
  const electronics =
    /\b(iphone|ipad|macbook|laptop|phone|tablet|ps5|xbox|switch|console|airpods|watch|galaxy|pixel)\b/i.test(
      t,
    );
  if (auto && !electronics) return 'auto';
  if (electronics && !auto) return 'electronics';
  return null;
}

export function describeMode(mode: ListingMode): { label: string; hint: string } {
  switch (mode) {
    case 'auto':
      return {
        label: 'Vehicle',
        hint: 'VIN decode + guided photos + instant listing',
      };
    case 'electronics':
      return {
        label: 'Electronics',
        hint: 'Phones, laptops, consoles, accessories',
      };
    case 'general':
      return {
        label: 'General',
        hint: 'Furniture, home goods, misc.',
      };
  }
}
