import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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

function statusLabel(
  draft: ManualWalkthroughDraft,
  t: (key: 'jobDone' | 'jobInProgress' | 'jobVerified' | 'jobUnverified') => string
): string {
  if (draft.completedAt) {
    if (draft.verificationStatus === 'verified') {
      return t('jobVerified');
    }
    return t('jobUnverified');
  }
  return t('jobInProgress');
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
        <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
          {t('newJob')}
        </ThemedText>
      </Pressable>

      {jobs.length === 0 ? (
        <ThemedView type="backgroundElement" style={styles.empty}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('noJobsYet')}
          </ThemedText>
        </ThemedView>
      ) : (
        jobs.map((job) => (
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
              <ThemedText type="smallBold">
                {job.property} · {job.unit}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {statusLabel(job, t)} · {totalPhotos(job.rooms)}{' '}
                {t('photosCount')}
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
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
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  empty: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  row: {
    minHeight: 56,
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
    gap: 2,
  },
  pressed: {
    opacity: 0.85,
  },
});
