import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchOwnerWeeklyStats, type OwnerWeeklyStats } from '@/src/api/ownerDashboard';
import { useSessionStore } from '@/src/state/sessionStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const ownerUnlocked = useSessionStore((s) => s.ownerUnlocked);
  const ownerPin = useSessionStore((s) => s.ownerPin);
  const setOwnerAccess = useSessionStore((s) => s.setOwnerAccess);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OwnerWeeklyStats | null>(null);

  useEffect(() => {
    if (!ownerUnlocked || !ownerPin) {
      router.replace('/');
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchOwnerWeeklyStats(ownerPin)
      .then((data) => {
        if (active) setStats(data);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerPin, ownerUnlocked, router]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Owner Dashboard (Weekly)</Text>
        <Text style={styles.subtle}>Last 7 days billing and credit activity.</Text>
        {loading ? <Text style={styles.subtle}>Loading…</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {stats ? (
          <>
            <StatCard label="New users" value={String(stats.users.newUsers)} />
            <StatCard label="Active billing users" value={String(stats.users.activeBillingUsers)} />
            <StatCard label="Paying users" value={String(stats.users.payingUsers)} />
            <StatCard label="Credits consumed" value={stats.credits.consumed.toFixed(1)} />
            <StatCard label="Credits topped up" value={stats.credits.topup.toFixed(1)} />
            <StatCard label="Auto-refill credits" value={stats.credits.autoRefillTopup.toFixed(1)} />
            <StatCard label="Top-up revenue" value={`$${stats.revenue.topupUsd.toFixed(2)}`} />
            <StatCard label="Consume events" value={String(stats.events.consumeEvents)} />
            <StatCard label="Top-up events" value={String(stats.events.topupEvents)} />
            <StatCard label="Auto-refill events" value={String(stats.events.autoRefillEvents)} />
          </>
        ) : null}

        <PrimaryButton
          label="Lock dashboard"
          variant="ghost"
          onPress={() => {
            setOwnerAccess({ unlocked: false, pin: null });
            router.replace('/');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 12, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  subtle: { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  error: { color: '#ff7b7b', fontSize: 13 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 5,
  },
  cardLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 12 },
  cardValue: { color: '#fff', fontSize: 22, fontWeight: '700' },
});
