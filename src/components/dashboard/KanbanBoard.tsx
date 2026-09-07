import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DashboardUnit as Unit, DashboardColumns } from '@/lib/dashboard-data';

export type KanbanLabels = {
  columnToDo: string;
  columnInProgress: string;
  columnNeedsReview: string;
  columnApproved: string;
  unassigned: string;
  crewLabel: string;
  unit: string;
};

type KanbanBoardProps = {
  columns: DashboardColumns;
  labels: KanbanLabels;
};

function statusBadge(unit: Unit, labels: KanbanLabels) {
  switch (unit.status) {
    case 'to_do':
      return { text: labels.unassigned, tone: 'textSecondary' as const };
    case 'in_progress':
      return { text: labels.columnInProgress, tone: 'accent' as const };
    case 'needs_review':
      return { text: labels.columnNeedsReview, tone: 'warning' as const };
    case 'approved':
      return { text: labels.columnApproved, tone: 'success' as const };
  }
}

function UnitCard({ unit, labels }: { unit: Unit; labels: KanbanLabels }) {
  const theme = useTheme();
  const badge = statusBadge(unit, labels);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor:
            unit.status === 'needs_review' ? theme.accent : theme.border,
        },
      ]}>
      <View style={styles.cardHeader}>
        <ThemedText type="smallBold">
          {labels.unit} {unit.unit_number}
        </ThemedText>
        <ThemedText type="small" themeColor={badge.tone}>
          {badge.text}
        </ThemedText>
      </View>
      {unit.assigned_to ? (
        <ThemedText type="small" themeColor="textSecondary">
          {labels.crewLabel}: {unit.assigned_to}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Column({
  title,
  units,
  labels,
}: {
  title: string;
  units: Unit[];
  labels: KanbanLabels;
}) {
  const theme = useTheme();

  return (
    <View style={styles.column}>
      <View style={styles.columnHeader}>
        <ThemedText type="heading">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {units.length}
        </ThemedText>
      </View>
      <View
        style={[
          styles.columnBody,
          { backgroundColor: theme.backgroundSelected },
        ]}>
        {units.map((unit) => (
          <UnitCard key={unit.id} unit={unit} labels={labels} />
        ))}
      </View>
    </View>
  );
}

export function KanbanBoard({ columns, labels }: KanbanBoardProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.board}>
      <Column title={labels.columnToDo} units={columns.toDo} labels={labels} />
      <Column
        title={labels.columnInProgress}
        units={columns.inProgress}
        labels={labels}
      />
      <Column
        title={labels.columnNeedsReview}
        units={columns.needsReview}
        labels={labels}
      />
      <Column
        title={labels.columnApproved}
        units={columns.approved}
        labels={labels}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  board: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  column: {
    width: 280,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  columnBody: {
    minHeight: 360,
    borderRadius: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  card: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
});
