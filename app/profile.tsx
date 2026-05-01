import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { estimateFreeListingsLeft, getGuestCredits } from '@/src/billing/credits';
import { fetchBillingConfig, type BillingConfigResponse } from '@/src/api/billing';
import { useAuthStore } from '@/src/state/authStore';
import { useSessionStore } from '@/src/state/sessionStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

export default function ProfileScreen() {
  const router = useRouter();
  const resetSession = useSessionStore((s) => s.reset);

  const loading = useAuthStore((s) => s.loading);
  const profile = useAuthStore((s) => s.profile);
  const email = useAuthStore((s) => s.email);
  const entitlements = useAuthStore((s) => s.entitlements);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [billingConfig, setBillingConfig] = useState<BillingConfigResponse | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(false);
  const [guestCredits, setGuestCredits] = useState<number | null>(null);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setPhone(profile?.phone ?? '');
    setAutoRefillEnabled(profile?.auto_refill_enabled ?? false);
  }, [profile?.auto_refill_enabled, profile?.display_name, profile?.phone]);

  useEffect(() => {
    let active = true;
    setBillingError(null);
    fetchBillingConfig()
      .then((config) => {
        if (active) setBillingConfig(config);
      })
      .catch((error) => {
        if (active) setBillingError(error instanceof Error ? error.message : 'Failed to load packs');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (profile) {
      setGuestCredits(null);
      return;
    }
    getGuestCredits()
      .then((value) => {
        if (active) setGuestCredits(value);
      })
      .catch(() => {
        if (active) setGuestCredits(5);
      });
    return () => {
      active = false;
    };
  }, [profile]);

  const trialLabel = useMemo(() => {
    if (!profile) return '—';
    if (profile.trial_status === 'active' && profile.trial_ends_at) {
      return `Active until ${new Date(profile.trial_ends_at).toLocaleDateString()}`;
    }
    if (profile.trial_status === 'expired') return 'Expired';
    return 'Not started';
  }, [profile]);

  const onSave = async () => {
    setMsg(null);
    try {
      await updateProfile({
        display_name: name.trim() || null,
        phone: phone.trim() || null,
        auto_refill_enabled: autoRefillEnabled,
      });
      setMsg('Profile updated');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const currentCredits = profile?.credits_balance ?? 0;
  const multipliers = billingConfig?.modeMultipliers ?? { auto: 1.5, electronics: 1, general: 0.8 };
  const estimates = {
    auto: Math.floor(currentCredits / multipliers.auto),
    electronics: Math.floor(currentCredits / multipliers.electronics),
    general: Math.floor(currentCredits / multipliers.general),
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profile</Text>

        <View style={styles.creditsCard}>
          <Text style={styles.sectionTitle}>Credits wallet</Text>
          <Text style={styles.creditsTopValue}>{currentCredits.toFixed(1)} credits</Text>
          {!profile && guestCredits != null ? (
            <Text style={styles.hint}>Free listings left: {estimateFreeListingsLeft(guestCredits)}</Text>
          ) : null}
          <Text style={styles.hint}>Available jobs by mode</Text>
          <View style={styles.jobsRow}>
            <Text style={styles.jobsText}>AUTO ~{estimates.auto}</Text>
            <Text style={styles.jobsText}>ELECTRONICS ~{estimates.electronics}</Text>
            <Text style={styles.jobsText}>GENERAL ~{estimates.general}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>One-time credit packs</Text>
          <Text style={styles.hint}>Auto-refill uses your selected pack when balance goes low.</Text>
          {billingConfig?.topupPacks.map((pack) => (
            <View key={pack.id} style={styles.packRow}>
              <View style={styles.packInfo}>
                <Text style={styles.packTitle}>
                  {pack.label} {pack.popular ? '• Most popular' : ''}
                </Text>
                <Text style={styles.packSub}>
                  {pack.credits} credits • ${pack.priceUsd.toFixed(2)} one-time
                </Text>
              </View>
            </View>
          ))}
          {billingError ? <Text style={styles.info}>{billingError}</Text> : null}

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.fieldLabel}>Auto-refill</Text>
              <Text style={styles.hint}>Refill automatically when low on credits.</Text>
            </View>
            <Switch value={autoRefillEnabled} onValueChange={setAutoRefillEnabled} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account</Text>
          {!profile ? (
            <>
              <Text style={styles.hint}>You are in guest mode.</Text>
              <View style={styles.rowActions}>
                <PrimaryButton label="Sign in" onPress={() => router.push('/sign-in')} />
                <PrimaryButton
                  label="Register (start trial)"
                  variant="ghost"
                  onPress={() => router.push('/register')}
                />
              </View>
            </>
          ) : (
            <>
              <AccountRow label="Email" value={email ?? profile.email} />
              <AccountRow label="Plan" value={profile.plan.toUpperCase()} />
              <AccountRow label="Trial" value={trialLabel} />
              <AccountRow
                label="Market pricing"
                value={entitlements.canUseMarketPricing ? 'Enabled' : 'Locked'}
              />

              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Phone (optional)</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555 555 5555"
                placeholderTextColor="rgba(255,255,255,0.35)"
                keyboardType="phone-pad"
                style={styles.input}
              />

              {msg ? <Text style={styles.info}>{msg}</Text> : null}
              <View style={styles.rowActions}>
                <PrimaryButton label="Save profile" loading={loading} onPress={onSave} />
                <PrimaryButton
                  label="Sign out"
                  variant="ghost"
                  onPress={async () => {
                    await signOut().catch(() => undefined);
                    resetSession();
                  }}
                />
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Plan comparison</Text>
        <Text style={styles.tableNote}>Monthly USD</Text>
        <PlanTable
          columns={['Plan', 'Price', 'Highlights']}
          rows={[
            ['Free', '$0', 'Basic generator; limited AI; capped saved listings'],
            ['Pro', '$5/mo', 'Pricing + confidence; better copy; condition signals; unlimited listings'],
            ['Business', '$29/mo', 'Batch listings; batch images; exports; priority processing'],
            ['Enterprise', 'Custom', 'SSO, API, SLA — sales-led'],
          ]}
        />

        <PrimaryButton
          label="Pricing provider health"
          variant="ghost"
          onPress={() => router.push('/pricing-health')}
        />
      </ScrollView>
    </Screen>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.accountRow}>
      <Text style={styles.accountLabel}>{label}</Text>
      <Text style={styles.accountValue}>{value}</Text>
    </View>
  );
}

function PlanTable({
  columns,
  rows,
}: {
  columns: [string, string, string];
  rows: [string, string, string][];
}) {
  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.trHeader]}>
        {columns.map((c) => (
          <Text key={c} style={[styles.th, styles.cellPlan]}>
            {c}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={[styles.tr, i % 2 === 1 && styles.trAlt]}>
          <Text style={[styles.td, styles.cellPlan]}>{row[0]}</Text>
          <Text style={[styles.td, styles.cellPrice]}>{row[1]}</Text>
          <Text style={[styles.td, styles.cellHi]}>{row[2]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, gap: 14, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 4 },
  hint: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 8 },
  creditsCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(76,197,255,0.4)',
    backgroundColor: 'rgba(11,132,255,0.15)',
    gap: 8,
  },
  creditsTopValue: { color: '#fff', fontSize: 30, fontWeight: '800' },
  jobsRow: { gap: 4 },
  jobsText: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600' },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 8,
  },
  packRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  packInfo: { gap: 2 },
  packTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  packSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  toggleRow: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  accountLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 14, flex: 1 },
  accountValue: { color: '#fff', fontSize: 14, flex: 1.2, textAlign: 'right' },
  rowActions: { gap: 8, marginTop: 8 },
  fieldLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 12, marginTop: 8 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  info: { color: '#8FD3FF', fontSize: 12 },
  tableNote: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginBottom: 6 },
  table: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 8, gap: 6 },
  trHeader: { backgroundColor: 'rgba(255,255,255,0.08)' },
  trAlt: { backgroundColor: 'rgba(255,255,255,0.03)' },
  th: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  td: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 16 },
  cellPlan: { flex: 0.85, minWidth: 72 },
  cellPrice: { flex: 0.75, minWidth: 64 },
  cellHi: { flex: 1.4 },
});
