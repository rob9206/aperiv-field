import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { useLocale } from '@/providers/locale-provider';

export default function LoginScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const { isConfigured, signIn, session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) {
    return <Redirect href="/" />;
  }

  async function onSubmit() {
    if (!isConfigured) {
      return;
    }

    setError(null);
    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace('/');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.brand}>
          <ThemedText type="heading" style={styles.brandTitle}>
            {t('appName')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('tagline')}
          </ThemedText>
          <LanguageToggle />
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.card}>
          {!isConfigured ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('signInUnavailable')}
            </ThemedText>
          ) : null}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            placeholder={t('email')}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoComplete="username"
            keyboardType="email-address"
            editable={isConfigured && !loading}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.background,
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            placeholder={t('passwordLabel')}
            placeholderTextColor={theme.textSecondary}
            autoComplete="current-password"
            secureTextEntry
            editable={isConfigured && !loading}
            value={password}
            onChangeText={setPassword}
          />
          {error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!isConfigured || loading}
            onPress={() => {
              void onSubmit();
            }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.accent },
              (!isConfigured || loading) && styles.buttonDisabled,
              pressed && isConfigured && !loading && styles.buttonPressed,
            ]}>
            {loading ? (
              <ActivityIndicator color={theme.onAccent} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                {t('signIn')}
              </ThemedText>
            )}
          </Pressable>
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
    gap: Spacing.four,
  },
  brand: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.four,
  },
  brandTitle: {
    fontSize: 26,
    lineHeight: 32,
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
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    minHeight: 52,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
