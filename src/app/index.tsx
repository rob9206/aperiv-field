import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobList } from '@/components/job-list';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { captureFileLifecycle } from '@/lib/capture-files-runtime';
import { loadDraftStore, mutateDraftStore } from '@/lib/draft-store';
import { type DraftStore } from '@/lib/walkthrough-draft';
import { useAuth } from '@/providers/auth-provider';
import { useLocale } from '@/providers/locale-provider';

export default function HomeScreen() {
  const theme = useTheme();
  const { isConfigured, session, user, signOut, isLoading } = useAuth();
  const { t } = useLocale();
  const signedIn = !!session;
  const [store, setStore] = useState<DraftStore | null>(null);
  const [hasSaveError, setHasSaveError] = useState(false);

  const refreshStore = useCallback((clearSaveError = false) => {
    void loadDraftStore().then(
      (next) => {
        if (clearSaveError) {
          setHasSaveError(false);
        }
        setStore(next);
        void captureFileLifecycle.sweepOrphans().catch(() => undefined);
      },
      () => setStore({ activeDraftId: null, drafts: {} })
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) {
        refreshStore(true);
      }
    }, [signedIn, refreshStore])
  );

  const onNewJob = () => {
    router.push({ pathname: '/walkthrough', params: { mode: 'new' } });
  };

  const handleMutationFailure = () => {
    setHasSaveError(true);
    refreshStore();
  };

  const onOpenJob = async (id: string) => {
    try {
      const committed = await mutateDraftStore((current) => {
        if (!Object.prototype.hasOwnProperty.call(current.drafts, id)) {
          return null;
        }
        return {
          store: { ...current, activeDraftId: id },
          value: undefined,
        };
      });
      if (!committed) {
        handleMutationFailure();
        return;
      }
      setHasSaveError(false);
      setStore(committed.store);
      router.push({
        pathname: '/walkthrough',
        params: { mode: 'resume', id },
      });
    } catch {
      handleMutationFailure();
    }
  };

  const onDeleteJob = async (id: string) => {
    try {
      const committed = await captureFileLifecycle.deleteDraft(id);
      if (!committed) {
        handleMutationFailure();
        return;
      }
      setHasSaveError(false);
      setStore(committed.store);
    } catch {
      handleMutationFailure();
    }
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
              {hasSaveError ? (
                <ThemedText type="default" style={{ color: theme.danger }}>
                  {t('saveFailed')}
                </ThemedText>
              ) : null}
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
              <Link href="/dashboard" asChild>
                <Pressable
                  accessibilityRole="button"
                  style={styles.dashboardLink}>
                  <ThemedText type="smallBold" themeColor="accentText">
                    {t('dashboardOpen')}
                  </ThemedText>
                </Pressable>
              </Link>
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
  dashboardLink: {
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
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
