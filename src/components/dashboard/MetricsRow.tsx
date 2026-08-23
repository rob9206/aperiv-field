import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DashboardMetrics } from '@/lib/dashboard-data';

type MetricsRowProps = {
  metrics: DashboardMetrics;
};

const CARDS: {
  key: keyof DashboardMetrics;
  label: 'totalProgress' | 'awaitingReview' | 'totalSqftVerified' | 'activeCrew';
  tone: 'success' | 'warning' | 'text' | 'accent';
  format: (value: number) => string;
}[] = [
  {
    key: 'progress',
    label: 'totalProgress',
    tone: 'success',
    format: (value) => `${value}%`,
  },
  {
    key: 'awaitingReview',
    label: 'awaitingReview',
    tone: 'warning',
    format: (value) => String(value),
  },
  {
    key: 'totalSqft',
    label: 'totalSqftVerified',
    tone: 'text',
    format: (value) => value.toLocaleString(),
  },
  {
    key: 'activeCrew',
    label: 'activeCrew',
    tone: 'accent',
    format: (value) => String(value),
  },
];

export function MetricsRow({
  metrics,
  labels,
}: MetricsRowProps & { labels: Record<(typeof CARDS)[number]['label'], string> }) {
  const theme = useTheme();

  return (
    <View style={styles.grid}>
      {CARDS.map((card) => (
        <View
          key={card.key}
          style={[
            styles.card,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.border,
            },
          ]}>
          <ThemedText type="small" themeColor="textSecondary">
            {labels[card.label]}
          </ThemedText>
          <ThemedText
            type="heading"
            style={[styles.value, { color: theme[card.tone] }]}>
            {card.format(metrics[card.key])}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  card: {
    flexGrow: 1,
    flexBasis: 160,
    minHeight: 88,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  value: {
    fontSize: 28,
    lineHeight: 34,
  },
});
