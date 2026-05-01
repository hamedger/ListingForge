import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { checkPricingProvidersHealth, type ProviderHealth } from '@/src/ai/pricing/health';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

export default function PricingHealthScreen() {
  const [rows, setRows] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const out = await checkPricingProvidersHealth();
      setRows(out);
      setCheckedAt(new Date().toLocaleString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runCheck();
  }, []);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void runCheck()} />}>
        <Text style={styles.title}>Pricing provider health</Text>
        <Text style={styles.subtitle}>
          Validate KBB/Edmunds/comps endpoint availability and latency.
        </Text>
        {checkedAt ? <Text style={styles.meta}>Last checked: {checkedAt}</Text> : null}

        {rows.map((r) => (
          <View key={r.name} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={[styles.badge, r.ok ? styles.ok : styles.bad]}>
                {r.ok ? 'ONLINE' : r.urlConfigured ? 'OFFLINE' : 'MISSING URL'}
              </Text>
            </View>
            <Text style={styles.line}>Configured: {r.urlConfigured ? 'Yes' : 'No'}</Text>
            <Text style={styles.line}>
              Status: {r.statusCode ? String(r.statusCode) : r.error ?? 'No response'}
            </Text>
            <Text style={styles.line}>Latency: {r.latencyMs ? `${r.latencyMs}ms` : '—'}</Text>
          </View>
        ))}

        <PrimaryButton label="Run check again" loading={loading} onPress={() => void runCheck()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 12, paddingBottom: 34 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 20 },
  meta: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  card: {
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#fff', fontSize: 16, fontWeight: '600' },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ok: { backgroundColor: 'rgba(52,199,89,0.2)', color: '#34C759' },
  bad: { backgroundColor: 'rgba(255,69,58,0.2)', color: '#FF453A' },
  line: { color: 'rgba(255,255,255,0.78)', fontSize: 13 },
});
