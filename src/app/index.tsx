import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobList } from '@/components/job-list';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteDraftPhotos,
  loadDraftStore,
  saveDraftStore,
  type DraftStore,
} from '@/lib/walkthrough-draft';
import { useAuth } from '@/providers/auth-provider';
import { useLocale } from '@/providers/locale-provider';

export default function HomeScreen() {
  const theme = useTheme();
  const { isConfigured, session, user, signOut, isLoading } = useAuth();
  const { t } = useLocale();
  const signedIn = !!session;
  const [store, setStore] = useState<DraftStore | null>(null);

  const refreshStore = useCallback(() => {
    void loadDraftStore().then(setStore, () =>
      setStore({ activeDraftId: null, drafts: {} })
    );
  }, []);

  useEffect(() => {
    if (signedIn) {
      refreshStore();
    }
  }, [signedIn, refreshStore]);

  const onNewJob = () => {
    router.push({ pathname: '/walkthrough', params: { mode: 'new' } });
  };

  const onOpenJob = async (id: string) => {
    const current = store ?? (await loadDraftStore());
    const next: DraftStore = { ...current, activeDraftId: id };
    await saveDraftStore(next);
    setStore(next);
    router.push({
      pathname: '/walkthrough',
      params: { mode: 'resume', id },
    });
  };

  const onDeleteJob = async (id: string) => {
    const current = store ?? (await loadDraftStore());
    deleteDraftPhotos(id);
    const { [id]: _removed, ...rest } = current.drafts;
    const next: DraftStore = {
      activeDraftId: current.activeDraftId === id ? null : current.activeDraftId,
      drafts: rest,
    };
    await saveDraftStore(next);
    setStore(next);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <View style={styles.brandBlock}>
              <ThemedText type="title" style={styles.title}>
                {t('appName')}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                {t('tagline')}
              </ThemedText>
            </View>
            <LanguageToggle />
          </View>

          {!isConfigured ? (
            <ThemedText type="default" themeColor="textSecondary">
              {t('signInUnavailable')}
            </ThemedText>
          ) : isLoading ? (
            <ThemedText type="default" themeColor="textSecondary">
              {t('checkingSession')}
            </ThemedText>
          ) : signedIn ? (
            <>
              <View style={styles.sectionHeader}>
                <ThemedText type="heading" style={styles.sectionTitle}>
                  {t('myJobs')}
                </ThemedText>
                {user?.email ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {user.email}
                  </ThemedText>
                ) : null}
              </View>
              {store ? (
                <JobList
                  store={store}
                  onNewJob={onNewJob}
                  onOpenJob={(id) => {
                    void onOpenJob(id);
                  }}
                  onDeleteJob={(id) => {
                    void onDeleteJob(id);
                  }}
                />
              ) : (
                <ThemedText type="default" themeColor="textSecondary">
                  {t('loading')}
                </ThemedText>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void signOut();
                }}
                style={styles.signOut}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('signOut')}
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <View style={styles.signedOut}>
              <ThemedText type="default" themeColor="textSecondary" style={styles.signedOutCopy}>
                {t('signInToStart')}
              </ThemedText>
              <Link href="/login" asChild>
                <Pressable
                  style={({ pressed }) => [
                    styles.signInButton,
                    { backgroundColor: theme.accent },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="default" style={styles.signInLabel}>
                    {t('signIn')}
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          )}
        </ScrollView>
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
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  brandBlock: {
    flex: 1,
    gap: Spacing.one,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  subtitle: {
    maxWidth: 280,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionHeader: {
    gap: Spacing.one,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
  signedOut: {
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  signedOutCopy: {
    fontSize: 17,
    lineHeight: 26,
  },
  signInButton: {
    minHeight: 56,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
  },
  signOut: {
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.88,
  },
});
