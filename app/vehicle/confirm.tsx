import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { VinDecodedVehicle } from '@/src/domain/types';
import { useSessionStore } from '@/src/state/sessionStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

export default function VehicleConfirmScreen() {
  const router = useRouter();
  const vin = useSessionStore((s) => s.vin);
  const setVin = useSessionStore((s) => s.setVin);

  const [form, setForm] = useState<VinDecodedVehicle | null>(vin);

  useEffect(() => {
    setForm(vin);
  }, [vin]);

  if (!form) {
    return (
      <Screen style={styles.screen}>
        <Text style={styles.title}>No decoded VIN found</Text>
        <PrimaryButton label="Back to VIN" onPress={() => router.replace('/vehicle/vin')} />
      </Screen>
    );
  }

  const patch = (key: keyof VinDecodedVehicle, value: string) => {
    setForm((prev) => ({ ...(prev as VinDecodedVehicle), [key]: value.trim() || undefined }));
  };

  const onLooksRight = () => {
    setVin(form);
    router.push('/vehicle/capture');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Confirm vehicle details</Text>
        <Text style={styles.subtitle}>We decoded this from VIN. Confirm to improve listing quality and pricing.</Text>

        <View style={styles.card}>
          <Text style={styles.vin}>VIN: {form.vin}</Text>
          <Field label="Year" value={form.year ?? ''} onChangeText={(v) => patch('year', v)} />
          <Field label="Make" value={form.make ?? ''} onChangeText={(v) => patch('make', v)} />
          <Field label="Model" value={form.model ?? ''} onChangeText={(v) => patch('model', v)} />
          <Field label="Trim" value={form.trim ?? ''} onChangeText={(v) => patch('trim', v)} />
        </View>

        <PrimaryButton label="Looks right, continue" onPress={onLooksRight} />
        <PrimaryButton label="Edit VIN" variant="ghost" onPress={() => router.replace('/vehicle/vin')} />
      </ScrollView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 12 },
  scroll: { padding: 18, gap: 12, paddingBottom: 36 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 14, lineHeight: 20 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 10,
  },
  vin: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fieldWrap: { gap: 5 },
  fieldLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
});
