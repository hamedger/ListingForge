import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

import type { VehicleStepId } from '@/src/domain/vehicleSteps';

import type { GuidanceEngineSnapshot, GuidanceFrame, GuidanceMessageCode } from './types';

const LABELS: Record<GuidanceMessageCode, string> = {
  move_closer: 'Move closer',
  step_back: 'Step back',
  center: 'Center the vehicle',
  adjust_angle: 'Adjust your angle',
  too_dark: 'Lighting looks dark',
  reduce_glare: 'Reduce glare on glass',
  hold_steady: 'Hold steady',
  perfect: 'Perfect shot achieved',
};

function isExteriorStep(step: VehicleStepId) {
  return step === 'front_3_4' || step === 'side' || step === 'rear_3_4';
}

export class HeuristicVehicleGuidanceEngine {
  private samples: number[] = [];
  private subscription: { remove: () => void } | null = null;

  constructor(private step: VehicleStepId) {
    if (Platform.OS !== 'web') {
      Accelerometer.setUpdateInterval(100);
    }
  }

  setStep(step: VehicleStepId) {
    this.step = step;
  }

  start(onUpdate: (snapshot: GuidanceEngineSnapshot) => void) {
    this.subscription?.remove();
    if (Platform.OS !== 'web') {
      this.subscription = Accelerometer.addListener(({ x, y, z }) => {
        const g = Math.sqrt(x * x + y * y + z * z);
        this.samples.push(g);
        if (this.samples.length > 12) this.samples.shift();
        onUpdate(this.snapshot());
      });
    }

    onUpdate(this.snapshot());
  }

  stop() {
    this.subscription?.remove();
    this.subscription = null;
    this.samples = [];
  }

  private motionScore(): number {
    if (this.samples.length < 4) return 0;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const variance =
      this.samples.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / this.samples.length;
    return Math.min(1, variance * 6);
  }

  snapshot(): GuidanceEngineSnapshot {
    const motion = this.motionScore();
    const now = Date.now();

    let code: GuidanceMessageCode;
    let confidence: number;

    if (motion > 0.35) {
      code = 'hold_steady';
      confidence = 0.55 + motion * 0.35;
    } else if (isExteriorStep(this.step)) {
      code = 'center';
      confidence = 0.35;
    } else if (this.step === 'odometer') {
      code = motion > 0.2 ? 'hold_steady' : 'reduce_glare';
      confidence = 0.45;
    } else {
      code = 'reduce_glare';
      confidence = 0.4;
    }

    const frame: GuidanceFrame = { code, label: LABELS[code], confidence };

    return { frame, motionScore: motion, updatedAt: now };
  }

  markPerfectShot(): GuidanceEngineSnapshot {
    const frame: GuidanceFrame = { code: 'perfect', label: LABELS.perfect, confidence: 0.95 };
    return { frame, motionScore: this.motionScore(), updatedAt: Date.now() };
  }
}
