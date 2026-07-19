import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { hasSupabaseEnv } from '@/lib/supabase-env';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const configured = hasSupabaseEnv();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">Sign in</ThemedText>
          {!configured ? (
            <ThemedText type="small" themeColor="textSecondary">
              Supabase is not configured. Auth is a placeholder until
              EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.
            </ThemedText>
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.light.textSecondary}
            autoCapitalize="none"
            autoComplete="username"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.light.textSecondary}
            autoComplete="current-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <ThemedText type="small" themeColor="textSecondary">
            v1 shell only — wire to Supabase auth when the backend is connected.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: '#ffffff',
    color: '#0B1120',
    fontSize: 16,
  },
});
