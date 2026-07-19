import { Link } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { hasSupabaseEnv } from '@/lib/supabase-env';

export default function HomeScreen() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.hero}>
          <ThemedText type="title" style={styles.title}>
            Aperiv Field
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            On-site turnover walkthroughs and capture.
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Status</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hasSupabaseEnv()
              ? 'Supabase configured — live mode available.'
              : 'Supabase not configured — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'}
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <Link href="/login">
            <ThemedText type="linkPrimary">Sign in →</ThemedText>
          </Link>
          <Link href="/walkthrough">
            <ThemedText type="linkPrimary">Start walkthrough →</ThemedText>
          </Link>
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
    gap: Spacing.three,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
  },
});
