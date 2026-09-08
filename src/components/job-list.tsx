import { useState } from 'react';
import { isJobSent } from '@/lib/crew-workflow';
import type { TranslationKey } from '@/lib/i18n';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { OverflowButton } from '@/components/overflow-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  totalPhotos,
  type DraftStore,
  type ManualWalkthroughDraft,
} from '@/lib/walkthrough-draft';
import { useLocale } from '@/providers/locale-provider';

type JobListProps = {
  store: DraftStore;
  userId?: string;
  onNewJob: () => void;
  onOpenJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
};

function statusMeta(
  draft: ManualWalkthroughDraft,
  userId: string | undefined,
  t: (key: TranslationKey) => string,
  theme: ReturnType<typeof useTheme>,
): { label: string; background: string; color: string } {
  const sent = isJobSent(draft, userId);
  return {
    label: t(sent ? 'jobSent' : draft.completedAt ? 'jobReadyToSend' : 'jobInProgress'),
    background: sent ? theme.accent : theme.backgroundSelected,
    color: sent ? theme.onAccent : theme.text,
  };
}

export function JobList({
  store,
  userId,
  onNewJob,
  onOpenJob,
  onDeleteJob,
}: JobListProps) {
  const theme = useTheme();
  const { t } = useLocale();
  const [showSent, setShowSent] = useState(false);
  const [optionsId, setOptionsId] = useState<string | null>(null);
  const jobs = Object.values(store.drafts).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  const sentJobs = jobs.filter(job => isJobSent(job, userId));
  const visibleJobs = jobs.filter(job => showSent || !isJobSent(job, userId));

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        onPress={onNewJob}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.accent },
          pressed && styles.pressed,
        ]}
      >
        <ThemedText
          type="default"
          style={[styles.primaryLabel, { color: theme.onAccent }]}
        >
          {t('newJob')}
        </ThemedText>
      </Pressable>

      {jobs.length === 0 ? (
        <ThemedView
          type="backgroundElement"
          style={[styles.empty, { borderColor: theme.border }]}
        >
          <ThemedText
            type="default"
            themeColor="textSecondary"
            style={styles.emptyText}
          >
            {t('noJobsYet')}
          </ThemedText>
        </ThemedView>
      ) : (
        visibleJobs.map((job) => {
          const status = statusMeta(job, userId, t, theme);
          return (
            <View
              key={job.id}
              style={[
                styles.row,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${job.property}, ${job.unit}, ${status.label}`}
                onPress={() => onOpenJob(job.id)}
                style={({ pressed }) => [
                  styles.rowCopy,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText type="heading" style={styles.rowTitle}>
                  {job.unit}
                </ThemedText>
                <ThemedText themeColor="textSecondary">
                  {job.property}
                </ThemedText>
                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: status.background },
                    ]}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{ color: status.color }}
                    >
                      {status.label}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {totalPhotos(job.rooms)} {t('photosCount')}
                  </ThemedText>
                </View>
                {isJobSent(job, userId) ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('sentAwaitingReview')}
                  </ThemedText>
                ) : null}
              </Pressable>
              <View style={styles.rowMenu}>
                <OverflowButton open={optionsId === job.id}
                  label={`${t('moreOptions')}: ${job.unit}`}
                  onPress={() => setOptionsId(optionsId === job.id ? null : job.id)} />
              </View>
              {optionsId === job.id ? <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('deleteJob')}: ${job.property}, ${job.unit}`}
                style={styles.deleteHit}
                onPress={() =>
                  Alert.alert(
                    t('confirmDelete'),
                    `${job.property} · ${job.unit}`,
                    [
                      { text: t('cancel'), style: 'cancel' },
                      {
                        text: t('deleteJob'),
                        style: 'destructive',
                        onPress: () => onDeleteJob(job.id),
                      },
                    ],
                  )
                }
              >
                <ThemedText type="small" themeColor="textSecondary">
                  {t('deleteJob')}
                </ThemedText>
              </Pressable> : null}
            </View>
          );
        })
      )}
      {sentJobs.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSent }}
          onPress={() => setShowSent(value => !value)} style={styles.deleteHit}>
          <ThemedText type="smallBold" themeColor="accentText">
            {t('sentJobs')} ({sentJobs.length}) {showSent ? '−' : '+'}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  primaryLabel: {
    fontWeight: '700',
    fontSize: 17,
  },
  empty: {
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
  },
  row: {
    minHeight: 88,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  rowMenu: { position: 'absolute', top: 8, right: 8 },
  rowCopy: {
    paddingRight: 40,
    flex: 1,
    gap: Spacing.one,
  },
  rowTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
    flexWrap: 'wrap',
  },
  statusPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    minHeight: 28,
    justifyContent: 'center',
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  deleteHit: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  chevron: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
  },
  pressed: {
    opacity: 0.88,
  },
});
