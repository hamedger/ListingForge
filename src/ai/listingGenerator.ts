import type {
  ConditionTier,
  GeneratedListing,
  ItemProductProfile,
  ListingPlatform,
  ListingMode,
  PlatformListingCopy,
  VinDecodedVehicle,
} from '@/src/domain/types';
import type { PricePositioning } from '@/src/ai/pricing/types';

function money(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function heuristicVehiclePriceRange(year: number, condition: ConditionTier) {
  const age = Math.max(0, 2026 - year);
  let midpoint = 22000 - age * 900;
  midpoint = Math.max(4500, Math.min(65000, midpoint));

  const mult =
    condition === 'excellent' ? 1.06 : condition === 'good' ? 1.0 : condition === 'fair' ? 0.88 : 1.0;

  const center = midpoint * mult;
  const low = center * 0.88;
  const high = center * 1.12;
  return `${money(low)} – ${money(high)} (estimate)`;
}

function buildVehicleCopy(
  v: VinDecodedVehicle,
  condition: ConditionTier,
  photoCount: number,
  defectNotes?: string,
  marketPositioning?: PricePositioning | null,
) {
  const ymmt = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
  const title = ymmt || 'Vehicle for sale';

  const details = [
    v.bodyClass ? `Body: ${v.bodyClass}` : null,
    v.driveType ? `Drive: ${v.driveType}` : null,
    v.fuelTypePrimary ? `Fuel: ${v.fuelTypePrimary}` : null,
    v.fuelTypeSecondary ? `Secondary fuel: ${v.fuelTypeSecondary}` : null,
    v.transmissionStyle
      ? `Transmission: ${v.transmissionStyle}${v.transmissionSpeeds ? ` (${v.transmissionSpeeds}-speed)` : ''}`
      : v.transmissionSpeeds
        ? `Transmission: ${v.transmissionSpeeds}-speed`
        : null,
    v.doors ? `Doors: ${v.doors}` : null,
    v.seats ? `Seats: ${v.seats}` : null,
    v.seatRows ? `Seat rows: ${v.seatRows}` : null,
    v.engineCylinders ? `Engine: ${v.engineCylinders} cyl` : null,
    v.engineHP ? `Power: ${v.engineHP} hp` : null,
    v.engineKW ? `Power: ${v.engineKW} kW` : null,
    v.engineModel ? `Engine model: ${v.engineModel}` : null,
    v.engineConfiguration ? `Engine config: ${v.engineConfiguration}` : null,
    v.displacementL ? `Displacement: ${v.displacementL}L` : null,
    v.electrificationLevel ? `Electrification: ${v.electrificationLevel}` : null,
    v.batteryKWh ? `Battery: ${v.batteryKWh} kWh` : null,
    v.batteryV ? `Battery voltage: ${v.batteryV}V` : null,
    v.batteryA ? `Battery current: ${v.batteryA}A` : null,
    v.chargingLevel ? `Charging: ${v.chargingLevel}` : null,
    v.gvwr ? `GVWR: ${v.gvwr}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
  const featureBullets = buildVehicleFeatureBullets(v);

  const yearNum = Number(v.year);
  const priceRange = marketPositioning
    ? `${money(marketPositioning.band.fastSell)} – ${money(marketPositioning.band.premiumAsk)} (${marketPositioning.sources.join(', ')})`
    : Number.isFinite(yearNum)
      ? heuristicVehiclePriceRange(yearNum, condition)
      : 'Price: verify with local comps';

  const defectSummary = summarizeVehicleDefects(defectNotes ?? '');
  const conditionLine =
    condition === 'excellent'
      ? 'Overall condition presents as excellent for the age/mileage.'
      : condition === 'good'
        ? 'Overall condition presents as good — normal wear expected.'
        : 'Overall condition presents as fair — priced accordingly.';

  const description = [
    `Clean, marketplace-ready listing for a ${ymmt || 'vehicle'}.`,
    featureBullets.length ? `Key features:\n- ${featureBullets.join('\n- ')}` : null,
    details ? details : null,
    conditionLine,
    defectSummary,
    `Includes ${photoCount} guided photos (exterior, interior, and odometer).`,
    'Serious buyers only — schedule a showing and bring a mechanic if you want extra peace of mind.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const copyReady = `${title}\n\n${priceRange}\n\n${description}\n\nVIN: ${v.vin}`;
  const platformCopies = buildAutoPlatformCopies({
    vehicle: v,
    title,
    priceRange,
    description,
    condition,
    photoCount,
    defectSummary,
  });

  return { title, priceRange, description, copyReady, platformCopies };
}

function summarizeVehicleDefects(notes: string): string | null {
  const text = notes.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const hasScratch = lower.includes('scratch') || lower.includes('scuff');
  const hasDent = lower.includes('dent') || lower.includes('ding');
  const hasDamage = lower.includes('damage') || lower.includes('crack') || lower.includes('chip');

  const labels = [
    hasScratch ? 'scratch/scuff' : null,
    hasDent ? 'dent/ding' : null,
    hasDamage ? 'cosmetic damage' : null,
  ].filter(Boolean);

  if (labels.length === 0) return `Cosmetic notes from photos: ${text}.`;
  return `Photo-visible cosmetic notes (${labels.join(', ')}): ${text}.`;
}

function buildVehicleFeatureBullets(v: VinDecodedVehicle): string[] {
  const features: string[] = [];
  if (v.electrificationLevel) features.push(v.electrificationLevel);
  if (v.fuelTypePrimary?.toLowerCase().includes('electric')) {
    features.push('All-electric powertrain');
  } else if (v.fuelTypePrimary) {
    features.push(`${v.fuelTypePrimary} powertrain`);
  }
  if (v.fuelTypeSecondary) features.push(`Secondary fuel support: ${v.fuelTypeSecondary}`);
  if (v.driveType) features.push(`${v.driveType} drivetrain`);
  if (v.transmissionStyle) {
    features.push(
      `${v.transmissionStyle}${v.transmissionSpeeds ? ` (${v.transmissionSpeeds}-speed)` : ''} transmission`,
    );
  }
  if (v.bodyClass) features.push(v.bodyClass);
  if (v.doors) features.push(`${v.doors}-door configuration`);
  if (v.seats) features.push(`${v.seats} seats`);
  if (v.seatRows) features.push(`${v.seatRows} seat rows`);
  if (v.engineCylinders) features.push(`${v.engineCylinders}-cylinder engine`);
  if (v.engineHP) features.push(`${v.engineHP} hp`);
  if (v.engineKW) features.push(`${v.engineKW} kW output`);
  if (v.engineModel) features.push(`Engine model ${v.engineModel}`);
  if (v.engineConfiguration) features.push(`${v.engineConfiguration} engine configuration`);
  if (v.displacementL) features.push(`${v.displacementL}L displacement`);
  if (v.batteryKWh) features.push(`${v.batteryKWh} kWh battery`);
  if (v.chargingLevel) features.push(`${v.chargingLevel} charging support`);
  if (v.gvwr) features.push(`GVWR ${v.gvwr}`);
  return features.slice(0, 12);
}

function buildAutoPlatformCopies(args: {
  vehicle: VinDecodedVehicle;
  title: string;
  priceRange: string;
  description: string;
  condition: ConditionTier;
  photoCount: number;
  defectSummary: string | null;
}): Partial<Record<ListingPlatform, PlatformListingCopy>> {
  const ymmt = [args.vehicle.year, args.vehicle.make, args.vehicle.model, args.vehicle.trim]
    .filter(Boolean)
    .join(' ');
  const specs = [
    args.vehicle.bodyClass ? `Body: ${args.vehicle.bodyClass}` : null,
    args.vehicle.driveType ? `Drive: ${args.vehicle.driveType}` : null,
    args.vehicle.fuelTypePrimary ? `Fuel: ${args.vehicle.fuelTypePrimary}` : null,
    args.vehicle.transmissionStyle
      ? `Transmission: ${args.vehicle.transmissionStyle}${args.vehicle.transmissionSpeeds ? ` (${args.vehicle.transmissionSpeeds}-speed)` : ''}`
      : null,
    args.vehicle.doors ? `Doors: ${args.vehicle.doors}` : null,
    args.vehicle.seats ? `Seats: ${args.vehicle.seats}` : null,
    args.vehicle.engineHP ? `HP: ${args.vehicle.engineHP}` : null,
    args.vehicle.batteryKWh ? `Battery: ${args.vehicle.batteryKWh}kWh` : null,
  ]
    .filter(Boolean)
    .join(' | ');
  const cond =
    args.condition === 'excellent'
      ? 'Excellent condition.'
      : args.condition === 'fair'
        ? 'Fair condition, priced to sell.'
        : 'Good condition with normal wear.';
  const vinLine = `VIN: ${args.vehicle.vin}`;
  const photosLine = `Photos: ${args.photoCount} guided captures included.`;

  return {
    generic: {
      title: args.title,
      description: args.description,
      copyReady: `${args.title}\n\n${args.priceRange}\n\n${args.description}\n\n${vinLine}`,
    },
    facebook: {
      title: args.title.slice(0, 90),
      description: [ymmt ? `${ymmt} for sale.` : null, cond, args.defectSummary, specs || null, photosLine, vinLine]
        .filter(Boolean)
        .join('\n'),
      copyReady: `${args.title.slice(0, 90)}\n\n${args.priceRange}\n\n${[ymmt ? `${ymmt} for sale.` : null, cond, args.defectSummary, specs || null, photosLine, vinLine].filter(Boolean).join('\n')}`,
      notes: ['Best for short, direct copy.', 'User still selects exact Facebook category/subcategory.'],
    },
    autotrader: {
      title: args.title.slice(0, 80),
      description: [
        ymmt ? `Vehicle: ${ymmt}` : 'Vehicle listing',
        specs || null,
        `Condition: ${args.condition}`,
        args.defectSummary,
        photosLine,
        vinLine,
        'Well-maintained and ready for test drive.',
      ]
        .filter(Boolean)
        .join('\n'),
      copyReady: `${args.title.slice(0, 80)}\n\n${args.priceRange}\n\n${[
        ymmt ? `Vehicle: ${ymmt}` : 'Vehicle listing',
        specs || null,
        `Condition: ${args.condition}`,
        args.defectSummary,
        photosLine,
        vinLine,
        'Well-maintained and ready for test drive.',
      ]
        .filter(Boolean)
        .join('\n')}`,
      notes: ['AutoTrader may require additional structured fields during posting.'],
    },
    edmunds: {
      title: args.title.slice(0, 80),
      description: [
        ymmt ? `${ymmt}` : 'Vehicle',
        `Overview: ${cond}`,
        args.defectSummary,
        specs || null,
        vinLine,
        'Contact for full ownership, maintenance, and inspection details.',
      ]
        .filter(Boolean)
        .join('\n'),
      copyReady: `${args.title.slice(0, 80)}\n\n${args.priceRange}\n\n${[
        ymmt ? `${ymmt}` : 'Vehicle',
        `Overview: ${cond}`,
        args.defectSummary,
        specs || null,
        vinLine,
        'Contact for full ownership, maintenance, and inspection details.',
      ]
        .filter(Boolean)
        .join('\n')}`,
      notes: ['Use this as site-ready narrative copy.'],
    },
    carsforsale: {
      title: args.title.slice(0, 80),
      description: [
        ymmt ? `${ymmt} listed for sale.` : 'Vehicle listed for sale.',
        cond,
        args.defectSummary,
        specs || null,
        vinLine,
        'Clean presentation photos included.',
      ]
        .filter(Boolean)
        .join('\n'),
      copyReady: `${args.title.slice(0, 80)}\n\n${args.priceRange}\n\n${[
        ymmt ? `${ymmt} listed for sale.` : 'Vehicle listed for sale.',
        cond,
        args.defectSummary,
        specs || null,
        vinLine,
        'Clean presentation photos included.',
      ]
        .filter(Boolean)
        .join('\n')}`,
      notes: ['Seller should still verify options and trim selections on the platform form.'],
    },
  };
}

type ElectronicsAttributes = {
  category: 'phone' | 'laptop' | 'tablet' | 'console' | 'audio' | 'camera' | 'device';
  condition: 'excellent' | 'good' | 'fair';
  hasAccessories: boolean;
  hasStorageMention: boolean;
  titleHint: string | null;
};

function inferElectronicsAttributes(notes: string, serial: string): ElectronicsAttributes {
  const text = `${notes} ${serial}`.toLowerCase();
  const category: ElectronicsAttributes['category'] = text.includes('iphone') || text.includes('android')
    ? 'phone'
    : text.includes('macbook') || text.includes('laptop')
      ? 'laptop'
      : text.includes('ipad') || text.includes('tablet')
        ? 'tablet'
        : text.includes('playstation') || text.includes('xbox') || text.includes('console')
          ? 'console'
          : text.includes('camera')
            ? 'camera'
            : text.includes('speaker') || text.includes('headphone') || text.includes('earbud')
              ? 'audio'
              : 'device';

  const condition: ElectronicsAttributes['condition'] = text.includes('mint') || text.includes('like new')
    ? 'excellent'
    : text.includes('scratch') || text.includes('crack') || text.includes('wear')
      ? 'fair'
      : 'good';

  const hasAccessories =
    text.includes('box') || text.includes('charger') || text.includes('cable') || text.includes('case');
  const hasStorageMention = /\b(64|128|256|512|1tb|2tb)\b/i.test(text);
  const titleHint = notes.trim() ? notes.trim().split('\n')[0]!.slice(0, 72) : null;

  return { category, condition, hasAccessories, hasStorageMention, titleHint };
}

function electronicsPriceBand(attrs: ElectronicsAttributes): string {
  if (attrs.category === 'phone') return '$180 – $900';
  if (attrs.category === 'laptop') return '$250 – $1,500';
  if (attrs.category === 'tablet') return '$150 – $900';
  if (attrs.category === 'console') return '$170 – $650';
  if (attrs.category === 'camera') return '$220 – $1,400';
  return '$75 – $650';
}

function buildElectronicsCopyV2(args: {
  notes: string;
  photoCount: number;
  serial?: string | null;
  profile?: ItemProductProfile | null;
  visionHints?: { title?: string; description?: string } | null;
  marketPositioning?: PricePositioning | null;
}) {
  const attrs = inferElectronicsAttributes(args.notes, args.serial ?? '');
  const structured = args.profile && isElectronicsProfile(args.profile) ? args.profile : null;
  let category: ElectronicsAttributes['category'] = attrs.category;
  if (structured) {
    category = structured.category as ElectronicsAttributes['category'];
  }
  const condition = structured?.condition ?? attrs.condition;
  const hasAccessories = structured?.hasAccessories ?? attrs.hasAccessories;
  const storage = structured?.storage;
  const brandModel = [structured?.brand, structured?.model].filter(Boolean).join(' ').trim();
  const prettyCategory = category === 'device' ? 'electronics item' : category;
  const fallbackCategory = category === 'device' ? 'electronics item' : category;
  const title =
    args.visionHints?.title?.trim() ||
    brandModel ||
    attrs.titleHint ||
    `${fallbackCategory[0]!.toUpperCase()}${fallbackCategory.slice(1)} for sale`;
  const priceRange = args.marketPositioning
    ? `${money(args.marketPositioning.band.fastSell)} – ${money(args.marketPositioning.band.premiumAsk)} (${args.marketPositioning.sources.join(', ')})`
    : `${electronicsPriceBand({ ...attrs, category })} (AI estimate — refined by model/serial details)`;
  const conditionLine =
    condition === 'excellent'
      ? 'Condition appears excellent based on captured photos.'
      : condition === 'fair'
        ? 'Visible wear is present; priced accordingly.'
        : 'Condition appears good with normal signs of use.';
  const serialLine = args.serial?.trim() ? `Model/Serial provided: ${args.serial.trim()}` : null;
  const accessoriesLine = hasAccessories
    ? 'Accessories appear to be included (verify exact contents in photos).'
    : 'Accessories not clearly confirmed — list included items before publishing.';
  const storageLine = storage
    ? `Detected storage/capacity: ${storage}.`
    : attrs.hasStorageMention
    ? 'Storage/capacity was detected in seller notes.'
    : 'Storage/capacity not detected — add this for stronger buyer confidence.';
  const structuredLine = structured
    ? `Detected product profile: ${[structured.brand, structured.model, category]
        .filter(Boolean)
        .join(' • ')}.`
    : null;

  const visionBody = args.visionHints?.description?.trim();
  const description = visionBody
    ? [
        visionBody,
        structuredLine,
        serialLine,
        args.notes.trim().length > 0 ? `Seller notes: ${args.notes.trim()}` : null,
        `Photos included: ${args.photoCount}.`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : [
        `AI-generated listing draft for a ${prettyCategory}.`,
        conditionLine,
        structuredLine,
        accessoriesLine,
        storageLine,
        serialLine,
        args.notes.trim().length > 0 ? args.notes.trim() : 'Device sold as pictured; see photos for cosmetic details.',
        `Photos included: ${args.photoCount}.`,
        'Local pickup or shipping available; serious buyers only.',
      ]
        .filter(Boolean)
        .join('\n\n');

  const copyReady = `${title}\n\n${priceRange}\n\n${description}`;
  return {
    title,
    priceRange,
    description,
    copyReady,
    platformCopies: buildElectronicsPlatformCopies({ title, priceRange, description }),
  };
}

type GeneralAttributes = {
  category: 'furniture' | 'appliance' | 'decor' | 'tool' | 'household';
  condition: 'excellent' | 'good' | 'fair';
  titleHint: string | null;
};

function inferGeneralAttributes(notes: string): GeneralAttributes {
  const text = notes.toLowerCase();
  const category: GeneralAttributes['category'] = text.includes('sofa') ||
    text.includes('table') ||
    text.includes('chair') ||
    text.includes('dresser')
    ? 'furniture'
    : text.includes('washer') || text.includes('dryer') || text.includes('fridge')
      ? 'appliance'
      : text.includes('lamp') || text.includes('art') || text.includes('decor')
        ? 'decor'
        : text.includes('drill') || text.includes('tool')
          ? 'tool'
          : 'household';
  const condition: GeneralAttributes['condition'] = text.includes('new') || text.includes('mint')
    ? 'excellent'
    : text.includes('damage') || text.includes('stain') || text.includes('broken')
      ? 'fair'
      : 'good';
  const titleHint = notes.trim() ? notes.trim().split('\n')[0]!.slice(0, 72) : null;
  return { category, condition, titleHint };
}

function buildGeneralCopyV2(args: {
  notes: string;
  photoCount: number;
  profile?: ItemProductProfile | null;
  visionHints?: { title?: string; description?: string } | null;
  marketPositioning?: PricePositioning | null;
}) {
  const attrs = inferGeneralAttributes(args.notes);
  const structured = args.profile && isGeneralProfile(args.profile) ? args.profile : null;
  const category = structured?.category ?? attrs.category;
  const condition = structured?.condition ?? attrs.condition;
  const title =
    args.visionHints?.title?.trim() ?? attrs.titleHint ?? `${category[0]!.toUpperCase()}${category.slice(1)} item for sale`;
  const priceRange = args.marketPositioning
    ? `${money(args.marketPositioning.band.fastSell)} – ${money(args.marketPositioning.band.premiumAsk)} (${args.marketPositioning.sources.join(', ')})`
    : '$25 – $250 (AI estimate — check local sold comps)';
  const conditionLine =
    condition === 'excellent'
      ? 'Item appears in excellent condition.'
      : condition === 'fair'
        ? 'Visible wear/defects are present and reflected in price.'
        : 'Item appears in good condition with normal use.';
  const structuredLine =
    structured && structured.sourceSignals?.length
      ? `Detected product profile from ${structured.sourceSignals.join(', ')}.`
      : null;
  const visionBody = args.visionHints?.description?.trim();
  const description = visionBody
    ? [
        visionBody,
        structuredLine,
        args.notes.trim().length > 0 ? `Seller notes: ${args.notes.trim()}` : null,
        `Photos included: ${args.photoCount}.`,
      ]
        .filter(Boolean)
        .join('\n\n')
    : [
        `AI-generated listing draft for a ${category} item.`,
        conditionLine,
        structuredLine,
        args.notes.trim().length > 0 ? args.notes.trim() : 'Item sold as pictured.',
        `Photos included: ${args.photoCount}.`,
        'Pickup preferred; delivery may be available nearby.',
      ].join('\n\n');
  const copyReady = `${title}\n\n${priceRange}\n\n${description}`;
  return {
    title,
    priceRange,
    description,
    copyReady,
    platformCopies: buildGeneralPlatformCopies({ title, priceRange, description }),
  };
}

function buildElectronicsPlatformCopies(args: {
  title: string;
  priceRange: string;
  description: string;
}): Partial<Record<ListingPlatform, PlatformListingCopy>> {
  return {
    generic: {
      title: args.title,
      description: args.description,
      copyReady: `${args.title}\n\n${args.priceRange}\n\n${args.description}`,
    },
    facebook: {
      title: args.title.slice(0, 90),
      description: args.description,
      copyReady: `${args.title.slice(0, 90)}\n\n${args.priceRange}\n\n${args.description}`,
      notes: ['Use short title and key specs first.'],
    },
    ebay: {
      title: args.title.slice(0, 80),
      description: args.description,
      copyReady: `${args.title.slice(0, 80)}\n\n${args.priceRange}\n\n${args.description}`,
      notes: ['Include exact model/serial and accessory list in item specifics.'],
    },
    offerup: {
      title: args.title.slice(0, 70),
      description: args.description,
      copyReady: `${args.title.slice(0, 70)}\n\n${args.priceRange}\n\n${args.description}`,
    },
    craigslist: {
      title: args.title.slice(0, 70),
      description: args.description,
      copyReady: `${args.title.slice(0, 70)}\n\n${args.priceRange}\n\n${args.description}`,
    },
  };
}

function buildGeneralPlatformCopies(args: {
  title: string;
  priceRange: string;
  description: string;
}): Partial<Record<ListingPlatform, PlatformListingCopy>> {
  return {
    generic: {
      title: args.title,
      description: args.description,
      copyReady: `${args.title}\n\n${args.priceRange}\n\n${args.description}`,
    },
    facebook: {
      title: args.title.slice(0, 90),
      description: args.description,
      copyReady: `${args.title.slice(0, 90)}\n\n${args.priceRange}\n\n${args.description}`,
    },
    offerup: {
      title: args.title.slice(0, 70),
      description: args.description,
      copyReady: `${args.title.slice(0, 70)}\n\n${args.priceRange}\n\n${args.description}`,
    },
    craigslist: {
      title: args.title.slice(0, 70),
      description: args.description,
      copyReady: `${args.title.slice(0, 70)}\n\n${args.priceRange}\n\n${args.description}`,
      notes: ['Consider adding neighborhood/pickup details before posting.'],
    },
  };
}

export function generateListing(params: {
  mode: ListingMode;
  vin?: VinDecodedVehicle | null;
  condition?: ConditionTier | null;
  vehicleDefectNotes?: string;
  vehiclePhotoCount?: number;
  marketPositioning?: PricePositioning | null;
  itemNotes?: string;
  itemSerial?: string;
  itemPhotoCount?: number;
  itemProfile?: ItemProductProfile | null;
  itemVisionHints?: { title?: string; description?: string } | null;
  itemMarketPositioning?: PricePositioning | null;
}): GeneratedListing {
  if (params.mode === 'auto') {
    if (!params.vin) {
      return {
        title: 'Vehicle listing',
        priceRange: 'Add VIN to estimate pricing',
        description: 'Decode a VIN to auto-fill year/make/model and generate a stronger listing.',
        copyReady: 'Vehicle listing\n\nAdd VIN to estimate pricing',
      };
    }
    const built = buildVehicleCopy(
      params.vin,
      params.condition ?? 'good',
      params.vehiclePhotoCount ?? 0,
      params.vehicleDefectNotes ?? '',
      params.marketPositioning ?? null,
    );
    return { ...built };
  }

  if (params.mode === 'electronics') {
    return buildElectronicsCopyV2({
      notes: params.itemNotes ?? '',
      photoCount: params.itemPhotoCount ?? 0,
      serial: params.itemSerial ?? '',
      profile: params.itemProfile ?? null,
      visionHints: params.itemVisionHints ?? null,
      marketPositioning: params.itemMarketPositioning ?? null,
    });
  }

  return buildGeneralCopyV2({
    notes: params.itemNotes ?? '',
    photoCount: params.itemPhotoCount ?? 0,
    profile: params.itemProfile ?? null,
    visionHints: params.itemVisionHints ?? null,
    marketPositioning: params.itemMarketPositioning ?? null,
  });
}

function isElectronicsProfile(profile: ItemProductProfile) {
  return ['phone', 'laptop', 'tablet', 'console', 'audio', 'camera', 'device'].includes(profile.category);
}

function isGeneralProfile(profile: ItemProductProfile) {
  return ['furniture', 'appliance', 'decor', 'tool', 'household'].includes(profile.category);
}
