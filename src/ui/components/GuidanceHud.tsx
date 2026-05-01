import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GuidanceEngineSnapshot } from '@/src/ai/guidance/types';

type Props = {
  snapshot: GuidanceEngineSnapshot | null;
  qualityScore?: number | null;
};

export const GuidanceHud = memo(function GuidanceHud({ snapshot, qualityScore }: Props) {
  const label = snapshot?.frame.label ?? 'Align with the guide';
  const isPerfect = snapshot?.frame.code === 'perfect';
  const title =
    snapshot?.frame.code === 'perfect'
      ? 'Ready to continue'
      : snapshot?.frame.code === 'hold_steady'
        ? 'Stabilize camera'
        : qualityScore != null && qualityScore < 62
          ? 'Improve shot quality'
          : 'Guidance active';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.message, isPerfect && styles.messagePerfect]}>{label}</Text>
      {qualityScore != null ? (
        <Text style={styles.sub}>Photo quality score: {Math.round(qualityScore)}</Text>
      ) : (
        <Text style={styles.sub}>Motion: {snapshot ? Math.round(snapshot.motionScore * 100) : '—'}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, alignItems: 'center' },
  title: { color: '#fff', fontSize: 12, marginBottom: 4, opacity: 0.9 },
  message: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  messagePerfect: { color: '#fff' },
  sub: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.92,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
