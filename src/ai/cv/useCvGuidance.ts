import { useMemo } from 'react';

import type { GuidanceEngineSnapshot } from '@/src/ai/guidance/types';

import { useFallbackCvGuidance } from './useFallbackCvGuidance';
import type { CaptureMode, CvFrameSignal } from './types';

interface UseCvGuidanceArgs {
  mode: CaptureMode;
  fallbackSignalOverrides?: Partial<CvFrameSignal>;
}

/**
 * Native-first CV guidance entry point.
 * Current implementation falls back to motion-based signals until
 * frame processor outputs are connected in development builds.
 */
export function useCvGuidance({
  mode,
  fallbackSignalOverrides,
}: UseCvGuidanceArgs): GuidanceEngineSnapshot | null {
  const fallback = useFallbackCvGuidance({ mode, signalOverrides: fallbackSignalOverrides });

  return useMemo(() => fallback, [fallback]);
}
