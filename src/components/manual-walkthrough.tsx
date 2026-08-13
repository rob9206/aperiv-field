import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { LanguageToggle } from '@/components/language-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  canAdvanceRoom,
  ISSUE_PART_KEYS,
  type IssuePartKey,
  type RoomAdvanceBlock,
} from '@/lib/guide-steps';
import { defaultRoomNames, type TranslationKey } from '@/lib/i18n';
import {
  loadDraftStore,
  mutateDraftById,
  mutateDraftStore,
} from '@/lib/draft-store';
import {
  createDraft,
  createRoom,
  draftCanBeVerified,
  legacyCompatibilitySqft,
  persistPhoto,
  recordedSqftValue,
  roomHasVerifiedScan,
  scanMeasuredSqft,
  type DraftStore,
  type ManualWalkthroughDraft,
  type RoomCapture,
  type RoomCondition,
  type VerificationStatus,
} from '@/lib/walkthrough-draft';
import { useLocale } from '@/providers/locale-provider';

type ScreenStep = 'checkin' | 'roomGuide' | 'done';

export type ScanTarget = {
  draftId: string;
  roomId: string;
};

type ManualWalkthroughProps = {
  onOpenLidar?: (target: ScanTarget) => void;
  lidarAvailable?: boolean;
  manualUnverified?: boolean;
  onStartAnother?: () => void;
};

const CONDITIONS: RoomCondition[] = ['good', 'watch', 'issue'];

function GuideButton({
  label,
  onPress,
  disabled = false,
  accent,
  onAccent,
  secondary = false,
  border,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent: string;
  onAccent: string;
  secondary?: boolean;
  border?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        secondary
          ? {
              backgroundColor: 'transparent',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: border ?? accent,
            }
          : { backgroundColor: accent },
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      <ThemedText
        type="default"
        style={[
          styles.primaryButtonLabel,
          { color: secondary ? accent : onAccent },
        ]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function RoomSegments({
  count,
  index,
  fill,
  track,
}: {
  count: number;
  index: number;
  fill: string;
  track: string;
}) {
  return (
    <View style={styles.segmentRow}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            { backgroundColor: i <= index ? fill : track },
          ]}
        />
      ))}
    </View>
  );
}

