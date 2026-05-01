import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { VehicleStepId } from '@/src/domain/vehicleSteps';

type Props = {
  step: VehicleStepId;
};

function Silhouette({ step }: { step: VehicleStepId }) {
  const stroke = 'rgba(255,255,255,0.55)';
  const fill = 'rgba(255,255,255,0.06)';

  if (step === 'side') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet">
        <Path
          d="M40 150 C40 120 70 95 120 90 L210 88 C270 86 310 110 318 140 L322 165 C322 178 310 188 292 188 L68 190 C52 190 40 176 40 150Z"
          stroke={stroke}
          strokeWidth={3}
          fill={fill}
        />
        <Circle cx={95} cy={168} r={22} stroke={stroke} strokeWidth={2} fill="none" />
        <Circle cx={255} cy={166} r={22} stroke={stroke} strokeWidth={2} fill="none" />
      </Svg>
    );
  }

  if (step === 'rear_3_4') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet">
        <Path
          d="M70 170 C60 130 110 90 190 86 C250 84 300 110 310 150 L312 170 C312 184 298 194 280 194 L90 196 C76 196 66 184 70 170Z"
          stroke={stroke}
          strokeWidth={3}
          fill={fill}
        />
        <Circle cx={115} cy={168} r={22} stroke={stroke} strokeWidth={2} fill="none" />
        <Circle cx={255} cy={166} r={22} stroke={stroke} strokeWidth={2} fill="none" />
      </Svg>
    );
  }

  if (step === 'interior_front' || step === 'dashboard') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet">
        <Rect x={24} y={36} width={312} height={148} rx={18} stroke={stroke} strokeWidth={3} fill={fill} />
        <Path d="M40 70 H320" stroke={stroke} strokeWidth={2} opacity={0.5} />
        <Path d="M120 70 V170" stroke={stroke} strokeWidth={2} opacity={0.35} />
      </Svg>
    );
  }

  if (step === 'odometer') {
    return (
      <Svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet">
        <Rect x={70} y={70} width={220} height={90} rx={14} stroke={stroke} strokeWidth={3} fill={fill} />
        <Rect x={92} y={102} width={176} height={26} rx={6} stroke={stroke} strokeWidth={2} fill="rgba(0,0,0,0.25)" />
      </Svg>
    );
  }

  // front_3_4 default
  return (
    <Svg width="100%" height="100%" viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet">
      <Path
        d="M50 165 C46 130 86 92 170 88 C248 84 310 110 318 150 L320 170 C320 184 306 194 288 194 L72 196 C58 196 48 182 50 165Z"
        stroke={stroke}
        strokeWidth={3}
        fill={fill}
      />
      <Circle cx={105} cy={168} r={22} stroke={stroke} strokeWidth={2} fill="none" />
      <Circle cx={255} cy={166} r={22} stroke={stroke} strokeWidth={2} fill="none" />
    </Svg>
  );
}

export const SilhouetteOverlay = memo(function SilhouetteOverlay({ step }: Props) {
  return (
    <View style={styles.layer} pointerEvents="none">
      <Silhouette step={step} />
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 40,
  },
});
