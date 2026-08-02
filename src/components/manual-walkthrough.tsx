import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { nextGuidePhase } from '@/lib/guide-steps';
import { defaultRoomNames } from '@/lib/i18n';
import {
  createDraft,
  createRoom,
  draftHasScanMeasure,
  loadDraftStore,
  measuredSqft,
  persistPhoto,
  recordedSqftValue,
  saveDraftStore,
  type DraftStore,
  type GuidePhase,
  type ManualWalkthroughDraft,
  type RoomCondition,
  type VerificationStatus,
} from '@/lib/walkthrough-draft';
import { useLocale } from '@/providers/locale-provider';

type ScreenStep = 'checkin' | 'roomGuide' | 'done';

type ManualWalkthroughProps = {
  onOpenLidar?: () => void;
  lidarAvailable?: boolean;
  /** When parent finishes a RoomPlan session, mark current room scanned. */
  scanCompletedToken?: number;
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

function ProgressTrack({
  progress,
  track,
  fill,
}: {
  progress: number;
  track: string;
  fill: string;
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.progressTrack, { backgroundColor: track }]}>
      <View
        style={[
          styles.progressFill,
          { width: `${clamped * 100}%`, backgroundColor: fill },
        ]}
      />
    </View>
  );
}

export function ManualWalkthrough({
  onOpenLidar,
  lidarAvailable = false,
  scanCompletedToken = 0,
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
  const [showDamageNote, setShowDamageNote] = useState(false);

  const [propertyName, setPropertyName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [recordedSqft, setRecordedSqft] = useState('');

  const lastScanToken = useRef(0);

  const draft = store?.activeDraftId
    ? (store.drafts[store.activeDraftId] ?? null)
    : null;
  const storeReady = store !== null;

  const roomIndex = draft?.guideRoomIndex ?? 0;
  const phase: GuidePhase = draft?.guidePhase ?? 'arrive';
  const room = draft?.rooms[roomIndex] ?? null;

  const measured = useMemo(
    () => (draft ? measuredSqft(draft.rooms) : 0),
    [draft]
  );
  const recorded = draft ? recordedSqftValue(draft) : null;

  const inputStyle = {
    backgroundColor: theme.background,
    color: theme.text,
    borderColor: theme.border,
  };

  const conditionFill: Record<
    RoomCondition,
    { background: string; label: string }
  > = {
    good: { background: theme.successFill, label: theme.onSuccessFill },
    watch: { background: theme.warningFill, label: theme.onWarningFill },
    issue: { background: theme.dangerFill, label: theme.onDangerFill },
  };

  useEffect(() => {
    loadDraftStore().then(
      (loaded) => {
        let next = loaded;
        if (params.mode === 'new') {
          next = { ...loaded, activeDraftId: null };
          void saveDraftStore(next);
          setScreenStep('checkin');
        } else if (params.mode === 'resume' && params.id) {
          const target = loaded.drafts[params.id];
          if (target) {
            next = { ...loaded, activeDraftId: params.id };
            void saveDraftStore(next);
            setScreenStep(target.completedAt ? 'done' : 'roomGuide');
          }
        } else if (loaded.activeDraftId) {
          const active = loaded.drafts[loaded.activeDraftId];
          if (active) {
            setScreenStep(active.completedAt ? 'done' : 'roomGuide');
          }
        }
        storeRef.current = next;
        setStore(next);
      },
      () => {
        const empty: DraftStore = { activeDraftId: null, drafts: {} };
        storeRef.current = empty;
        setStore(empty);
        setHydrateError('Could not restore jobs on this device.');
      }
    );
  }, [params.mode, params.id]);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const persistStore = (next: DraftStore) => {
    setStore(next);
    setSavedMessage(null);
    void saveDraftStore(next).catch(() => {
      setHydrateError('Changes could not be saved on this device.');
    });
  };

  const persistDraft = (next: ManualWalkthroughDraft) => {
    setStore((current) => {
      if (!current) {
        return current;
      }
      const updated: DraftStore = {
        activeDraftId: next.id,
        drafts: { ...current.drafts, [next.id]: next },
      };
      void saveDraftStore(updated).catch(() => {
        setHydrateError('Changes could not be saved on this device.');
      });
      return updated;
    });
    setSavedMessage(null);
  };

  const updateGuide = (
    patch: Partial<ManualWalkthroughDraft>,
    roomsPatch?: ManualWalkthroughDraft['rooms']
  ) => {
    if (!draft) {
      return;
    }
    persistDraft({
      ...draft,
      ...patch,
      rooms: roomsPatch ?? draft.rooms,
      completedAt: undefined,
    });
  };

  const startJob = () => {
    if (!store || !propertyName.trim() || !unitNumber.trim()) {
      return;
    }
    const next = createDraft(
      propertyName,
      unitNumber,
      recordedSqft,
      defaultRoomNames(locale)
    );
    persistDraft(next);
    setPropertyName('');
    setUnitNumber('');
    setRecordedSqft('');
    setShowDamageNote(false);
    setScreenStep('roomGuide');
  };

  const advancePhase = (from: GuidePhase) => {
    if (!draft || !room) {
      return;
    }
    const next = nextGuidePhase(from, lidarAvailable);
    if (next === 'doneRoom') {
      return;
    }
    updateGuide({ guidePhase: next });
  };

  useEffect(() => {
    if (!scanCompletedToken || scanCompletedToken === lastScanToken.current) {
      return;
    }
    lastScanToken.current = scanCompletedToken;
    const current = storeRef.current;
    const activeId = current?.activeDraftId;
    const active = current && activeId ? current.drafts[activeId] : null;
    if (!current || !active) {
      return;
    }
    const idx = active.guideRoomIndex ?? 0;
    const rooms = active.rooms.map((item, i) =>
      i === idx
        ? {
            ...item,
            scanned: true,
            measuredSqftFromScan: item.measuredSqftFromScan ?? 1,
            sqft: item.sqft || '1',
          }
        : item
    );
    const measuredTotal = measuredSqft(rooms);
    const updated: DraftStore = {
      activeDraftId: active.id,
      drafts: {
        ...current.drafts,
        [active.id]: {
          ...active,
          rooms,
          measuredSqftFromScan: measuredTotal,
          guidePhase: 'condition',
          completedAt: undefined,
        },
      },
    };
    storeRef.current = updated;
    setStore(updated);
    void saveDraftStore(updated);
    setScreenStep('roomGuide');
  }, [scanCompletedToken]);

  const addPhoto = async (source: 'camera' | 'library') => {
    if (!storeRef.current?.activeDraftId) {
      return;
    }
    setPhotoError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(t('takePhoto'));
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
      const latest = storeRef.current;
      const activeId = latest?.activeDraftId;
      const active = activeId ? latest?.drafts[activeId] : null;
      if (!active) {
        return;
      }
      const idx = active.guideRoomIndex ?? 0;
      const currentRoom = active.rooms[idx];
      if (!currentRoom) {
        return;
      }
      const added = result.assets.map((asset) =>
        persistPhoto(active.id, asset.uri)
      );
      const rooms = active.rooms.map((item, i) =>
        i === idx
          ? { ...item, photos: [...item.photos, ...added] }
          : item
      );
      persistDraft({ ...active, rooms, completedAt: undefined });
    } catch {
      setPhotoError(t('takePhoto'));
    }
  };

  const goNextRoomOrFinish = (finish: boolean) => {
    if (!draft || !room) {
      return;
    }
    if (room.photos.length < 1) {
      setPhotoError(t('photoRequired'));
      return;
    }
    setPhotoError(null);
    if (finish || roomIndex >= draft.rooms.length - 1) {
      setScreenStep('done');
      updateGuide({ guidePhase: 'advance' });
      return;
    }
    setShowDamageNote(false);
    updateGuide({
      guideRoomIndex: roomIndex + 1,
      guidePhase: 'arrive',
    });
  };

  const skipRoom = () => {
    if (!draft) {
      return;
    }
    if (roomIndex >= draft.rooms.length - 1) {
      setScreenStep('done');
      return;
    }
    setShowDamageNote(false);
    updateGuide({
      guideRoomIndex: roomIndex + 1,
      guidePhase: 'arrive',
    });
  };

  const addRoom = () => {
    if (!draft) {
      return;
    }
    persistDraft({
      ...draft,
      rooms: [...draft.rooms, createRoom('')],
      completedAt: undefined,
    });
  };

  const saveJob = (status: VerificationStatus) => {
    if (!draft) {
      return;
    }
    const verifiedOk = status === 'verified' && draftHasScanMeasure(draft);
    const finalStatus: VerificationStatus =
      verifiedOk && lidarAvailable ? 'verified' : 'unverified';
    persistDraft({
      ...draft,
      completedAt: new Date().toISOString(),
      verificationStatus: finalStatus,
      measuredSqftFromScan: measuredSqft(draft.rooms),
    });
    setSavedMessage(t('savedOnDevice'));
    setScreenStep('done');
  };

  const guideProgress =
    draft && draft.rooms.length > 0
      ? (roomIndex + (phase === 'advance' ? 1 : 0.35)) / draft.rooms.length
      : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
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
              {t('roomStep')} {roomIndex + 1} {t('ofWord')} {draft.rooms.length}
            </ThemedText>
          </View>
          <ProgressTrack
            progress={guideProgress}
            track={theme.backgroundSelected}
            fill={theme.accent}
          />

          {phase === 'arrive' && (
            <View style={styles.promptBlock}>
              <ThemedText type="heading" style={styles.prompt}>
                {t('goToRoom')} {room.name || t('rooms')}
              </ThemedText>
              <GuideButton
                label={t('continue')}
                onPress={() => advancePhase('arrive')}
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
            </View>
          )}

          {phase === 'scan' && (
            <View style={styles.promptBlock}>
              <ThemedText type="heading" style={styles.prompt}>
                {t('startScan')}
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                {t('scanRequired')}
              </ThemedText>
              <GuideButton
                label={t('startScan')}
                onPress={() => {
                  onOpenLidar?.();
                }}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
            </View>
          )}

          {phase === 'condition' && (
            <View style={styles.promptBlock}>
              <ThemedText type="heading" style={styles.prompt}>
                {t('condition')}
              </ThemedText>
              <View style={styles.choiceStack}>
                {CONDITIONS.map((condition) => {
                  const fill = conditionFill[condition];
                  const label =
                    condition === 'good'
                      ? t('conditionGood')
                      : condition === 'watch'
                        ? t('conditionWatch')
                        : t('conditionIssue');
                  return (
                    <Pressable
                      key={condition}
                      onPress={() => {
                        const rooms = draft.rooms.map((item, i) =>
                          i === roomIndex ? { ...item, condition } : item
                        );
                        updateGuide({ guidePhase: 'damage' }, rooms);
                        setShowDamageNote(false);
                      }}
                      style={({ pressed }) => [
                        styles.choiceChip,
                        { backgroundColor: fill.background },
                        pressed && styles.buttonPressed,
                      ]}>
                      <ThemedText
                        type="default"
                        style={[styles.choiceLabel, { color: fill.label }]}>
                        {label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {phase === 'damage' && (
            <View style={styles.promptBlock}>
              <ThemedText type="heading" style={styles.prompt}>
                {t('anyDamage')}
              </ThemedText>
              <View style={styles.choiceStack}>
                <Pressable
                  onPress={() => {
                    const rooms = draft.rooms.map((item, i) =>
                      i === roomIndex
                        ? { ...item, hasDamage: false }
                        : item
                    );
                    updateGuide({ guidePhase: 'photo' }, rooms);
                    setShowDamageNote(false);
                  }}
                  style={({ pressed }) => [
                    styles.choiceChip,
                    { backgroundColor: theme.successFill },
                    pressed && styles.buttonPressed,
                  ]}>
                  <ThemedText
                    type="default"
                    style={[
                      styles.choiceLabel,
                      { color: theme.onSuccessFill },
                    ]}>
                    {t('no')}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setShowDamageNote(true)}
                  style={({ pressed }) => [
                    styles.choiceChip,
                    {
                      backgroundColor: showDamageNote
                        ? theme.dangerFill
                        : theme.backgroundSelected,
                    },
                    pressed && styles.buttonPressed,
                  ]}>
                  <ThemedText
                    type="default"
                    style={[
                      styles.choiceLabel,
                      {
                        color: showDamageNote
                          ? theme.onDangerFill
                          : theme.text,
                      },
                    ]}>
                    {t('yes')}
                  </ThemedText>
                </Pressable>
              </View>
              {showDamageNote ? (
                <>
                  <TextInput
                    style={[styles.input, inputStyle]}
                    placeholder={t('damageNotes')}
                    placeholderTextColor={theme.textSecondary}
                    value={room.notes}
                    multiline
                    onChangeText={(notes) => {
                      const rooms = draft.rooms.map((item, i) =>
                        i === roomIndex
                          ? { ...item, notes, hasDamage: true }
                          : item
                      );
                      updateGuide({}, rooms);
                    }}
                  />
                  <GuideButton
                    label={t('continue')}
                    onPress={() => updateGuide({ guidePhase: 'photo' })}
                    accent={theme.accent}
                    onAccent={theme.onAccent}
                  />
                </>
              ) : null}
            </View>
          )}

          {phase === 'photo' && (
            <View style={styles.promptBlock}>
              <ThemedText type="heading" style={styles.prompt}>
                {t('takePhoto')}
              </ThemedText>
              {photoError ? (
                <ThemedText type="default" style={{ color: theme.danger }}>
                  {photoError}
                </ThemedText>
              ) : null}
              {room.photos.length > 0 ? (
                <View style={styles.photoRow}>
                  {room.photos.map((photo) => (
                    <Image
                      key={photo.id}
                      source={{ uri: photo.uri }}
                      style={styles.photoThumb}
                    />
                  ))}
                </View>
              ) : null}
              <GuideButton
                label={t('takePhoto')}
                onPress={() => {
                  void addPhoto('camera');
                }}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
              <GuideButton
                label={t('addFromLibrary')}
                onPress={() => {
                  void addPhoto('library');
                }}
                accent={theme.accentText}
                onAccent={theme.onAccent}
                secondary
                border={theme.border}
              />
              <GuideButton
                label={
                  roomIndex >= draft.rooms.length - 1
                    ? t('finishJob')
                    : t('nextRoom')
                }
                onPress={() =>
                  goNextRoomOrFinish(roomIndex >= draft.rooms.length - 1)
                }
                disabled={room.photos.length < 1}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
              <Pressable onPress={addRoom} style={styles.linkButton}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('addRoom')}
                </ThemedText>
              </Pressable>
            </View>
          )}

          {phase === 'advance' && (
            <View style={styles.promptBlock}>
              <GuideButton
                label={t('nextRoom')}
                onPress={() => goNextRoomOrFinish(false)}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
              <GuideButton
                label={t('finishJob')}
                onPress={() => goNextRoomOrFinish(true)}
                accent={theme.accentText}
                onAccent={theme.onAccent}
                secondary
                border={theme.border}
              />
            </View>
          )}
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
            {recorded !== null ? (
              <ThemedText type="heading" style={styles.measureLine}>
                {t('recordedSqftLabel')} {Math.round(recorded)}
              </ThemedText>
            ) : null}
            <ThemedText type="heading" style={styles.measureLine}>
              {t('measuredSqftLabel')} {Math.round(measured)}
            </ThemedText>
          </View>
          {savedMessage ? (
            <ThemedText type="default" themeColor="textSecondary">
              {savedMessage}
            </ThemedText>
          ) : null}
          {!draft.completedAt ? (
            <>
              {lidarAvailable && draftHasScanMeasure(draft) ? (
                <GuideButton
                  label={t('saveVerified')}
                  onPress={() => saveJob('verified')}
                  accent={theme.accent}
                  onAccent={theme.onAccent}
                />
              ) : null}
              <GuideButton
                label={t('saveJob')}
                onPress={() => saveJob('unverified')}
                accent={theme.accent}
                onAccent={theme.onAccent}
                secondary={lidarAvailable && draftHasScanMeasure(draft)}
                border={theme.border}
              />
            </>
          ) : (
            <>
              <GuideButton
                label={t('startAnother')}
                onPress={() => {
                  if (!store) {
                    return;
                  }
                  persistStore({ ...store, activeDraftId: null });
                  setScreenStep('checkin');
                  setSavedMessage(null);
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
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  promptBlock: {
    gap: Spacing.three,
  },
  prompt: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
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
  primaryButton: {
    minHeight: 56,
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
  choiceStack: {
    gap: Spacing.two,
  },
  choiceChip: {
    minHeight: 56,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  choiceLabel: {
    fontWeight: '700',
    fontSize: 18,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: Spacing.two,
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
    gap: Spacing.one,
  },
  measureLine: {
    fontSize: 20,
    lineHeight: 28,
  },
});
