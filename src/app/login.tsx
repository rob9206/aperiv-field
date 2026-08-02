import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
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
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <ThemedText type="title" style={styles.brandTitle}>
              {t('appName')}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              {t('tagline')}
            </ThemedText>
          </View>
          <LanguageToggle />
        </View>
        <ThemedView
          type="backgroundElement"
          style={[styles.card, { borderColor: theme.border }]}>
          {!isConfigured ? (
            <ThemedText type="default" themeColor="textSecondary">
              {t('signInUnavailable')}
            </ThemedText>
          ) : null}
          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('email')}
            </ThemedText>
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
          </View>
          <View style={styles.field}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('passwordLabel')}
            </ThemedText>
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
          </View>
          {error ? (
            <ThemedText type="default" style={{ color: theme.danger }}>
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
              <ThemedText type="default" style={styles.buttonLabel}>
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
    paddingTop: Spacing.three,
    gap: Spacing.four,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  brand: {
    flex: 1,
    gap: Spacing.one,
  },
  brandTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  card: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    minHeight: 52,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    minHeight: 56,
    marginTop: Spacing.one,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
