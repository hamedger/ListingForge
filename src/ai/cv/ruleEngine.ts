import type { GuidanceEngineSnapshot } from '@/src/ai/guidance/types';

import type { CaptureMode, CvFrameSignal, CvThresholdProfile } from './types';

const PROFILES: Record<CaptureMode, CvThresholdProfile> = {
  auto: {
    minCoverage: 0.38,
    maxCoverage: 0.84,
    centerTolerance: 0.2,
    maxMotion: 0.12,
    minLuminance: 0.24,
    maxGlare: 0.65,
    maxBlur: 0.35,
  },
  electronics: {
    minCoverage: 0.32,
    maxCoverage: 0.86,
    centerTolerance: 0.18,
    maxMotion: 0.12,
    minLuminance: 0.22,
    maxGlare: 0.62,
    maxBlur: 0.32,
  },
  general: {
    minCoverage: 0.28,
    maxCoverage: 0.9,
    centerTolerance: 0.22,
    maxMotion: 0.13,
    minLuminance: 0.2,
    maxGlare: 0.66,
    maxBlur: 0.36,
  },
};

function make(label: string, code: GuidanceEngineSnapshot['frame']['code'], motion: number): GuidanceEngineSnapshot {
  return {
    frame: { code, label, confidence: 0.8 },
    motionScore: motion,
    updatedAt: Date.now(),
  };
}

export function mapCvSignalToGuidance(signal: CvFrameSignal): GuidanceEngineSnapshot {
  const t = PROFILES[signal.mode];
  const motion = signal.motion;

  if (motion > t.maxMotion || (signal.blur ?? 0) > t.maxBlur) {
    return make('Hold steady', 'hold_steady', motion);
  }

  if ((signal.luminance ?? 0.5) < t.minLuminance) {
    return make('Move to better light', 'too_dark', motion);
  }

  if ((signal.glare ?? 0) > t.maxGlare) {
    return make('Reduce glare', 'reduce_glare', motion);
  }

  const c = signal.coverage;
  if (typeof c === 'number') {
    if (c < t.minCoverage) return make('Move closer', 'move_closer', motion);
    if (c > t.maxCoverage) return make('Step back', 'step_back', motion);
  }

  const ox = signal.offsetX ?? 0;
  const oy = signal.offsetY ?? 0;
  if (Math.abs(ox) > t.centerTolerance || Math.abs(oy) > t.centerTolerance) {
    return make('Center the item', 'center', motion);
  }

  return make('Good framing — ready to capture', 'perfect', motion);
}
