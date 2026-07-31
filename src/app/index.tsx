import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function HomeScreen() {
  const { isConfigured, session, user, signOut, isLoading } = useAuth();
  const signedIn = !!session;

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
            {!isConfigured
              ? 'Supabase not configured — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
              : isLoading
                ? 'Checking session…'
                : signedIn
                  ? `Signed in as ${user?.email ?? 'user'}.`
                  : 'Supabase configured — sign in to start a walkthrough.'}
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          {signedIn ? (
            <>
              <Link href="/walkthrough" style={styles.actionLink}>
                <ThemedText type="smallBold" style={styles.primaryAction}>
                  Start walkthrough →
                </ThemedText>
              </Link>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void signOut();
                }}
                style={styles.actionLink}>
                <ThemedText type="small" themeColor="textSecondary">
                  Sign out
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <Link href="/login" style={styles.actionLink}>
              <ThemedText type="smallBold" style={styles.primaryAction}>
                Sign in →
              </ThemedText>
            </Link>
          )}
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
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
  },
  title: {
    textAlign: 'center',
    fontSize: 40,
    lineHeight: 44,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 320,
  },
  card: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
  },
  actionLink: {
    paddingVertical: Spacing.one,
  },
  primaryAction: {
    color: '#3c87f7',
    fontSize: 16,
    lineHeight: 24,
  },
});
