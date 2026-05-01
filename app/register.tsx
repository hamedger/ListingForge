import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { useAuthStore } from '@/src/state/authStore';
import { PrimaryButton } from '@/src/ui/components/PrimaryButton';
import { Screen } from '@/src/ui/components/Screen';

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email.includes('@') || password.length < 8) {
      setError('Use a valid email and a password with at least 8 characters.');
      return;
    }
    try {
      await register({ email: email.trim().toLowerCase(), password, displayName: name.trim() || undefined });
      router.replace('/profile');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Registration failed';
      if (message.includes('auth/operation-not-allowed')) {
        setError('Firebase Email/Password sign-in is disabled. Enable it in Firebase Auth settings.');
      } else if (message.includes('permission-denied')) {
        setError('Firestore rules blocked profile creation. Allow users to write users/{uid}.');
      } else if (message.includes('auth/email-already-in-use')) {
        setError('This email already exists. Please sign in instead.');
      } else {
        setError(message);
      }
    }
  };

  return (
    <Screen style={styles.screen} showBottomBar={false}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.body}>Start a 7-day full-feature trial after signup.</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Display name"
        placeholderTextColor="rgba(255,255,255,0.35)"
        style={styles.input}
      />
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

      <PrimaryButton label="Register & start trial" loading={loading} onPress={onSubmit} />

      <Link href="/sign-in" style={styles.link}>
        <Text style={styles.linkText}>Already have an account? Sign in</Text>
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
