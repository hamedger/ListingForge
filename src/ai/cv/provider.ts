import type { CaptureMode, CvFrameSignal } from './types';

/**
 * Temporary fallback until native frame processor is integrated.
 * Replace with VisionCamera/CoreML/MLKit signal provider in dev builds.
 */
export function buildFallbackCvSignal(mode: CaptureMode, motion: number): CvFrameSignal {
  return {
    mode,
    motion,
    confidence: 0.35,
  };
}