export function ManualWalkthrough({
  onOpenLidar,
  lidarAvailable = false,
  manualUnverified = false,
  onStartAnother,
}: ManualWalkthroughProps) {
  const theme = useTheme();
  const { t, locale } = useLocale();
  const params = useLocalSearchParams<{ mode?: string; id?: string }>();

  const [screenStep, setScreenStep] = useState<ScreenStep>('checkin');
  const [store, setStore] = useState<DraftStore | null>(null);
  const storeRef = useRef<DraftStore | null>(null);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [propertyName, setPropertyName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [recordedSqft, setRecordedSqft] = useState('');

  const draft = store?.activeDraftId
    ? (store.drafts[store.activeDraftId] ?? null)
    : null;
  const storeReady = store !== null;

  const roomIndex = draft?.guideRoomIndex ?? 0;
  const room = draft?.rooms[roomIndex] ?? null;
  const nextRoom = draft?.rooms[roomIndex + 1] ?? null;
  const roomVerified = room ? roomHasVerifiedScan(room) : false;
  const previousRoomMeasurement =
    !roomVerified &&
    typeof room?.measuredSqftFromScan === 'number' &&
    Number.isFinite(room.measuredSqftFromScan) &&
    room.measuredSqftFromScan > 0
      ? room.measuredSqftFromScan
      : 0;
  const lidarRequired = lidarAvailable && !manualUnverified;

  const measured = useMemo(
    () => (draft ? scanMeasuredSqft(draft.rooms) : 0),
    [draft]
  );
  const previousUnverifiedMeasured = useMemo(
    () => (draft ? legacyCompatibilitySqft(draft) : 0),
    [draft]
  );
  const recorded = draft ? recordedSqftValue(draft) : null;

  const inputStyle = {
    backgroundColor: theme.background,
    color: theme.text,
    borderColor: theme.border,
  };

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      try {
        let next: DraftStore;
        let nextStep: ScreenStep = 'checkin';

        if (params.mode === 'resume' && params.id) {
          const selected = await mutateDraftStore<ScreenStep>((current) => {
            const target = current.drafts[params.id!];
            if (!target) {
              return null;
            }
            return {
              store: { ...current, activeDraftId: params.id! },
              value: target.completedAt ? 'done' : 'roomGuide',
            };
          });
          next = selected?.store ?? (await loadDraftStore());
          nextStep = selected?.value ?? 'checkin';
        } else if (params.mode === 'new') {
          const selected = await mutateDraftStore<ScreenStep>((current) => {
            const activeId = current.activeDraftId;
            const active = activeId ? current.drafts[activeId] : null;
            const inProgress =
              !!active &&
              !active.completedAt &&
              (active.guidePhase != null ||
                active.rooms.some(
                  (item) => item.scanned || item.photos.length > 0
                ));
            return {
              store: inProgress
                ? current
                : { ...current, activeDraftId: null },
              value: inProgress ? 'roomGuide' : 'checkin',
            };
          });
          next = selected!.store;
          nextStep = selected!.value;
        } else {
          next = await loadDraftStore();
          const activeId = next.activeDraftId;
          const active = activeId ? next.drafts[activeId] : null;
          nextStep = active
            ? active.completedAt
              ? 'done'
              : 'roomGuide'
            : 'checkin';
        }

        if (!mounted) {
          return;
        }
        storeRef.current = next;
        setStore(next);
        setScreenStep(nextStep);
      } catch {
        if (!mounted) {
          return;
        }
        const empty: DraftStore = { activeDraftId: null, drafts: {} };
        storeRef.current = empty;
        setStore(empty);
        setHydrateError(t('restoreFailed'));
      }
    };

    void hydrate();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount on route params only
  }, [params.mode, params.id]);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const applyCommittedStore = (next: DraftStore) => {
    storeRef.current = next;
    setStore(next);
  };

  const persistDraftMutation = async (
    draftId: string,
    mutation: (
      latest: ManualWalkthroughDraft
    ) => ManualWalkthroughDraft | null
  ) => {
    setSavedMessage(null);
    try {
      const committed = await mutateDraftById(draftId, (latest) => {
        const next = mutation(latest);
        return next === null ? null : { draft: next, value: undefined };
      });
      if (committed) {
        applyCommittedStore(committed.store);
      }
      return committed;
    } catch {
      setHydrateError(t('saveFailed'));
      return null;
    }
  };

  const updateRoomById = (
    draftId: string,
    roomId: string,
    mutation: (latest: RoomCapture) => RoomCapture
  ) =>
    persistDraftMutation(draftId, (latest) => {
      let found = false;
      const rooms = latest.rooms.map((item) => {
        if (item.id !== roomId) {
          return item;
        }
        found = true;
        return mutation(item);
      });
      if (!found) {
        return null;
      }
      return {
        ...latest,
        rooms,
        completedAt: undefined,
        guidePhase: 'room',
      };
    });

  const patchRoom = (patch: Partial<NonNullable<typeof room>>) => {
    if (!draft || !room) {
      return;
    }
    void updateRoomById(draft.id, room.id, (latest) => ({
      ...latest,
      ...patch,
      skipped: false,
    }));
  };

  const startJob = () => {
    if (!store || !propertyName.trim() || !unitNumber.trim()) {
      return;
    }
    onStartAnother?.();
    const next = createDraft(
      propertyName,
      unitNumber,
      recordedSqft,
      defaultRoomNames(locale)
    );
    void mutateDraftStore((current) => ({
      store: {
        activeDraftId: next.id,
        drafts: { ...current.drafts, [next.id]: next },
      },
      value: undefined,
    }))
      .then((committed) => {
        if (!committed) {
          return;
        }
        applyCommittedStore(committed.store);
        router.setParams({ mode: 'resume', id: next.id });
        setPropertyName('');
        setUnitNumber('');
        setRecordedSqft('');
        setScreenStep('roomGuide');
      })
      .catch(() => {
        setHydrateError(t('saveFailed'));
      });
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    const current = storeRef.current;
    const draftId = current?.activeDraftId;
    const active = draftId ? current?.drafts[draftId] : null;
    const roomId = active?.rooms[active.guideRoomIndex ?? 0]?.id;
    if (!draftId || !roomId) {
      return;
    }
    setPhotoError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(t('cameraDenied'));
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              allowsMultipleSelection: true,
              selectionLimit: 8,
            });
      if (result.canceled) {
        return;
      }
      const added = result.assets.map((asset) =>
        persistPhoto(draftId, asset.uri)
      );
      await updateRoomById(draftId, roomId, (latest) => ({
        ...latest,
        photos: [...latest.photos, ...added],
        skipped: false,
      }));
    } catch {
      setPhotoError(t('photoFailed'));
    }
  };

  const removePhoto = (photoId: string) => {
    if (!draft || !room) {
      return;
    }
    void updateRoomById(draft.id, room.id, (latest) => ({
      ...latest,
      photos: latest.photos.filter((entry) => entry.id !== photoId),
    }));
  };

  const goBackStep = () => {
    if (screenStep === 'done' && draft && !draft.completedAt) {
      setScreenStep('roomGuide');
      return;
    }
    if (screenStep !== 'roomGuide' || !draft) {
      return;
    }
    if (roomIndex > 0 && room) {
      void persistDraftMutation(draft.id, (latest) => {
        const latestIndex = latest.rooms.findIndex(
          (item) => item.id === room.id
        );
        if (latestIndex <= 0) {
          return null;
        }
        return {
          ...latest,
          guideRoomIndex: latestIndex - 1,
          guidePhase: 'room',
          completedAt: undefined,
        };
      });
      return;
    }
    setScreenStep('checkin');
  };

  const goNextRoomOrFinish = () => {
    if (!draft || !room) {
      return;
    }
    const block = canAdvanceRoom(room, lidarRequired);
    if (block === 'photo') {
      setPhotoError(t('photoRequired'));
      return;
    }
    if (block === 'scan') {
      setPhotoError(t('scanRequired'));
      return;
    }
    setPhotoError(null);
    void mutateDraftById<{
      block: RoomAdvanceBlock;
      finished: boolean;
    }>(draft.id, (latest) => {
      const latestIndex = latest.rooms.findIndex(
        (item) => item.id === room.id
      );
      if (latestIndex < 0) {
        return null;
      }
      const latestRoom = latest.rooms[latestIndex];
      const latestBlock = canAdvanceRoom(latestRoom, lidarRequired);
      if (latestBlock !== 'ok') {
        return {
          draft: latest,
          value: { block: latestBlock, finished: false },
        };
      }
      const finished = latestIndex >= latest.rooms.length - 1;
      return {
        draft: {
          ...latest,
          guideRoomIndex: finished ? latestIndex : latestIndex + 1,
          guidePhase: 'room',
          completedAt: undefined,
        },
        value: { block: 'ok', finished },
      };
    })
      .then((committed) => {
        if (!committed) {
          return;
        }
        applyCommittedStore(committed.store);
        if (committed.value.block === 'photo') {
          setPhotoError(t('photoRequired'));
        } else if (committed.value.block === 'scan') {
          setPhotoError(t('scanRequired'));
        } else if (committed.value.finished) {
          setScreenStep('done');
        }
      })
      .catch(() => {
        setHydrateError(t('saveFailed'));
      });
  };

  const skipRoom = () => {
    if (!draft || !room) {
      return;
    }
    void mutateDraftById(draft.id, (latest) => {
      const latestIndex = latest.rooms.findIndex(
        (item) => item.id === room.id
      );
      if (latestIndex < 0) {
        return null;
      }
      const finished = latestIndex >= latest.rooms.length - 1;
      return {
        draft: {
          ...latest,
          rooms: latest.rooms.map((item) =>
            item.id === room.id ? { ...item, skipped: true } : item
          ),
          guideRoomIndex: finished ? latestIndex : latestIndex + 1,
          guidePhase: 'room',
          completedAt: undefined,
          verificationStatus: 'unverified',
        },
        value: { finished },
      };
    })
      .then((committed) => {
        if (!committed) {
          return;
        }
        applyCommittedStore(committed.store);
        if (committed.value.finished) {
          setScreenStep('done');
        }
      })
      .catch(() => {
        setHydrateError(t('saveFailed'));
      });
  };

  const addRoom = () => {
    if (!draft) {
      return;
    }
    void persistDraftMutation(draft.id, (latest) => ({
      ...latest,
      rooms: [...latest.rooms, createRoom('')],
      completedAt: undefined,
      guidePhase: 'room',
      verificationStatus: 'unverified',
    }));
  };

  const setCondition = (condition: RoomCondition) => {
    if (!draft || !room) {
      return;
    }
    void updateRoomById(draft.id, room.id, (latest) => ({
      ...latest,
      condition,
      hasDamage: condition !== 'good',
      issueParts: condition === 'good' ? [] : latest.issueParts ?? [],
      skipped: false,
    }));
  };

  const togglePart = (part: IssuePartKey) => {
    if (!draft || !room) {
      return;
    }
    void updateRoomById(draft.id, room.id, (latest) => {
      const current = latest.issueParts ?? [];
      const next = current.includes(part)
        ? current.filter((item) => item !== part)
        : [...current, part];
      return {
        ...latest,
        issueParts: next,
        hasDamage: latest.condition !== 'good' || next.length > 0,
        skipped: false,
      };
    });
  };

  const saveJob = (status: VerificationStatus) => {
    if (!draft) {
      return;
    }
    void persistDraftMutation(draft.id, (latest) => {
      const verifiedOk =
        status === 'verified' &&
        draftCanBeVerified(latest) &&
        lidarAvailable &&
        !manualUnverified;
      const totalMeasured = scanMeasuredSqft(latest.rooms);
      return {
        ...latest,
        completedAt: new Date().toISOString(),
        verificationStatus: verifiedOk ? 'verified' : 'unverified',
        measuredSqftFromScan:
          totalMeasured > 0 ? totalMeasured : undefined,
      };
    }).then((committed) => {
      if (committed) {
        setSavedMessage(t('savedOnDevice'));
        setScreenStep('done');
      }
    });
  };

  const canSaveVerified =
    !!draft &&
    lidarAvailable &&
    !manualUnverified &&
    draftCanBeVerified(draft);

  const showGuideBack =
    screenStep === 'roomGuide' ||
    (screenStep === 'done' && draft && !draft.completedAt);

  const selectedParts = room?.issueParts ?? [];
  const showParts = room != null && room.condition !== 'good';
  const showOtherNote = selectedParts.includes('partOther');
  const firstSelectedPart = selectedParts[0] as IssuePartKey | undefined;
  const photoHint =
    showParts && firstSelectedPart
      ? `${t('photoHintGet')} ${t(firstSelectedPart as TranslationKey)}`
      : room
        ? `${room.photos.length} ${t('photosTaken')}`
        : '';

  const nextLabel =
    room && draft && roomIndex >= draft.rooms.length - 1
      ? t('finishJob')
      : nextRoom
        ? `${t('nextRoomNamed')} ${nextRoom.name || t('rooms')}`
        : t('nextRoom');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          {showGuideBack ? (
            <Pressable
              accessibilityRole="button"
              onPress={goBackStep}
              style={styles.backHit}>
              <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                ‹ {t('back')}
              </ThemedText>
            </Pressable>
          ) : (
            <View />
          )}
          <LanguageToggle />
        </View>

        {hydrateError ? (
          <ThemedText type="default" style={{ color: theme.danger }}>
            {hydrateError}
          </ThemedText>
        ) : null}

        {screenStep === 'checkin' && (
          <ThemedView
            type="backgroundElement"
            style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="heading" style={styles.prompt}>
              {t('checkIn')}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              {!lidarAvailable ? t('noLidarDevice') : t('scanRequired')}
            </ThemedText>
            <View style={styles.fieldGroup}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('property')}
              </ThemedText>
              <TextInput
                style={[styles.input, inputStyle]}
                placeholder={t('property')}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                value={propertyName}
                onChangeText={setPropertyName}
              />
            </View>
            <View style={styles.fieldGroup}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('unit')}
              </ThemedText>
              <TextInput
                style={[styles.input, inputStyle]}
                placeholder={t('unit')}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                value={unitNumber}
                onChangeText={setUnitNumber}
              />
            </View>
            <View style={styles.fieldGroup}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('recordedSqftOptional')}
              </ThemedText>
              <TextInput
                style={[styles.input, inputStyle]}
                placeholder="1210"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                value={recordedSqft}
                onChangeText={setRecordedSqft}
              />
            </View>
            <GuideButton
              label={storeReady ? t('startJob') : t('loading')}
              onPress={startJob}
              disabled={
                !storeReady || !propertyName.trim() || !unitNumber.trim()
              }
              accent={theme.accent}
              onAccent={theme.onAccent}
            />
          </ThemedView>
        )}

        {screenStep === 'roomGuide' && draft && room && (
          <ThemedView
            type="backgroundElement"
            style={[styles.card, { borderColor: theme.border }]}>
            <View style={styles.guideMeta}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {draft.property} · {t('unit')} {draft.unit}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('roomStep')} {roomIndex + 1} {t('ofWord')}{' '}
                {draft.rooms.length}
              </ThemedText>
            </View>
            <RoomSegments
              count={draft.rooms.length}
              index={roomIndex}
              fill={theme.accent}
              track={theme.backgroundSelected}
            />
            <ThemedText type="heading" style={styles.roomTitle}>
              {room.name || t('rooms')}
            </ThemedText>

            {manualUnverified ? (
              <ThemedText type="default" style={{ color: theme.warning }}>
                {t('manualUnverifiedNotice')}
              </ThemedText>
            ) : null}

            {lidarAvailable ? (
              <View style={styles.section}>
                {roomVerified ? (
                  <View
                    style={[
                      styles.scanDoneRow,
                      { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <ThemedText type="default" style={styles.scanDoneLabel}>
                      ✓{' '}
                      {Math.round(room.scanArtifact!.measuredSqft)}{' '}
                      {t('squareFeetShort')}
                    </ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        onOpenLidar?.({ draftId: draft.id, roomId: room.id })
                      }
                      style={[
                        styles.againChip,
                        { borderColor: theme.accent },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.accentText }}>
                        {t('scanAgain')}
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <GuideButton
                      label={t('scanRoom')}
                      onPress={() =>
                        onOpenLidar?.({ draftId: draft.id, roomId: room.id })
                      }
                      accent={theme.accent}
                      onAccent={theme.onAccent}
                    />
                    {previousRoomMeasurement > 0 ? (
                      <ThemedText
                        type="smallBold"
                        style={[styles.centerHint, { color: theme.warning }]}>
                        {t('previousUnverifiedMeasurement')}:{' '}
                        {Math.round(previousRoomMeasurement)}{' '}
                        {t('squareFeetShort')}
                      </ThemedText>
                    ) : null}
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.centerHint}>
                      {t('scanMeasuresHint')}
                    </ThemedText>
                  </>
                )}
              </View>
            ) : null}

            <View style={styles.section}>
              <ThemedText type="default" style={styles.sectionTitle}>
                {t('condition')}
              </ThemedText>
              <View style={styles.readyRow}>
                {CONDITIONS.map((condition) => {
                  const selected = room.condition === condition;
                  const label =
                    condition === 'good'
                      ? t('conditionGood')
                      : condition === 'watch'
                        ? t('conditionWatch')
                        : t('conditionIssue');
                  const border =
                    condition === 'good'
                      ? theme.accent
                      : condition === 'watch'
                        ? theme.warning
                        : theme.danger;
                  return (
                    <Pressable
                      key={condition}
                      onPress={() => setCondition(condition)}
                      style={({ pressed }) => [
                        styles.readyChip,
                        {
                          borderColor: selected ? border : theme.border,
                          backgroundColor: selected
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                        },
                        pressed && styles.buttonPressed,
                      ]}>
                      <ThemedText type="smallBold" style={styles.readyLabel}>
                        {label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {room.condition === 'good' ? (
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.centerHint}>
                  {t('roomReadyHint')}
                </ThemedText>
              ) : null}
            </View>

            {showParts ? (
              <View style={styles.section}>
                <ThemedText type="default" style={styles.sectionTitle}>
                  {t('whatNeedsFixing')}
                </ThemedText>
                <View style={styles.partsRow}>
                  {ISSUE_PART_KEYS.map((part) => {
                    const on = selectedParts.includes(part);
                    return (
                      <Pressable
                        key={part}
                        onPress={() => togglePart(part)}
                        style={({ pressed }) => [
                          styles.partChip,
                          {
                            backgroundColor: on
                              ? theme.dangerFill
                              : theme.backgroundElement,
                            borderColor: on ? theme.dangerFill : theme.border,
                          },
                          pressed && styles.buttonPressed,
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{
                            color: on ? theme.onDangerFill : theme.text,
                          }}>
                          {on ? '✓ ' : ''}
                          {t(part)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
                {showOtherNote ? (
                  <TextInput
                    style={[styles.input, styles.notesInput, inputStyle]}
                    placeholder={t('damageNotes')}
                    placeholderTextColor={theme.textSecondary}
                    value={room.notes}
                    multiline
                    textAlignVertical="top"
                    onChangeText={(notes) => patchRoom({ notes })}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.photoHeader}>
                <ThemedText type="smallBold">{t('photosCount')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {photoHint}
                </ThemedText>
              </View>
              {photoError ? (
                <ThemedText type="default" style={{ color: theme.danger }}>
                  {photoError}
                </ThemedText>
              ) : null}
              <View style={styles.photoRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void addPhoto('camera');
                  }}
                  style={[
                    styles.addPhotoTile,
                    { backgroundColor: theme.text },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: theme.onAccent }}>
                    {t('addPhoto')}
                  </ThemedText>
                </Pressable>
                {room.photos.map((photo) => (
                  <View key={photo.id} style={styles.photoWrap}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={styles.photoThumb}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('removePhoto')}
                      hitSlop={8}
                      onPress={() => removePhoto(photo.id)}
                      style={[
                        styles.photoRemove,
                        { backgroundColor: theme.dangerFill },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: theme.onDangerFill }}>
                        ×
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
              </View>
              <Pressable
                onPress={() => {
                  void addPhoto('library');
                }}
                style={styles.linkButton}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('addFromLibrary')}
                </ThemedText>
              </Pressable>
            </View>

            <GuideButton
              label={nextLabel}
              onPress={goNextRoomOrFinish}
              accent={theme.accent}
              onAccent={theme.onAccent}
            />
            <GuideButton
              label={t('skipRoom')}
              onPress={skipRoom}
              accent={theme.accentText}
              onAccent={theme.onAccent}
              secondary
              border={theme.border}
            />
            <Pressable onPress={addRoom} style={styles.linkButton}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('addRoom')}
              </ThemedText>
            </Pressable>
          </ThemedView>
        )}

        {screenStep === 'done' && draft && (
          <ThemedView
            type="backgroundElement"
            style={[styles.card, { borderColor: theme.border }]}>
            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor:
                    draft.verificationStatus === 'verified'
                      ? theme.successFill
                      : theme.warningFill,
                },
              ]}>
              <ThemedText
                type="heading"
                style={{
                  color:
                    draft.verificationStatus === 'verified'
                      ? theme.onSuccessFill
                      : theme.onWarningFill,
                }}>
                {draft.verificationStatus === 'verified'
                  ? t('jobVerified')
                  : t('jobUnverified')}
              </ThemedText>
            </View>
            <ThemedText type="heading" style={styles.doneUnit}>
              {draft.property}
            </ThemedText>
            <ThemedText type="default" themeColor="textSecondary">
              {t('unit')} {draft.unit}
            </ThemedText>
            <View
              style={[
                styles.measureBox,
                { backgroundColor: theme.backgroundSelected },
              ]}>
              <View style={styles.measureCols}>
                <View style={styles.measureCol}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('recordedSqftLabel')}
                  </ThemedText>
                  <ThemedText type="heading" style={styles.measureLine}>
                    {recorded !== null ? Math.round(recorded) : '—'}
                  </ThemedText>
                </View>
                <View style={styles.measureCol}>
                  <ThemedText type="small" style={{ color: theme.accentText }}>
                    {t('measuredSqftLabel')}
                  </ThemedText>
                  <ThemedText type="heading" style={styles.measureLine}>
                    {measured > 0 ? Math.round(measured) : '—'}
                  </ThemedText>
                </View>
              </View>
              {measured === 0 ? (
                <ThemedText type="default" themeColor="textSecondary">
                  {t('measuredPending')}
                </ThemedText>
              ) : null}
              {previousUnverifiedMeasured > 0 ? (
                <ThemedText type="smallBold" style={{ color: theme.warning }}>
                  {t('previousUnverifiedMeasurement')}:{' '}
                  {Math.round(previousUnverifiedMeasured)}{' '}
                  {t('squareFeetShort')}
                </ThemedText>
              ) : null}
            </View>
            {savedMessage ? (
              <ThemedText type="default" themeColor="textSecondary">
                {savedMessage}
              </ThemedText>
            ) : null}
            {!draft.completedAt ? (
              <>
                {canSaveVerified ? (
                  <GuideButton
                    label={t('saveVerified')}
                    onPress={() => saveJob('verified')}
                    accent={theme.accent}
                    onAccent={theme.onAccent}
                  />
                ) : null}
                <GuideButton
                  label={
                    canSaveVerified ? t('saveJob') : t('saveUnverified')
                  }
                  onPress={() => saveJob('unverified')}
                  accent={theme.accent}
                  onAccent={theme.onAccent}
                  secondary={canSaveVerified}
                  border={theme.border}
                />
              </>
            ) : (
              <>
                <GuideButton
                  label={t('startAnother')}
                  onPress={() => {
                    onStartAnother?.();
                    void mutateDraftStore((current) => ({
                      store: { ...current, activeDraftId: null },
                      value: undefined,
                    }))
                      .then((committed) => {
                        if (!committed) {
                          return;
                        }
                        applyCommittedStore(committed.store);
                        setScreenStep('checkin');
                        setSavedMessage(null);
                      })
                      .catch(() => {
                        setHydrateError(t('saveFailed'));
                      });
                  }}
                  accent={theme.accent}
                  onAccent={theme.onAccent}
                />
                <GuideButton
                  label={t('myJobs')}
                  onPress={() => router.replace('/')}
                  accent={theme.accentText}
                  onAccent={theme.onAccent}
                  secondary
                  border={theme.border}
                />
              </>
            )}
          </ThemedView>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  backHit: {
    minHeight: MinTouchTarget,
    justifyContent: 'center',
    paddingRight: Spacing.two,
  },
  card: {
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
  guideMeta: {
    gap: Spacing.one,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 999,
  },
  roomTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 18,
  },
  centerHint: {
    textAlign: 'center',
  },
  scanDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 52,
  },
  scanDoneLabel: {
    fontWeight: '700',
    fontSize: 18,
  },
  againChip: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  readyChip: {
    flex: 1,
    minHeight: 88,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  readyLabel: {
    textAlign: 'center',
    fontSize: 14,
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
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    minHeight: 52,
  },
  notesInput: {
    minHeight: 96,
  },
  photoWrap: {
    position: 'relative',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  primaryButtonLabel: {
    fontWeight: '700',
    fontSize: 17,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  addPhotoTile: {
    width: 82,
    height: 82,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoThumb: {
    width: 82,
    height: 82,
    borderRadius: 14,
  },
  linkButton: {
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBanner: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  doneUnit: {
    fontSize: 24,
    lineHeight: 30,
  },
  measureBox: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  measureCols: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  measureCol: {
    flex: 1,
    gap: Spacing.one,
  },
  measureLine: {
    fontSize: 28,
    lineHeight: 34,
  },
  prompt: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
});
