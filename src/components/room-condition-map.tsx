import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { RoomNotesField } from '@/components/hold-to-talk';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ISSUE_PART_KEYS,
  type IssuePartKey,
} from '@/lib/guide-steps';
import { roomSummaryLine } from '@/lib/room-voice';
import type { RoomCapture, RoomCondition } from '@/lib/walkthrough-draft';
import { useLocale } from '@/providers/locale-provider';

function isPartKey(key: string): key is IssuePartKey {
  return (ISSUE_PART_KEYS as readonly string[]).includes(key);
}

function conditionKey(
  condition: RoomCondition
): 'conditionGood' | 'conditionWatch' | 'conditionIssue' {
  if (condition === 'watch') {
    return 'conditionWatch';
  }
  if (condition === 'issue') {
    return 'conditionIssue';
  }
  return 'conditionGood';
}

export function RoomConditionMap({
  rooms,
  onChangeNotes,
}: {
  rooms: RoomCapture[];
  onChangeNotes: (roomId: string, notes: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const [openId, setOpenId] = useState<string | null>(null);
  const openRoom = useMemo(
    () => rooms.find((room) => room.id === openId) ?? null,
    [openId, rooms]
  );

  const labels = {
    partLabel: (key: string) => (isPartKey(key) ? t(key) : key),
    readyHint: t('roomReadyHint'),
  };

  return (
    <View style={styles.section}>
      <ThemedText type="default" style={styles.sectionTitle}>
        {t('whatEachRoomNeeds')}
      </ThemedText>
      <View style={styles.grid}>
        {rooms.map((room) => {
          const colors = tileColors(room.condition, theme);
          return (
            <Pressable
              key={room.id}
              accessibilityRole="button"
              onPress={() => setOpenId(room.id)}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="smallBold"
                style={{ color: colors.color }}
                numberOfLines={1}>
                {room.name || t('rooms')}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: colors.color }}
                numberOfLines={1}>
                {t(conditionKey(room.condition))}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: colors.color, opacity: 0.9 }}
                numberOfLines={2}>
                {roomSummaryLine(room, labels)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={openRoom != null}
        animationType="slide"
        transparent
        onRequestClose={() => setOpenId(null)}>
        <View style={styles.sheetBackdrop}>
          <Pressable
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={() => setOpenId(null)}
          />
          {openRoom ? (
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}>
              <ScrollView
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled">
                <ThemedText type="heading" style={styles.sheetTitle}>
                  {openRoom.name || t('rooms')}
                </ThemedText>
                <ThemedText type="default" themeColor="textSecondary">
                  {t(conditionKey(openRoom.condition))}
                </ThemedText>
                {(openRoom.issueParts ?? []).filter(isPartKey).length > 0 ? (
                  <View style={styles.partsRow}>
                    {(openRoom.issueParts ?? []).filter(isPartKey).map((part) => (
                      <View
                        key={part}
                        style={[
                          styles.partChip,
                          {
                            backgroundColor: theme.dangerFill,
                          },
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{ color: theme.onDangerFill }}>
                          {t(part)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                ) : openRoom.condition === 'good' ? (
                  <ThemedText type="default" themeColor="textSecondary">
                    {t('roomReadyHint')}
                  </ThemedText>
                ) : null}
                {openRoom.photos.length > 0 ? (
                  <View style={styles.photoRow}>
                    {openRoom.photos.map((photo) => (
                      <Image
                        key={photo.id}
                        source={{ uri: photo.uri }}
                        style={styles.photoThumb}
                      />
                    ))}
                  </View>
                ) : null}
                <RoomNotesField
                  value={openRoom.notes}
                  onChange={(notes) => onChangeNotes(openRoom.id, notes)}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setOpenId(null)}
                  style={styles.closeHit}>
                  <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                    {t('closeRoom')}
                  </ThemedText>
                </Pressable>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function tileColors(
  condition: RoomCondition,
  theme: ReturnType<typeof useTheme>
): { background: string; border: string; color: string } {
  if (condition === 'good') {
    return {
      background: theme.successFill,
      border: theme.accent,
      color: theme.onSuccessFill,
    };
  }
  if (condition === 'issue') {
    return {
      background: theme.dangerFill,
      border: theme.dangerFill,
      color: theme.onDangerFill,
    };
  }
  return {
    background: theme.backgroundElement,
    border: theme.accent,
    color: theme.text,
  };
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 19,
    letterSpacing: -0.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 112,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.88,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(11, 17, 32, 0.45)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: Spacing.four,
  },
  sheetContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sheetTitle: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  partsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  partChip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  closeHit: {
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
