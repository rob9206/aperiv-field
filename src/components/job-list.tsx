import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  onNewJob: () => void;
  onOpenJob: (id: string) => void;
  onDeleteJob: (id: string) => void;
};

function statusMeta(
  draft: ManualWalkthroughDraft,
  t: (key: 'jobInProgress' | 'jobVerified' | 'jobUnverified') => string,
  theme: ReturnType<typeof useTheme>
): { label: string; background: string; color: string } {
  if (draft.completedAt) {
    if (draft.verificationStatus === 'verified') {
      return {
        label: t('jobVerified'),
        background: theme.successFill,
        color: theme.onSuccessFill,
      };
    }
    return {
      label: t('jobUnverified'),
      background: theme.warningFill,
      color: theme.onWarningFill,
    };
  }
  return {
    label: t('jobInProgress'),
    background: theme.backgroundSelected,
    color: theme.text,
  };
}

export function JobList({
  store,
  onNewJob,
  onOpenJob,
  onDeleteJob,
}: JobListProps) {
  const theme = useTheme();
  const { t } = useLocale();
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );

  const jobs = Object.values(store.drafts).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        onPress={onNewJob}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.accent },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="default" style={styles.primaryLabel}>
          {t('newJob')}
        </ThemedText>
      </Pressable>

      {jobs.length === 0 ? (
        <ThemedView
          type="backgroundElement"
          style={[styles.empty, { borderColor: theme.border }]}>
          <ThemedText type="default" themeColor="textSecondary" style={styles.emptyText}>
            {t('noJobsYet')}
          </ThemedText>
        </ThemedView>
      ) : (
        jobs.map((job) => {
          const status = statusMeta(job, t, theme);
          return (
            <Pressable
              key={job.id}
              accessibilityRole="button"
              onPress={() => onOpenJob(job.id)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <View style={styles.rowCopy}>
                <ThemedText type="heading" style={styles.rowTitle}>
                  {job.property}
                </ThemedText>
                <ThemedText type="default" themeColor="textSecondary">
                  {t('unit')} {job.unit}
                </ThemedText>
                <View style={styles.metaRow}>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: status.background },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={{ color: status.color }}>
                      {status.label}
                    </ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    {totalPhotos(job.rooms)} {t('photosCount')}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.rowActions}>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={12}
                  style={styles.deleteHit}
                  onPress={() => {
                    if (confirmingDeleteId !== job.id) {
                      setConfirmingDeleteId(job.id);
                      return;
                    }
                    setConfirmingDeleteId(null);
                    onDeleteJob(job.id);
                  }}>
                  <ThemedText type="smallBold" style={{ color: theme.danger }}>
                    {confirmingDeleteId === job.id
                      ? t('confirmDelete')
                      : t('deleteJob')}
                  </ThemedText>
                </Pressable>
                <ThemedText
                  type="heading"
                  themeColor="textSecondary"
                  style={styles.chevron}>
                  ›
                </ThemedText>
              </View>
            </Pressable>
          );
        })
      )}
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
    color: '#FFFFFF',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  rowTitle: {
    fontSize: 20,
    lineHeight: 26,
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
