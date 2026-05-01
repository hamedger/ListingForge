import {
  cacheDirectory,
  copyAsync,
  EncodingType,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import {
  enhancePhotoViaBackend,
  type BackgroundStyle,
  type EnhancePhotoResult,
} from '@/src/api/photoEnhance';

export interface EnhancementOptions {
  /** 0-1 strength */
  lighting: number;
  neutralBackground: boolean;
  /** 0-1 strength for compression/noise cleanup */
  denoise: number;
  /** 0-1 detail recovery bias */
  detailBoost: number;
  mode: 'auto' | 'electronics' | 'general';
  stepId?: string;
  backgroundStyle: BackgroundStyle;
  /** -1 (lighter) to 1 (darker) */
  backgroundDarkness: number;
  logoBase64?: string;
  logoOpacity?: number;
  logoPosition?: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'center';
  preferCloud: boolean;
}

const defaultOptions: EnhancementOptions = {
  lighting: 0.35,
  neutralBackground: false,
  denoise: 0.45,
  detailBoost: 0.35,
  mode: 'general',
  backgroundStyle: 'original',
  backgroundDarkness: 0,
  preferCloud: false,
};

export interface EnhancementResult {
  uri: string;
  backgroundRemoved: boolean;
  backgroundStyleApplied: BackgroundStyle;
  provider: 'remove_bg' | 'internal' | 'fallback' | 'local';
}

/**
 * Post-capture enhancement pipeline (MVP).
 * Heavy segmentation/neutral backgrounds belong in cloud/native fallbacks.
 */
export async function enhanceListingImage(
  inputUri: string,
  options: Partial<EnhancementOptions> = {},
): Promise<EnhancementResult> {
  const opts = { ...defaultOptions, ...options };
  const shouldUseCloud = opts.preferCloud;

  if (shouldUseCloud) {
    try {
      const inputBase64 = await readAsStringAsync(inputUri, { encoding: EncodingType.Base64 });
      const cloud = await enhancePhotoViaBackend({
        imageBase64: inputBase64,
        mode: opts.mode,
        stepId: opts.stepId,
        backgroundStyle: opts.backgroundStyle,
        backgroundDarkness: opts.backgroundDarkness,
        enhanceLevel: 'pro',
        logoBase64: opts.logoBase64,
        logoOpacity: opts.logoOpacity,
        logoPosition: opts.logoPosition,
      });
      const cloudUri = await persistBase64Image(cloud, `lf_cloud_${Date.now()}.jpg`);
      return {
        uri: cloudUri,
        backgroundRemoved: cloud.backgroundRemoved,
        backgroundStyleApplied: cloud.backgroundStyleApplied,
        provider: cloud.provider,
      };
    } catch {
      // Fall through to local enhancement.
    }
  }

  // expo-image-manipulator cannot do true denoise/segmentation. We approximate cleanup with
  // a two-pass resize strategy that suppresses sensor/compression noise and re-normalizes output.
  const targetWidth = Math.round(1680 + opts.lighting * 180);
  const downsampleWidth = Math.max(900, Math.round(targetWidth * (0.62 - opts.denoise * 0.18)));
  const recoverWidth = Math.round(targetWidth * (0.96 + opts.detailBoost * 0.04));

  const firstPass = await ImageManipulator.manipulateAsync(
    inputUri,
    [{ resize: { width: downsampleWidth } }],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const secondPass = await ImageManipulator.manipulateAsync(
    firstPass.uri,
    [{ resize: { width: recoverWidth } }],
    {
      compress: Math.max(0.82, 0.92 - opts.denoise * 0.08),
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const result = await ImageManipulator.manipulateAsync(secondPass.uri, [{ resize: { width: targetWidth } }], {
    compress: Math.max(0.84, 0.94 - opts.denoise * 0.06),
    format: ImageManipulator.SaveFormat.JPEG,
  });

  if (!opts.neutralBackground) {
    return {
      uri: result.uri,
      backgroundRemoved: false,
      backgroundStyleApplied: 'original',
      provider: 'local',
    };
  }

  const outName = `lf_enhanced_${Date.now()}.jpg`;
  const base = cacheDirectory;
  if (!base) {
    return {
      uri: result.uri,
      backgroundRemoved: false,
      backgroundStyleApplied: 'original',
      provider: 'local',
    };
  }
  const outUri = `${base}${outName}`;
  await copyAsync({ from: result.uri, to: outUri });
  return {
    uri: outUri,
    backgroundRemoved: false,
    backgroundStyleApplied: 'original',
    provider: 'local',
  };
}

async function persistBase64Image(data: EnhancePhotoResult, fileName: string): Promise<string> {
  const base = cacheDirectory;
  if (!base) {
    throw new Error('Cache directory unavailable for enhanced image output.');
  }
  const uri = `${base}${fileName}`;
  await writeAsStringAsync(uri, data.optimizedImageBase64, { encoding: EncodingType.Base64 });
  return uri;
}
