import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

type Props = PressableProps & {
  label: string;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
};

export function PrimaryButton({ label, variant = 'primary', loading, disabled, ...rest }: Props) {
  const isGhost = variant === 'ghost';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isGhost ? styles.ghost : styles.primary,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={isGhost ? '#0B84FF' : '#fff'} />
      ) : (
        <Text style={[styles.label, isGhost && styles.labelGhost]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: '#0B84FF' },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
  labelGhost: { color: '#0B84FF' },
});
