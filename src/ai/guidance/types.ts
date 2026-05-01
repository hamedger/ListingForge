export type GuidanceMessageCode =
  | 'move_closer'
  | 'step_back'
  | 'center'
  | 'adjust_angle'
  | 'too_dark'
  | 'reduce_glare'
  | 'hold_steady'
  | 'perfect';

export interface GuidanceFrame {
  code: GuidanceMessageCode;
  label: string;
  /** 0-1 heuristic confidence for UI weighting */
  confidence: number;
}

export interface GuidanceEngineSnapshot {
  frame: GuidanceFrame;
  /** rolling motion intensity (higher = shakier) */
  motionScore: number;
  /** last engine tick ms */
  updatedAt: number;
}
