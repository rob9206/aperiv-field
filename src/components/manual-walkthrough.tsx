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
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent: string;
  onAccent: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: accent },
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      <ThemedText type="smallBold" style={{ color: onAccent }}>
        {label}
      </ThemedText>
    </Pressable>
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

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.topBar}>
        <LanguageToggle />
      </View>

      {hydrateError ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {hydrateError}
        </ThemedText>
      ) : null}

      {screenStep === 'checkin' && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="heading">{t('startJob')}</ThemedText>
          {!lidarAvailable ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('noLidarDevice')}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {t('scanRequired')}
            </ThemedText>
          )}
          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
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
            <ThemedText type="small" themeColor="textSecondary">
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
            <ThemedText type="small" themeColor="textSecondary">
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
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {draft.property} · {draft.unit} · {roomIndex + 1}/
            {draft.rooms.length}
          </ThemedText>

          {phase === 'arrive' && (
            <>
              <ThemedText type="heading">
                {t('goToRoom')} {room.name || t('rooms')}
              </ThemedText>
              <GuideButton
                label={t('continue')}
                onPress={() => advancePhase('arrive')}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
              <Pressable onPress={skipRoom} style={styles.linkButton}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('skipRoom')}
                </ThemedText>
              </Pressable>
            </>
          )}

          {phase === 'scan' && (
            <>
              <ThemedText type="heading">{t('startScan')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
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
            </>
          )}

          {phase === 'condition' && (
            <>
              <ThemedText type="heading">{t('condition')}</ThemedText>
              <View style={styles.chipRow}>
                {CONDITIONS.map((condition) => {
                  const active = room.condition === condition;
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
                      style={[
                        styles.choiceChip,
                        {
                          backgroundColor: active
                            ? fill.background
                            : theme.backgroundSelected,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={active ? { color: fill.label } : undefined}>
                        {label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {phase === 'damage' && (
            <>
              <ThemedText type="heading">{t('anyDamage')}</ThemedText>
              <View style={styles.chipRow}>
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
                  style={[
                    styles.choiceChip,
                    { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText type="smallBold">{t('no')}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setShowDamageNote(true)}
                  style={[
                    styles.choiceChip,
                    { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText type="smallBold">{t('yes')}</ThemedText>
                </Pressable>
              </View>
              {showDamageNote ? (
                <>
                  <TextInput
                    style={[styles.input, inputStyle]}
                    placeholder={t('damageNotes')}
                    placeholderTextColor={theme.textSecondary}
                    value={room.notes}
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
            </>
          )}

          {phase === 'photo' && (
            <>
              <ThemedText type="heading">{t('takePhoto')}</ThemedText>
              {photoError ? (
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {photoError}
                </ThemedText>
              ) : null}
              <View style={styles.photoRow}>
                {room.photos.map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: photo.uri }}
                    style={styles.photoThumb}
                  />
                ))}
              </View>
              <GuideButton
                label={t('takePhoto')}
                onPress={() => {
                  void addPhoto('camera');
                }}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
              <Pressable
                onPress={() => {
                  void addPhoto('library');
                }}
                style={styles.linkButton}>
                <ThemedText type="linkPrimary">{t('addFromLibrary')}</ThemedText>
              </Pressable>
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
            </>
          )}

          {phase === 'advance' && (
            <>
              <GuideButton
                label={t('nextRoom')}
                onPress={() => goNextRoomOrFinish(false)}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
              <GuideButton
                label={t('finishJob')}
                onPress={() => goNextRoomOrFinish(true)}
                accent={theme.accent}
                onAccent={theme.onAccent}
              />
            </>
          )}
        </ThemedView>
      )}

      {screenStep === 'done' && draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="heading">
            {draft.verificationStatus === 'verified'
              ? t('jobVerified')
              : t('jobUnverified')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {draft.property} · {draft.unit}
          </ThemedText>
          {recorded !== null ? (
            <ThemedText type="smallBold">
              {t('recordedSqftLabel')} {Math.round(recorded)} ·{' '}
              {t('measuredSqftLabel')} {Math.round(measured)}
            </ThemedText>
          ) : (
            <ThemedText type="smallBold">
              {t('measuredSqftLabel')} {Math.round(measured)}
            </ThemedText>
          )}
          {savedMessage ? (
            <ThemedText type="small" themeColor="textSecondary">
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
              <Pressable
                onPress={() => router.replace('/')}
                style={styles.linkButton}>
                <ThemedText type="linkPrimary">{t('myJobs')}</ThemedText>
              </Pressable>
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
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 48,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  choiceChip: {
    minHeight: MinTouchTarget + 8,
    minWidth: 96,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
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
    borderRadius: Spacing.two,
  },
  linkButton: {
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
