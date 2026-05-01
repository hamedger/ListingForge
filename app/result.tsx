import * as Clipboard from 'expo-clipboard';
import { cacheDirectory, EncodingType, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { openMarketplaceListingStarter } from '@/src/api/marketplaceLinks';
import {
  analyzeListingViaBackend,
  mapAnalyzeProfileToItemProfile,
} from '@/src/api/listingAnalyze';
import { enhancePhotoViaBackend, type BackgroundStyle } from '@/src/api/photoEnhance';
import { inferItemProfile } from '@/src/ai/itemProfiler';
import { generateListing } from '@/src/ai/listingGenerator';
import { maybeEnhanceListingWithLlm } from '@/src/ai/listingLlm';
import { getAutoPricePositioning } from '@/src/ai/pricing/engine';
import type { PricePositioning } from '@/src/ai/pricing/types';
import type { ItemProductProfile, ListingPlatform } from '@/src/domain/types';
import { useAuthStore } from '@/src/state/authStore';
import { useSessionStore } from '@/src/state/sessionStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

type PlatformCopyLimit = {
  titleMax?: number;
  descriptionMax?: number;
};

const PLATFORM_COPY_LIMITS: Record<ListingPlatform, PlatformCopyLimit> = {
  generic: {},
  facebook: { titleMax: 90, descriptionMax: 5000 },
  autotrader: { titleMax: 80, descriptionMax: 4000 },
  edmunds: { titleMax: 80, descriptionMax: 4000 },
  carsforsale: { titleMax: 80, descriptionMax: 4000 },
  ebay: { titleMax: 80, descriptionMax: 5000 },
  offerup: { titleMax: 70, descriptionMax: 1500 },
  craigslist: { titleMax: 70, descriptionMax: 7500 },
};

export default function ResultScreen() {
  const router = useRouter();
  const mode = useSessionStore((s) => s.mode);
  const vin = useSessionStore((s) => s.vin);
  const condition = useSessionStore((s) => s.condition);
  const vehicleDefectNotes = useSessionStore((s) => s.vehicleDefectNotes);
  const vehiclePhotos = useSessionStore((s) => s.vehiclePhotos);
  const itemPhotos = useSessionStore((s) => s.itemPhotos);
  const itemPhotoPairs = useSessionStore((s) => s.itemPhotoPairs);
  const itemNotes = useSessionStore((s) => s.itemNotes);
  const itemSerial = useSessionStore((s) => s.itemSerial);
  const itemProfile = useSessionStore((s) => s.itemProfile);
  const listing = useSessionStore((s) => s.listing);
  const setListing = useSessionStore((s) => s.setListing);
  const setItemProfile = useSessionStore((s) => s.setItemProfile);
  const setVehiclePhotos = useSessionStore((s) => s.setVehiclePhotos);
  const setItemPhotoPairs = useSessionStore((s) => s.setItemPhotoPairs);
  const setItemPhotos = useSessionStore((s) => s.setItemPhotos);
  const reset = useSessionStore((s) => s.reset);
  const canUseMarketPricing = useAuthStore((s) => s.entitlements.canUseMarketPricing);
  const userId = useAuthStore((s) => s.userId);

  const [toast, setToast] = useState<string | null>(null);
  const [marketPricing, setMarketPricing] = useState<PricePositioning | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [itemMarketPricing, setItemMarketPricing] = useState<PricePositioning | null>(null);
  const [itemVisionHints, setItemVisionHints] = useState<{ title: string; description: string } | null>(null);
  const [visionProfileOverride, setVisionProfileOverride] = useState<ItemProductProfile | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const listingAnalyzeKeyRef = useRef<string | null>(null);
  const [pricePosition, setPricePosition] = useState<'fastSell' | 'fairMarket' | 'premiumAsk'>(
    'fairMarket',
  );
  const [priceSlider, setPriceSlider] = useState(0.5);
  const [priceSliderWidth, setPriceSliderWidth] = useState(0);
  const [showPackagePrompt, setShowPackagePrompt] = useState(true);
  const [compareReveal, setCompareReveal] = useState(0.5);
  const [compareWidth, setCompareWidth] = useState(0);
  const [editorBusy, setEditorBusy] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<ListingPlatform>('generic');
  const [editor, setEditor] = useState({
    exposure: 0,
    contrast: 0,
    saturation: 0,
    sharpen: 0,
    denoise: 0,
  });
  const hasBackgroundCleanedAuto = useMemo(
    () => vehiclePhotos.some((p) => p.backgroundRemoved),
    [vehiclePhotos],
  );
  const platformOptions = useMemo(() => {
    if (mode === 'auto') return ['generic', 'facebook', 'autotrader', 'edmunds', 'carsforsale'] as ListingPlatform[];
    if (mode === 'electronics') return ['generic', 'facebook', 'ebay', 'offerup', 'craigslist'] as ListingPlatform[];
    return ['generic', 'facebook', 'offerup', 'craigslist'] as ListingPlatform[];
  }, [mode]);

  const itemPhotoFingerprint = useMemo(() => {
    if (itemPhotoPairs.length > 0) {
      return itemPhotoPairs.map((p) => `${p.originalUri}|${p.enhancedUri}`).join('||');
    }
    return itemPhotos.join('||');
  }, [itemPhotoPairs, itemPhotos]);

  const mergedItemProfile = useMemo((): ItemProductProfile | null => {
    return visionProfileOverride ?? itemProfile;
  }, [visionProfileOverride, itemProfile]);

  const pricingForSlider = useMemo(() => {
    if (mode === 'auto') return marketPricing;
    if (mode === 'electronics' || mode === 'general') {
      return canUseMarketPricing ? itemMarketPricing : null;
    }
    return null;
  }, [canUseMarketPricing, itemMarketPricing, marketPricing, mode]);

  useEffect(() => {
    let active = true;
    if (mode !== 'auto' || !vin || !canUseMarketPricing) {
      setMarketPricing(null);
      return;
    }

    setPricingLoading(true);
    getAutoPricePositioning({ vinVehicle: vin, condition: condition ?? 'good' })
      .then((positioning) => {
        if (active) setMarketPricing(positioning);
      })
      .finally(() => {
        if (active) setPricingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canUseMarketPricing, condition, mode, vin]);

  useEffect(() => {
    if (mode !== 'electronics' && mode !== 'general') {
      setItemMarketPricing(null);
      setItemVisionHints(null);
      setVisionProfileOverride(null);
      listingAnalyzeKeyRef.current = null;
      return;
    }
    if (!itemPhotoFingerprint) {
      return;
    }
    const key = `${mode}:${itemPhotoFingerprint}`;
    if (listingAnalyzeKeyRef.current === key) {
      return;
    }
    listingAnalyzeKeyRef.current = key;

    let cancelled = false;
    setVisionLoading(true);

    const uris =
      itemPhotoPairs.length > 0 ? itemPhotoPairs.map((p) => p.enhancedUri) : itemPhotos;
    const slice = uris.slice(0, 4).filter(Boolean);

    void (async () => {
      try {
        const imagesBase64 = await Promise.all(
          slice.map((uri) => readAsStringAsync(uri, { encoding: EncodingType.Base64 })),
        );
        const result = await analyzeListingViaBackend({
          mode,
          imagesBase64,
          notes: itemNotes,
          serial: itemSerial,
          includePricing: true,
        });
        if (cancelled) return;
        setVisionProfileOverride(mapAnalyzeProfileToItemProfile(result.profile, mode));
        setItemVisionHints({ title: result.title, description: result.description });
        setItemMarketPricing(result.pricing);
      } catch {
        if (!cancelled) {
          listingAnalyzeKeyRef.current = null;
          setVisionProfileOverride(null);
          setItemVisionHints(null);
          setItemMarketPricing(null);
        }
      } finally {
        if (!cancelled) setVisionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemNotes, itemPhotoFingerprint, itemPhotoPairs, itemPhotos, itemSerial, mode]);

  useEffect(() => {
    if (!platformOptions.includes(selectedPlatform)) {
      setSelectedPlatform('generic');
    }
  }, [platformOptions, selectedPlatform]);

  useEffect(() => {
    let active = true;
    if (mode !== 'electronics' && mode !== 'general') return;
    void inferItemProfile({
      mode,
      notes: itemNotes,
      serial: itemSerial,
      photoUris: itemPhotos,
    }).then((profile) => {
      if (active) setItemProfile(profile);
    });
    return () => {
      active = false;
    };
  }, [itemNotes, itemPhotos, itemSerial, mode, setItemProfile]);

  useEffect(() => {
    if (!mode) {
      router.replace('/');
      return;
    }
    let active = true;
    const generated = generateListing({
      mode,
      vin,
      condition,
      vehicleDefectNotes,
      vehiclePhotoCount: vehiclePhotos.length,
      marketPositioning: marketPricing,
      itemNotes,
      itemSerial,
      itemPhotoCount: itemPhotos.length,
      itemProfile: mergedItemProfile ?? itemProfile,
      itemVisionHints,
      itemMarketPositioning: itemMarketPricing,
    });
    setListing(generated);
    void maybeEnhanceListingWithLlm({
      baseListing: generated,
      mode,
      platform: selectedPlatform,
    }).then((llmListing) => {
      if (active) setListing(llmListing);
    });
    return () => {
      active = false;
    };
  }, [
    condition,
    vehicleDefectNotes,
    itemNotes,
    itemSerial,
    itemMarketPricing,
    itemProfile,
    itemPhotos.length,
    itemVisionHints,
    marketPricing,
    mergedItemProfile,
    mode,
    router,
    setListing,
    selectedPlatform,
    setItemProfile,
    vehiclePhotos.length,
    vin,
  ]);

  useEffect(() => {
    if (listing) {
      setShowPackagePrompt(true);
    }
  }, [listing?.copyReady]);

  const comparisonPairs = useMemo(() => {
    const vehiclePairs = vehiclePhotos
      .filter((p) => p.originalUri && (p.enhancedUri ?? p.originalUri))
      .map((p, index) => ({
        id: `vehicle-${p.stepId}-${index}`,
        before: p.originalUri,
        after: p.enhancedUri ?? p.originalUri,
        changed: [
          p.backgroundRemoved ? 'Background removed' : null,
          p.backgroundStyleApplied && p.backgroundStyleApplied !== 'original'
            ? `Style: ${p.backgroundStyleApplied.replace('_', ' ')}`
            : null,
          p.enhancementProvider ? `Provider: ${p.enhancementProvider}` : null,
        ].filter(Boolean) as string[],
      }));
    const itemPairs = itemPhotoPairs.map((p, index) => ({
      id: `item-${index}`,
      before: p.originalUri,
      after: p.enhancedUri,
      changed: ['Enhanced'],
    }));
    return [...vehiclePairs, ...itemPairs];
  }, [itemPhotoPairs, vehiclePhotos]);
  const platformLabels: Record<ListingPlatform, string> = {
    generic: 'Generic',
    facebook: 'Facebook',
    autotrader: 'AutoTrader',
    edmunds: 'Edmunds',
    carsforsale: 'Carsforsale',
    ebay: 'eBay',
    offerup: 'OfferUp',
    craigslist: 'Craigslist',
  };
  const activePlatformCopy =
    listing?.platformCopies?.[selectedPlatform] ?? listing?.platformCopies?.generic ?? null;

  const previewPair = comparisonPairs[0] ?? null;
  const revealPx = compareWidth * compareReveal;
  const selectedPriceValue = useMemo(() => {
    if (!pricingForSlider) return null;
    const min = pricingForSlider.band.fastSell;
    const max = pricingForSlider.band.premiumAsk;
    if (max <= min) return pricingForSlider.band.fairMarket;
    return min + (max - min) * priceSlider;
  }, [pricingForSlider, priceSlider]);
  const providerMidMarker = useMemo(() => {
    const q = pricingForSlider?.quotes.find((x) => x.source === 'kbb' || x.source === 'ebay');
    return q?.mid ?? null;
  }, [pricingForSlider]);
  const providerMarkerRatio = useMemo(() => {
    if (!pricingForSlider || providerMidMarker == null) return null;
    const min = pricingForSlider.band.fastSell;
    const max = pricingForSlider.band.premiumAsk;
    if (max <= min) return 0.5;
    return Math.max(0, Math.min(1, (providerMidMarker - min) / (max - min)));
  }, [providerMidMarker, pricingForSlider]);
  const providerMarkerLabel = useMemo(() => {
    const src = pricingForSlider?.quotes.find((x) => x.source === 'kbb' || x.source === 'ebay')?.source;
    if (src === 'kbb') return 'KBB';
    if (src === 'ebay') return 'eBay';
    return 'Ref';
  }, [pricingForSlider]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (!compareWidth) return;
          const x = Math.max(0, Math.min(compareWidth, evt.nativeEvent.locationX));
          setCompareReveal(x / compareWidth);
        },
        onPanResponderMove: (evt) => {
          if (!compareWidth) return;
          const x = Math.max(0, Math.min(compareWidth, evt.nativeEvent.locationX));
          setCompareReveal(x / compareWidth);
        },
      }),
    [compareWidth],
  );
  const priceSliderResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (!priceSliderWidth) return;
          const x = Math.max(0, Math.min(priceSliderWidth, evt.nativeEvent.locationX));
          setPriceSlider(x / priceSliderWidth);
        },
        onPanResponderMove: (evt) => {
          if (!priceSliderWidth) return;
          const x = Math.max(0, Math.min(priceSliderWidth, evt.nativeEvent.locationX));
          setPriceSlider(x / priceSliderWidth);
        },
      }),
    [priceSliderWidth],
  );

  useEffect(() => {
    if (priceSlider < 0.25) setPricePosition('fastSell');
    else if (priceSlider > 0.75) setPricePosition('premiumAsk');
    else setPricePosition('fairMarket');
  }, [priceSlider]);

  const copyAll = async () => {
    if (!listing) return;
    const platformCopy = activePlatformCopy;
    const fitted = fitPlatformCopy({
      platform: selectedPlatform,
      title: platformCopy?.title ?? listing.title,
      description: platformCopy?.description ?? listing.description,
      priceRange: listing.priceRange,
    });
    const selectedPriceLine = pricingForSlider
      ? `Recommended list price (${positionLabel(pricePosition)}): ${formatMoney(
          selectedPriceValue ?? pricingForSlider.band[pricePosition],
        )}`
      : null;
    const baseCopy = `${fitted.title}\n\n${listing.priceRange}\n\n${fitted.description}`;
    const body = selectedPriceLine ? `${selectedPriceLine}\n\n${baseCopy}` : baseCopy;
    await Clipboard.setStringAsync(body);
    setToast(
      `Copied ${platformLabels[selectedPlatform]} listing to clipboard`,
    );
    setTimeout(() => setToast(null), 1600);
  };
  const copyDescriptionOnly = async () => {
    if (!listing) return;
    const fitted = fitPlatformCopy({
      platform: selectedPlatform,
      title: activePlatformCopy?.title ?? listing.title,
      description: activePlatformCopy?.description ?? listing.description,
      priceRange: listing.priceRange,
    });
    const body = fitted.description;
    await Clipboard.setStringAsync(body);
    setToast(
      `Copied ${platformLabels[selectedPlatform]} description`,
    );
    setTimeout(() => setToast(null), 1600);
  };

  const shareHeroPhoto = async () => {
    const uri = previewPair?.after;
    if (!uri) return;
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      setToast('Sharing not available on this device');
      setTimeout(() => setToast(null), 1600);
      return;
    }
    await Sharing.shareAsync(uri, { dialogTitle: 'Listing photo' });
  };

  const exportListingPackage = async () => {
    if (!listing || !cacheDirectory) return;
    if (!userId) {
      setToast('Sign in to download package');
      setTimeout(() => setToast(null), 1700);
      return;
    }
    const selectedPriceLine = pricingForSlider
      ? `Recommended list price (${positionLabel(pricePosition)}): ${formatMoney(
          selectedPriceValue ?? pricingForSlider.band[pricePosition],
        )}`
      : null;
    const txt = [
      listing.title,
      selectedPriceLine ?? listing.priceRange,
      '',
      listing.description,
      '',
      `Generated: ${new Date().toISOString()}`,
    ].join('\n');

    const stamp = Date.now();
    const base = `${cacheDirectory}listforge_export_${stamp}`;
    const txtPath = `${base}.txt`;
    const jsonPath = `${base}.json`;

    await writeAsStringAsync(txtPath, txt);
    await writeAsStringAsync(
      jsonPath,
      JSON.stringify(
        {
          listing,
          selectedPricePosition: pricingForSlider ? pricePosition : null,
          selectedPrice: pricingForSlider ? pricingForSlider.band[pricePosition] : null,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    const zip = new JSZip();
    zip.file('listing.txt', txt);
    zip.file(
      'listing.json',
      JSON.stringify(
        {
          listing,
          selectedPricePosition: pricingForSlider ? pricePosition : null,
          selectedPrice: pricingForSlider ? pricingForSlider.band[pricePosition] : null,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    const vehicleUris = vehiclePhotos
      .map((p) => p.enhancedUri ?? p.originalUri)
      .filter(Boolean) as string[];
    const itemUris = itemPhotos.filter(Boolean);
    const allUris = [...vehicleUris, ...itemUris];

    for (let i = 0; i < allUris.length; i += 1) {
      const uri = allUris[i]!;
      try {
        const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
        zip.file(`images/photo_${String(i + 1).padStart(2, '0')}.jpg`, b64, { base64: true });
      } catch {
        // Skip unreadable image files rather than failing the whole package.
      }
    }

    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    const zipPath = `${cacheDirectory}listforge_package_${stamp}.zip`;
    await writeAsStringAsync(zipPath, zipBase64, { encoding: EncodingType.Base64 });

    await Sharing.shareAsync(zipPath, { dialogTitle: 'Listing package (ZIP)' });
    setToast('ZIP package exported');
    setTimeout(() => setToast(null), 1700);
  };

  const saveImagesToLibrary = async () => {
    if (!userId) {
      setToast('Sign in to download images');
      setTimeout(() => setToast(null), 1700);
      return;
    }

    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) {
      setToast('Photo library permission required');
      setTimeout(() => setToast(null), 1700);
      return;
    }

    const vehicleUris = vehiclePhotos
      .map((p) => p.enhancedUri ?? p.originalUri)
      .filter(Boolean) as string[];
    const itemUris = itemPhotos.filter(Boolean);
    const allUris = [...vehicleUris, ...itemUris];
    if (allUris.length === 0) {
      setToast('No images to save');
      setTimeout(() => setToast(null), 1700);
      return;
    }

    for (const uri of allUris) {
      await MediaLibrary.saveToLibraryAsync(uri);
    }
    setToast(`Saved ${allUris.length} image(s) to library`);
    setTimeout(() => setToast(null), 1700);
  };

  const shareText = async () => {
    if (!listing) return;
    const selectedPriceLine = pricingForSlider
      ? `Recommended list price (${positionLabel(pricePosition)}): ${formatMoney(
          selectedPriceValue ?? pricingForSlider.band[pricePosition],
        )}`
      : null;
    const message = selectedPriceLine ? `${selectedPriceLine}\n\n${listing.copyReady}` : listing.copyReady;
    try {
      await Share.share({ title: listing.title, message });
    } catch {
      await Clipboard.setStringAsync(message);
      setToast('Copied listing (share unavailable)');
      setTimeout(() => setToast(null), 1600);
    }
  };

  const bumpEditor = (key: keyof typeof editor, delta: number) => {
    setEditor((prev) => ({
      ...prev,
      [key]: Math.max(-100, Math.min(100, prev[key] + delta)),
    }));
  };

  const defaultBackgroundByMode = (currentMode: typeof mode): BackgroundStyle => {
    if (currentMode === 'auto') return 'auto_best';
    if (currentMode === 'electronics') return 'clean_white';
    if (currentMode === 'general') return 'neutral_lifestyle';
    return 'original';
  };

  const applyEditsToAll = async () => {
    if (!mode || !cacheDirectory) return;
    const hasAnything = vehiclePhotos.length > 0 || itemPhotoPairs.length > 0;
    if (!hasAnything) {
      setToast('No photos available to edit');
      setTimeout(() => setToast(null), 1600);
      return;
    }

    setEditorBusy(true);
    try {
      const adjustments = {
        exposure: editor.exposure / 100,
        contrast: editor.contrast / 100,
        saturation: editor.saturation / 100,
        sharpen: editor.sharpen / 100,
        denoise: editor.denoise / 100,
      };

      const nextVehicle = [...vehiclePhotos];
      for (let i = 0; i < nextVehicle.length; i += 1) {
        const photo = nextVehicle[i];
        if (!photo?.originalUri) continue;
        const imageBase64 = await readAsStringAsync(photo.originalUri, { encoding: EncodingType.Base64 });
        const result = await enhancePhotoViaBackend({
          imageBase64,
          mode,
          stepId: photo.stepId,
          backgroundStyle: (photo.backgroundStyleApplied as BackgroundStyle | undefined) ?? defaultBackgroundByMode(mode),
          enhanceLevel: 'wow',
          adjustments,
        });
        const uri = `${cacheDirectory}lf_edit_vehicle_${photo.stepId}_${Date.now()}_${i}.jpg`;
        await writeAsStringAsync(uri, result.optimizedImageBase64, { encoding: EncodingType.Base64 });
        nextVehicle[i] = {
          ...photo,
          enhancedUri: uri,
          backgroundRemoved: result.backgroundRemoved,
          backgroundStyleApplied: result.backgroundStyleApplied,
          enhancementProvider: result.provider,
        };
      }

      const nextItemPairs = [...itemPhotoPairs];
      for (let i = 0; i < nextItemPairs.length; i += 1) {
        const pair = nextItemPairs[i];
        const sourceUri = pair?.originalUri ?? pair?.enhancedUri;
        if (!sourceUri) continue;
        const imageBase64 = await readAsStringAsync(sourceUri, { encoding: EncodingType.Base64 });
        const result = await enhancePhotoViaBackend({
          imageBase64,
          mode,
          backgroundStyle: defaultBackgroundByMode(mode),
          enhanceLevel: 'wow',
          adjustments,
        });
        const uri = `${cacheDirectory}lf_edit_item_${Date.now()}_${i}.jpg`;
        await writeAsStringAsync(uri, result.optimizedImageBase64, { encoding: EncodingType.Base64 });
        nextItemPairs[i] = {
          originalUri: pair.originalUri,
          enhancedUri: uri,
        };
      }

      setVehiclePhotos(nextVehicle);
      setItemPhotoPairs(nextItemPairs);
      setItemPhotos(nextItemPairs.map((p) => p.enhancedUri));
      setToast('Applied edits to all photos');
      setTimeout(() => setToast(null), 1700);
    } catch {
      setToast('Failed to apply edits. Please retry.');
      setTimeout(() => setToast(null), 1900);
    } finally {
      setEditorBusy(false);
    }
  };

  if (!listing) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.muted}>Generating…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Marketplace-ready listing</Text>
        {toast ? <Text style={styles.toast}>{toast}</Text> : null}
        {pricingLoading || visionLoading ? (
          <Text style={styles.muted}>{visionLoading ? 'Analyzing photos with vision AI…' : 'Refreshing market comps…'}</Text>
        ) : null}
        {userId && showPackagePrompt ? (
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>All steps complete</Text>
            <Text style={styles.promptBody}>Do you want to download the listing package now?</Text>
            <View style={styles.promptActions}>
              <PrimaryButton
                label="Yes, download"
                onPress={async () => {
                  await exportListingPackage();
                  setShowPackagePrompt(false);
                }}
              />
              <PrimaryButton
                label="No, maybe later"
                variant="ghost"
                onPress={() => setShowPackagePrompt(false)}
              />
            </View>
          </View>
        ) : null}
        {!canUseMarketPricing &&
        (mode === 'auto' || mode === 'electronics' || mode === 'general') ? (
          <View style={styles.upgradeBanner}>
            <Text style={styles.upgradeText}>
              {mode === 'auto'
                ? 'Sign in and start trial to unlock market-backed pricing.'
                : 'Sign in and start trial to unlock interactive price positioning for your listing.'}
            </Text>
            <PrimaryButton label="Sign in" variant="ghost" onPress={() => router.push('/sign-in')} />
          </View>
        ) : null}

        {comparisonPairs.length > 0 ? (
          <View style={styles.compareSection}>
            <Text style={styles.cardLabel}>
              Before vs Optimized{hasBackgroundCleanedAuto ? ' • AI Background Cleaned' : ''}
            </Text>
            {previewPair ? (
              <View
                style={styles.sliderWrap}
                onLayout={(evt) => setCompareWidth(evt.nativeEvent.layout.width)}
                {...panResponder.panHandlers}>
                <Image source={{ uri: previewPair.before }} style={styles.sliderImage} />
                <View style={[styles.sliderAfterMask, { width: revealPx }]}>
                  <Image source={{ uri: previewPair.after }} style={styles.sliderImageAbsolute} />
                </View>
                <View style={[styles.sliderHandle, { left: Math.max(12, revealPx) - 12 }]}>
                  <Text style={styles.sliderHandleText}>||</Text>
                </View>
                <View style={styles.sliderLegend}>
                  <Text style={styles.sliderLegendText}>Before</Text>
                  <Text style={styles.sliderLegendText}>After</Text>
                </View>
              </View>
            ) : null}
            {comparisonPairs.slice(0, 4).map((pair) => (
              <View key={pair.id} style={styles.compare}>
                <View style={styles.compareCol}>
                  <Text style={styles.compareLabel}>Before</Text>
                  <Image source={{ uri: pair.before }} style={styles.compareImg} />
                </View>
                <View style={styles.compareCol}>
                  <Text style={styles.compareLabel}>Optimized</Text>
                  <Image source={{ uri: pair.after }} style={styles.compareImg} />
                </View>
                {pair.changed.length > 0 ? (
                  <View style={styles.badgeRow}>
                    {pair.changed.map((tag) => (
                      <Text key={`${pair.id}-${tag}`} style={styles.changeBadge}>
                        {tag}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Manual editor (all photos)</Text>
          <Text style={styles.cardBody}>
            Tune one look and apply to all listing photos for consistent output.
          </Text>
          {([
            ['exposure', 'Exposure'],
            ['contrast', 'Contrast'],
            ['saturation', 'Saturation'],
            ['sharpen', 'Sharpen'],
            ['denoise', 'Denoise'],
          ] as const).map(([key, label]) => (
            <View key={key} style={styles.editorRow}>
              <Text style={styles.editorLabel}>{label}</Text>
              <View style={styles.editorControls}>
                <Pressable style={styles.editorBtn} onPress={() => bumpEditor(key, -10)}>
                  <Text style={styles.editorBtnText}>-</Text>
                </Pressable>
                <Text style={styles.editorValue}>{editor[key]}</Text>
                <Pressable style={styles.editorBtn} onPress={() => bumpEditor(key, 10)}>
                  <Text style={styles.editorBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
          <PrimaryButton
            label={editorBusy ? 'Applying edits…' : 'Apply to all photos'}
            loading={editorBusy}
            onPress={applyEditsToAll}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Title</Text>
          <Text style={styles.cardValue}>{activePlatformCopy?.title ?? listing.title}</Text>
          <Text style={[styles.cardLabel, styles.spaced]}>Price range</Text>
          <Text style={styles.cardValue}>{listing.priceRange}</Text>
          <Text style={[styles.cardLabel, styles.spaced]}>Description</Text>
          <Text style={styles.cardBody}>{activePlatformCopy?.description ?? listing.description}</Text>
          <Text style={[styles.cardLabel, styles.spaced]}>Copy for platform</Text>
          <View style={styles.platformSegmented}>
            {platformOptions.map((platform) => (
              <Pressable
                key={platform}
                onPress={() => setSelectedPlatform(platform)}
                style={[
                  styles.segmentBtn,
                  selectedPlatform === platform && styles.segmentBtnActive,
                ]}>
                <Text
                  style={[
                    styles.segmentText,
                    selectedPlatform === platform && styles.segmentTextActive,
                  ]}>
                  {platformLabels[platform]}
                </Text>
              </Pressable>
            ))}
          </View>
          {activePlatformCopy?.notes?.length ? (
            <Text style={styles.cardBody}>{activePlatformCopy.notes.join('\n')}</Text>
          ) : null}
        </View>
        {pricingForSlider ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Price positioning</Text>
            <View style={styles.segmented}>
              {([
                ['fastSell', 'Fast sell'],
                ['fairMarket', 'Fair market'],
                ['premiumAsk', 'Premium ask'],
              ] as const).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    setPricePosition(key);
                    setPriceSlider(key === 'fastSell' ? 0 : key === 'fairMarket' ? 0.5 : 1);
                  }}
                  style={[
                    styles.segmentBtn,
                    pricePosition === key && styles.segmentBtnActive,
                  ]}>
                  <Text
                    style={[
                      styles.segmentText,
                      pricePosition === key && styles.segmentTextActive,
                    ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.cardLabel}>Slide to fine-tune your target price</Text>
            <View
              style={styles.priceSliderTrack}
              onLayout={(evt) => setPriceSliderWidth(evt.nativeEvent.layout.width)}
              {...priceSliderResponder.panHandlers}>
              <View style={[styles.priceSliderFill, { width: `${Math.round(priceSlider * 100)}%` }]} />
              {providerMarkerRatio != null ? (
                <View
                  style={[
                    styles.kbbMarker,
                    {
                      left: Math.max(
                        8,
                        Math.min(priceSliderWidth - 34, priceSliderWidth * providerMarkerRatio),
                      ),
                    },
                  ]}>
                  <Text style={styles.kbbMarkerText}>{providerMarkerLabel}</Text>
                  <View style={styles.kbbNeedle} />
                </View>
              ) : null}
              <View style={[styles.priceSliderThumb, { left: `${Math.round(priceSlider * 100)}%` }]} />
            </View>
            <Text style={styles.selectedPrice}>
              Recommended list price:{' '}
              {formatMoney(selectedPriceValue ?? pricingForSlider.band[pricePosition])}
            </Text>
            <Text style={styles.cardBody}>
              Fast sell: {formatMoney(pricingForSlider.band.fastSell)}{'\n'}
              Fair market: {formatMoney(pricingForSlider.band.fairMarket)}{'\n'}
              Premium ask: {formatMoney(pricingForSlider.band.premiumAsk)}
            </Text>
            <Text style={[styles.cardLabel, styles.spaced]}>
              How pricing is calculated
            </Text>
            <Text style={styles.cardBody}>
              {mode === 'auto'
                ? 'We average low/mid/high quotes from available providers (KBB, Edmunds, market comps), then map them to Fast sell / Fair market / Premium ask. Your condition selection adjusts the final band.'
                : 'Bands combine vision recognition with active marketplace listings when available (eBay US), otherwise a conservative estimate from the photo analysis. Verify comps before you publish.'}
            </Text>
            <Text style={[styles.cardLabel, styles.spaced]}>
              Confidence: {Math.round(pricingForSlider.confidence * 100)}% • Sources:{' '}
              {pricingForSlider.sources.join(', ')}
            </Text>
            <Text style={styles.cardBody}>{pricingForSlider.rationale}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton label="Copy listing" onPress={copyAll} />
          <PrimaryButton
            label={`Copy ${platformLabels[selectedPlatform]} description`}
            variant="ghost"
            onPress={copyDescriptionOnly}
          />
          {userId ? (
            <>
              <PrimaryButton
                label="Download listing package (ZIP)"
                variant="ghost"
                onPress={exportListingPackage}
              />
              <PrimaryButton
                label="Download listing images"
                variant="ghost"
                onPress={saveImagesToLibrary}
              />
            </>
          ) : (
            <PrimaryButton
              label="Sign in to download report/images"
              variant="ghost"
              onPress={() => router.push('/sign-in')}
            />
          )}
          <PrimaryButton label="Open Facebook listing starter" variant="ghost" onPress={openMarketplaceListingStarter} />
          {previewPair ? (
            <PrimaryButton label="Share enhanced hero photo" variant="ghost" onPress={shareHeroPhoto} />
          ) : null}
          <PrimaryButton label="Share…" variant="ghost" onPress={shareText} />
          <PrimaryButton
            label="Start over"
            variant="ghost"
            onPress={() => {
              reset();
              router.replace('/');
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 14, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  toast: { color: '#34C759', fontSize: 14 },
  compare: { flexDirection: 'row', gap: 10 },
  compareSection: {
    gap: 10,
    borderRadius: 16,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  compareCol: { flex: 1, gap: 6 },
  compareLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  compareImg: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#111' },
  sliderWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111',
    marginBottom: 4,
  },
  sliderImage: { width: '100%', height: '100%' },
  sliderAfterMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  sliderImageAbsolute: { width: '100%', height: '100%' },
  sliderHandle: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 24,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  sliderHandleText: { color: '#0b0b0b', fontSize: 11, fontWeight: '700' },
  sliderLegend: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderLegendText: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  badgeRow: { position: 'absolute', left: 8, bottom: 8, gap: 6 },
  changeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    color: '#fff',
    backgroundColor: 'rgba(11,132,255,0.8)',
    overflow: 'hidden',
  },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  cardValue: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cardBody: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 22 },
  segmented: {
    marginTop: 8,
    marginBottom: 10,
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  platformSegmented: {
    marginTop: 8,
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 12,
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: '#0B84FF' },
  segmentText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  selectedPrice: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  spaced: { marginTop: 10 },
  actions: { gap: 10, marginTop: 6 },
  editorRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 13 },
  editorControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editorBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  editorBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: -1 },
  editorValue: { color: '#fff', minWidth: 34, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: 'rgba(255,255,255,0.55)' },
  promptCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    gap: 8,
  },
  promptTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  promptBody: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19 },
  promptActions: { gap: 8 },
  upgradeBanner: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 8,
  },
  upgradeText: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 19 },
  priceSliderTrack: {
    marginTop: 8,
    marginBottom: 10,
    height: 26,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'visible',
  },
  priceSliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(11,132,255,0.55)',
  },
  priceSliderThumb: {
    position: 'absolute',
    top: -3,
    marginLeft: -9,
    width: 18,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
  },
  kbbMarker: {
    position: 'absolute',
    top: -22,
    minWidth: 34,
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  kbbMarkerText: { color: '#101214', fontSize: 10, fontWeight: '700' },
  kbbNeedle: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    bottom: -13,
    width: 2,
    height: 13,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.45)',
  },
});

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function positionLabel(value: 'fastSell' | 'fairMarket' | 'premiumAsk') {
  if (value === 'fastSell') return 'Fast sell';
  if (value === 'fairMarket') return 'Fair market';
  return 'Premium ask';
}

function fitPlatformCopy(args: {
  platform: ListingPlatform;
  title: string;
  description: string;
  priceRange: string;
}) {
  const limits = PLATFORM_COPY_LIMITS[args.platform];
  return {
    title: fitTextForLimit(args.title, limits.titleMax),
    description: fitTextForLimit(args.description, limits.descriptionMax),
    priceRange: args.priceRange,
  };
}

function fitTextForLimit(value: string, max?: number) {
  const trimmed = value.trim();
  if (!max || trimmed.length <= max) return trimmed;

  const sentenceBoundary = trimmed.lastIndexOf('.', max - 1);
  const newlineBoundary = trimmed.lastIndexOf('\n', max - 1);
  const softBoundary = Math.max(sentenceBoundary, newlineBoundary);
  if (softBoundary > Math.floor(max * 0.6)) {
    return `${trimmed.slice(0, softBoundary + 1).trim()}`;
  }
  return `${trimmed.slice(0, Math.max(0, max - 1)).trim()}…`;
}
