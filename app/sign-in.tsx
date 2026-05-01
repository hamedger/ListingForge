import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuthStore } from '@/src/state/authStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

export default function SignInScreen() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.includes('@') || password.length < 6) {
      setError('Enter a valid email and password.');
      return;
    }
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace('/profile');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Sign in failed';
      if (message.includes('auth/operation-not-allowed')) {
        setError('Firebase Email/Password sign-in is disabled. Enable it in Firebase Auth settings.');
      } else if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
        setError('Invalid email or password.');
      } else {
        setError(message);
      }
    }
  };

  return (
    <Screen style={styles.screen} showBottomBar={false}>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.body}>Access trial, saved listings, and plan-managed features.</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="rgba(255,255,255,0.35)"
        secureTextEntry
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton label="Sign in" loading={loading} onPress={onSubmit} />

      <Link href="/register" style={styles.link}>
        <Text style={styles.linkText}>Create account and start trial</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 12 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 22 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  error: { color: '#FF8A8A', fontSize: 13 },
  link: { marginTop: 8 },
  linkText: { color: '#0B84FF', fontSize: 15, fontWeight: '600' },
});
