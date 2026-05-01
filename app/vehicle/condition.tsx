import type { ConditionTier } from '@/src/domain/types';
import { confirmAndConsumeListingCredits } from '@/src/billing/credits';
import { useAuthStore } from '@/src/state/authStore';
import { useSessionStore } from '@/src/state/sessionStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

const TIERS: { id: ConditionTier; label: string; detail: string }[] = [
  { id: 'excellent', label: 'Excellent', detail: 'Minimal wear, strong presentation.' },
  { id: 'good', label: 'Good', detail: 'Normal wear for age/miles.' },
  { id: 'fair', label: 'Fair', detail: 'Visible wear or cosmetic needs.' },
];

export default function VehicleConditionScreen() {
  const router = useRouter();
  const setCondition = useSessionStore((s) => s.setCondition);
  const vehicleDefectNotes = useSessionStore((s) => s.vehicleDefectNotes);
  const setVehicleDefectNotes = useSessionStore((s) => s.setVehicleDefectNotes);
  const setListing = useSessionStore((s) => s.setListing);
  const userId = useAuthStore((s) => s.userId);
  const profile = useAuthStore((s) => s.profile);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const choose = async (tier: ConditionTier) => {
    const ok = await confirmAndConsumeListingCredits({
      mode: 'auto',
      userId,
      signedInCredits: profile?.credits_balance ?? 0,
      consumeSignedInCredits: (nextBalance) => updateProfile({ credits_balance: nextBalance }),
      onRegister: () => router.push('/register'),
      onBuyCredits: () => router.push('/profile'),
    });
    if (!ok) return;
    setCondition(tier);
    setListing(null);
    router.push('/result');
  };

  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>Condition tier</Text>
      <Text style={styles.subtitle}>Pick the closest match — this tunes tone and the price heuristic.</Text>
      <Text style={styles.label}>Visible defects from photos (optional but recommended)</Text>
      <TextInput
        multiline
        value={vehicleDefectNotes}
        onChangeText={setVehicleDefectNotes}
        placeholder="e.g. small scratch on rear bumper, minor door ding passenger side"
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.notes}
      />

      <View style={styles.list}>
        {TIERS.map((t) => (
          <PrimaryButton key={t.id} label={`${t.label} — ${t.detail}`} onPress={() => choose(t.id)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 12 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 22 },
  label: { color: 'rgba(255,255,255,0.58)', fontSize: 13, marginTop: 2 },
  notes: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    padding: 10,
    textAlignVertical: 'top',
  },
  list: { gap: 10, marginTop: 8 },
});
