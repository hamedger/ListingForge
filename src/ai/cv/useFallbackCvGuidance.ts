import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

import type { GuidanceEngineSnapshot } from '@/src/ai/guidance/types';

import { mapCvSignalToGuidance } from './ruleEngine';
import { buildFallbackCvSignal } from './provider';
import type { CaptureMode, CvFrameSignal } from './types';

interface UseFallbackCvGuidanceArgs {
  mode: CaptureMode;
  signalOverrides?: Partial<CvFrameSignal>;
}

export function useFallbackCvGuidance({ mode, signalOverrides }: UseFallbackCvGuidanceArgs) {
  const [samples, setSamples] = useState<number[]>([]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z);
      setSamples((prev) => {
        const next = [...prev, g];
        return next.length > 12 ? next.slice(next.length - 12) : next;
      });
    });
    return () => sub.remove();
  }, []);

  const motionScore = useMemo(() => {
    if (samples.length < 4) return 0;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / samples.length;
    return Math.min(1, variance * 6);
  }, [samples]);

  const snapshot = useMemo<GuidanceEngineSnapshot>(() => {
    const signal: CvFrameSignal = {
      ...buildFallbackCvSignal(mode, motionScore),
      ...signalOverrides,
      mode,
      motion: motionScore,
    };
    return mapCvSignalToGuidance(signal);
  }, [mode, motionScore, signalOverrides]);

  return snapshot;
}
