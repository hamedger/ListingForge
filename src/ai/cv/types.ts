export type CaptureMode = 'auto' | 'electronics' | 'general';

export interface CvFrameSignal {
  mode: CaptureMode;
  /** 0..1, how much of target area is filled by object */
  coverage?: number;
  /** -1..1 (left negative, right positive) */
  offsetX?: number;
  /** -1..1 (up negative, down positive) */
  offsetY?: number;
  /** 0..1 blur amount (higher = blurrier) */
  blur?: number;
  /** 0..1 luminance (lower = darker) */
  luminance?: number;
  /** 0..1 glare severity */
  glare?: number;
  /** 0..1 motion intensity */
  motion: number;
  /** 0..1 detector confidence */
  confidence?: number;
}

export interface CvThresholdProfile {
  minCoverage: number;
  maxCoverage: number;
  centerTolerance: number;
  maxMotion: number;
  minLuminance: number;
  maxGlare: number;
  maxBlur: number;
}
