import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobList } from '@/components/job-list';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  deleteDraftPhotos,
  loadDraftStore,
  saveDraftStore,
  type DraftStore,
} from '@/lib/walkthrough-draft';
import { useAuth } from '@/providers/auth-provider';
import { useLocale } from '@/providers/locale-provider';

export default function HomeScreen() {
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
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedView style={styles.hero}>
            <ThemedText type="title" style={styles.title}>
              {t('appName')}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              {t('tagline')}
            </ThemedText>
            <LanguageToggle />
          </ThemedView>

          {!isConfigured ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('signInUnavailable')}
            </ThemedText>
          ) : isLoading ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('checkingSession')}
            </ThemedText>
          ) : signedIn ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t('signedInAs')} {user?.email ?? ''}
              </ThemedText>
              <ThemedText type="heading">{t('myJobs')}</ThemedText>
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
                <ThemedText type="small" themeColor="textSecondary">
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
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {t('signInToStart')}
              </ThemedText>
              <Link href="/login" style={styles.actionLink}>
                <ThemedText type="linkPrimary" style={styles.primaryAction}>
                  {t('signIn')}
                </ThemedText>
              </Link>
            </>
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
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
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
  actionLink: {
    paddingVertical: Spacing.one,
  },
  primaryAction: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  signOut: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
});
