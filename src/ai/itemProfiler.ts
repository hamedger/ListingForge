import type { ItemProductProfile, ListingMode } from '@/src/domain/types';

import { scanTextFromImage } from '@/src/ai/vinOcr';

type InferItemProfileArgs = {
  mode: Exclude<ListingMode, 'auto'>;
  notes: string;
  serial?: string;
  photoUris?: string[];
};

const BRAND_HINTS = [
  'apple',
  'samsung',
  'google',
  'sony',
  'dell',
  'hp',
  'lenovo',
  'microsoft',
  'nintendo',
  'canon',
  'nikon',
  'bose',
  'jbl',
] as const;

export async function inferItemProfile(args: InferItemProfileArgs): Promise<ItemProductProfile> {
  const ocrSignals: string[] = [];
  const photoUris = args.photoUris ?? [];
  const toScan = photoUris.slice(0, 2);
  for (const uri of toScan) {
    try {
      const text = await scanTextFromImage(uri);
      if (text?.trim()) ocrSignals.push(text.trim());
    } catch {
      // OCR is best-effort and should never block listing generation.
    }
  }

  const combined = [args.notes, args.serial ?? '', ...ocrSignals].join(' ').toLowerCase();
  const sourceSignals = [
    args.notes.trim() ? 'notes' : null,
    args.serial?.trim() ? 'serial' : null,
    ocrSignals.length ? 'photo_ocr' : null,
  ].filter(Boolean) as string[];

  if (args.mode === 'electronics') {
    const category: ItemProductProfile['category'] = combined.includes('iphone') || combined.includes('android')
      ? 'phone'
      : combined.includes('macbook') || combined.includes('laptop')
        ? 'laptop'
        : combined.includes('ipad') || combined.includes('tablet')
          ? 'tablet'
          : combined.includes('playstation') || combined.includes('xbox') || combined.includes('console')
            ? 'console'
            : combined.includes('camera')
              ? 'camera'
              : combined.includes('speaker') || combined.includes('headphone') || combined.includes('earbud')
                ? 'audio'
                : 'device';
    const condition: ItemProductProfile['condition'] = combined.includes('mint') || combined.includes('like new')
      ? 'excellent'
      : combined.includes('scratch') || combined.includes('crack') || combined.includes('wear')
        ? 'fair'
        : 'good';
    const brand = BRAND_HINTS.find((b) => combined.includes(b));
    const storageMatch = combined.match(/\b(64gb|128gb|256gb|512gb|1tb|2tb)\b/i);
    const model = extractModel(args.notes, args.serial ?? '', ocrSignals);
    const hasAccessories =
      combined.includes('box') || combined.includes('charger') || combined.includes('cable') || combined.includes('case');

    return {
      category,
      condition,
      brand: brand ? capitalize(brand) : undefined,
      model: model ?? undefined,
      storage: storageMatch?.[1]?.toUpperCase(),
      hasAccessories,
      sourceSignals,
    };
  }

  const category: ItemProductProfile['category'] = combined.includes('sofa') ||
    combined.includes('table') ||
    combined.includes('chair') ||
    combined.includes('dresser')
    ? 'furniture'
    : combined.includes('washer') || combined.includes('dryer') || combined.includes('fridge')
      ? 'appliance'
      : combined.includes('lamp') || combined.includes('art') || combined.includes('decor')
        ? 'decor'
        : combined.includes('drill') || combined.includes('tool')
          ? 'tool'
          : 'household';
  const condition: ItemProductProfile['condition'] = combined.includes('new') || combined.includes('mint')
    ? 'excellent'
    : combined.includes('damage') || combined.includes('stain') || combined.includes('broken')
      ? 'fair'
      : 'good';

  return { category, condition, sourceSignals };
}

function extractModel(notes: string, serial: string, ocrSignals: string[]): string | null {
  const lines = [notes, serial, ...ocrSignals].join('\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const strong = lines.find((line) => /\b(iphone|galaxy|pixel|macbook|ipad|playstation|xbox)\b/i.test(line));
  if (strong) return strong.slice(0, 60);
  const maybeCode = lines.find((line) => /\b[A-Z0-9]{3,}[- ][A-Z0-9]{2,}\b/.test(line));
  return maybeCode ? maybeCode.slice(0, 60) : null;
}

function capitalize(value: string) {
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}
