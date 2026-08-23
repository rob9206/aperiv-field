import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KanbanBoard } from '@/components/dashboard/KanbanBoard';
import { MetricsRow } from '@/components/dashboard/MetricsRow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useTheme } from '@/hooks/use-theme';
import {
  buildUnitsExportCsv,
  DEFAULT_DASHBOARD_PROPERTY_ID,
} from '@/lib/dashboard-data';
import { useLocale } from '@/providers/locale-provider';

export default function DashboardPage() {
  const theme = useTheme();
  const { t } = useLocale();
  const { metrics, columns, loading, error } = useDashboardData(
    DEFAULT_DASHBOARD_PROPERTY_ID
  );

  const onExport = useCallback(() => {
    const units = [
      ...columns.toDo,
      ...columns.inProgress,
      ...columns.needsReview,
      ...columns.approved,
    ];
    const csv = buildUnitsExportCsv(units);
    void Share.share({ message: csv, title: t('exportReport') }).catch(() => {
      Alert.alert(t('exportFailed'));
    });
  }, [columns, t]);

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary">{t('dashboardLoading')}</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="danger">{t('dashboardError')}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="heading" style={styles.title}>
              Sunset Apartments
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={onExport}
              style={({ pressed }) => [
                styles.exportButton,
                { backgroundColor: theme.accent },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={styles.exportLabel}>
                {t('exportReport')}
              </ThemedText>
            </Pressable>
          </View>

          <MetricsRow
            metrics={metrics}
            labels={{
              totalProgress: t('totalProgress'),
              awaitingReview: t('awaitingReview'),
              totalSqftVerified: t('totalSqftVerified'),
              activeCrew: t('activeCrew'),
            }}
          />
          <KanbanBoard
            columns={columns}
            labels={{
              columnToDo: t('columnToDo'),
              columnInProgress: t('columnInProgress'),
              columnNeedsReview: t('columnNeedsReview'),
              columnApproved: t('columnApproved'),
              unassigned: t('unassigned'),
              crewLabel: t('crewLabel'),
              unit: t('unit'),
            }}
          />
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  title: {
    flex: 1,
    fontSize: 28,
    lineHeight: 34,
  },
  exportButton: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportLabel: {
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.88,
  },
});
