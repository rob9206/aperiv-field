import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createDraft,
  createRoom,
  deleteDraftPhotos,
  deletePhotoFile,
  loadDraftStore,
  measuredSqft,
  persistPhoto,
  recordedSqftValue,
  saveDraftStore,
  totalPhotos,
  type DraftStore,
  type FindingSeverity,
  type ManualWalkthroughDraft,
  type RoomCapture,
  type RoomCondition,
  type WalkthroughFinding,
  newId,
} from '@/lib/walkthrough-draft';

type Step = 'unit' | 'rooms' | 'findings' | 'review';

type ManualWalkthroughProps = {
  onOpenLidar?: () => void;
  lidarAvailable?: boolean;
};

const CONDITIONS: RoomCondition[] = ['good', 'watch', 'issue'];
const SEVERITIES: FindingSeverity[] = ['low', 'medium', 'high'];

function conditionLabel(condition: RoomCondition): string {
  if (condition === 'watch') return 'Watch';
  if (condition === 'issue') return 'Issue';
  return 'Good';
}

function severityLabel(severity: FindingSeverity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function ManualWalkthrough({
  onOpenLidar,
  lidarAvailable = false,
}: ManualWalkthroughProps) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>('unit');
  const [store, setStore] = useState<DraftStore | null>(null);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const [propertyName, setPropertyName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [recordedSqft, setRecordedSqft] = useState('');

  const draft = store?.activeDraftId
    ? (store.drafts[store.activeDraftId] ?? null)
    : null;

  const savedDrafts = useMemo(
    () =>
      store
        ? Object.values(store.drafts).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt)
          )
        : [],
    [store]
  );

  const conditionFill: Record<RoomCondition, { background: string; label: string }> = {
    good: { background: theme.successFill, label: theme.onSuccessFill },
    watch: { background: theme.warningFill, label: theme.onWarningFill },
    issue: { background: theme.dangerFill, label: theme.onDangerFill },
  };
  const severityFill: Record<FindingSeverity, { background: string; label: string }> = {
    low: { background: theme.successFill, label: theme.onSuccessFill },
    medium: { background: theme.warningFill, label: theme.onWarningFill },
    high: { background: theme.dangerFill, label: theme.onDangerFill },
  };

  const inputStyle = {
    backgroundColor: theme.background,
    color: theme.text,
    borderColor: theme.border,
  };

  useEffect(() => {
    loadDraftStore().then(
      (loaded) => {
        setStore(loaded);
        const active = loaded.activeDraftId
          ? loaded.drafts[loaded.activeDraftId]
          : null;
        if (active) {
          setStep(active.completedAt ? 'review' : 'rooms');
        }
      },
      () => {
        setStore({ activeDraftId: null, drafts: {} });
        setHydrateError('Could not restore saved walkthroughs on this device.');
      }
    );
  }, []);

  const measured = useMemo(
    () => (draft ? measuredSqft(draft.rooms) : 0),
    [draft]
  );
  const photos = useMemo(() => (draft ? totalPhotos(draft.rooms) : 0), [draft]);
  const recorded = draft ? recordedSqftValue(draft) : null;
  const variance = recorded !== null ? recorded - measured : null;

  const persistStore = (next: DraftStore) => {
    setStore(next);
    setSavedMessage(null);
    saveDraftStore(next).catch(() => {
      setHydrateError('Changes could not be saved on this device.');
    });
  };

  const persistDraft = (next: ManualWalkthroughDraft) => {
    if (!store) {
      return;
    }
    persistStore({
      activeDraftId: next.id,
      drafts: { ...store.drafts, [next.id]: next },
    });
  };

  const startWalkthrough = () => {
    if (!propertyName.trim() || !unitNumber.trim()) {
      return;
    }
    const next = createDraft(propertyName, unitNumber, recordedSqft);
    persistDraft(next);
    setPropertyName('');
    setUnitNumber('');
    setRecordedSqft('');
    setStep('rooms');
  };

  const resumeDraft = (id: string) => {
    if (!store) {
      return;
    }
    const target = store.drafts[id];
    if (!target) {
      return;
    }
    persistStore({ ...store, activeDraftId: id });
    setStep(target.completedAt ? 'review' : 'rooms');
  };

  const deleteDraft = (id: string) => {
    if (!store) {
      return;
    }
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    deleteDraftPhotos(id);
    const { [id]: removed, ...rest } = store.drafts;
    persistStore({
      activeDraftId: store.activeDraftId === id ? null : store.activeDraftId,
      drafts: rest,
    });
  };

  const updateRoom = (roomId: string, patch: Partial<RoomCapture>) => {
    if (!draft) {
      return;
    }
    persistDraft({
      ...draft,
      rooms: draft.rooms.map((room) =>
        room.id === roomId ? { ...room, ...patch } : room
      ),
      completedAt: undefined,
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

  const removeRoom = (roomId: string) => {
    if (!draft) {
      return;
    }
    const room = draft.rooms.find((item) => item.id === roomId);
    room?.photos.forEach((photo) => deletePhotoFile(photo.uri));
    persistDraft({
      ...draft,
      rooms: draft.rooms.filter((item) => item.id !== roomId),
      completedAt: undefined,
    });
  };

  const addPhoto = async (roomId: string, source: 'camera' | 'library') => {
    if (!draft) {
      return;
    }
    setPhotoError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPhotoError(
            'Camera access is needed to take room photos. You can enable it in Settings.'
          );
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
      const room = draft.rooms.find((item) => item.id === roomId);
      if (!room) {
        return;
      }
      const added = result.assets.map((asset) =>
        persistPhoto(draft.id, asset.uri)
      );
      updateRoom(roomId, { photos: [...room.photos, ...added] });
    } catch {
      setPhotoError('Could not add the photo. Please try again.');
    }
  };

  const removePhoto = (roomId: string, photoId: string) => {
    if (!draft) {
      return;
    }
    const room = draft.rooms.find((item) => item.id === roomId);
    if (!room) {
      return;
    }
    const photo = room.photos.find((item) => item.id === photoId);
    if (photo) {
      deletePhotoFile(photo.uri);
    }
    updateRoom(roomId, {
      photos: room.photos.filter((item) => item.id !== photoId),
    });
  };

  const addFinding = () => {
    if (!draft) {
      return;
    }
    const finding: WalkthroughFinding = {
      id: newId('finding'),
      severity: 'medium',
      title: '',
      body: '',
    };
    persistDraft({
      ...draft,
      findings: [...draft.findings, finding],
      completedAt: undefined,
    });
  };

  const updateFinding = (id: string, patch: Partial<WalkthroughFinding>) => {
    if (!draft) {
      return;
    }
    persistDraft({
      ...draft,
      findings: draft.findings.map((finding) =>
        finding.id === id ? { ...finding, ...patch } : finding
      ),
      completedAt: undefined,
    });
  };

  const removeFinding = (id: string) => {
    if (!draft) {
      return;
    }
    persistDraft({
      ...draft,
      findings: draft.findings.filter((finding) => finding.id !== id),
      completedAt: undefined,
    });
  };

  const completeWalkthrough = () => {
    if (!draft) {
      return;
    }
    persistDraft({
      ...draft,
      completedAt: new Date().toISOString(),
    });
    setSavedMessage('Walkthrough saved on this device.');
    setStep('review');
  };

  const startAnother = () => {
    if (!store) {
      return;
    }
    persistStore({ ...store, activeDraftId: null });
    setSavedMessage(null);
    setStep('unit');
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          On-site capture: enter the unit, record room measurements and photos,
          then log condition findings.
        </ThemedText>
        {lidarAvailable && onOpenLidar ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenLidar}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.border },
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Open LiDAR room scan</ThemedText>
          </Pressable>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            LiDAR scan is unavailable on this device — manual capture still works.
          </ThemedText>
        )}
        {hydrateError ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {hydrateError}
          </ThemedText>
        ) : null}
      </ThemedView>

      <View style={styles.stepRow}>
        {(['unit', 'rooms', 'findings', 'review'] as Step[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            disabled={item !== 'unit' && !draft}
            onPress={() => {
              if (item === 'unit' || draft) {
                setStep(item);
              }
            }}
            style={[
              styles.stepChip,
              { backgroundColor: theme.backgroundSelected },
              step === item && { backgroundColor: theme.accent },
              item !== 'unit' && !draft && styles.stepChipDisabled,
            ]}>
            <ThemedText
              type="smallBold"
              style={step === item ? { color: theme.onAccent } : undefined}>
              {item === 'unit'
                ? 'Unit'
                : item === 'rooms'
                  ? 'Rooms'
                  : item === 'findings'
                    ? 'Findings'
                    : 'Review'}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {step === 'unit' && (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="heading">Start a walkthrough</ThemedText>
            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                Property
              </ThemedText>
              <TextInput
                style={[styles.input, inputStyle]}
                placeholder="Property name"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                value={propertyName}
                onChangeText={setPropertyName}
              />
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGrow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Unit
                </ThemedText>
                <TextInput
                  style={[styles.input, inputStyle]}
                  placeholder="e.g. 12B"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="characters"
                  value={unitNumber}
                  onChangeText={setUnitNumber}
                />
              </View>
              <View style={styles.fieldGrow}>
                <ThemedText type="small" themeColor="textSecondary">
                  Recorded sq ft (optional)
                </ThemedText>
                <TextInput
                  style={[styles.input, inputStyle]}
                  placeholder="e.g. 1210"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  value={recordedSqft}
                  onChangeText={setRecordedSqft}
                />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={!propertyName.trim() || !unitNumber.trim()}
              onPress={startWalkthrough}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.accent },
                (!propertyName.trim() || !unitNumber.trim()) &&
                  styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                Start walkthrough
              </ThemedText>
            </Pressable>
          </ThemedView>

          {savedDrafts.length > 0 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="heading">Saved walkthroughs</ThemedText>
              {savedDrafts.map((item) => (
                <View
                  key={item.id}
                  style={[styles.savedRow, { borderTopColor: theme.border }]}>
                  <View style={styles.savedCopy}>
                    <ThemedText type="smallBold">
                      {item.property} · Unit {item.unit}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.completedAt
                        ? `Saved ${new Date(item.completedAt).toLocaleDateString()}`
                        : `In progress · started ${new Date(item.createdAt).toLocaleDateString()}`}{' '}
                      · {item.rooms.length} rooms · {totalPhotos(item.rooms)}{' '}
                      photos
                    </ThemedText>
                  </View>
                  <View style={styles.savedActions}>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => resumeDraft(item.id)}>
                      <ThemedText type="linkPrimary">Open</ThemedText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => deleteDraft(item.id)}>
                      <ThemedText
                        type="linkPrimary"
                        style={{ color: theme.danger }}>
                        {confirmingDeleteId === item.id ? 'Confirm?' : 'Delete'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ThemedView>
          ) : null}
        </>
      )}

      {step === 'rooms' && draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="heading">
            Rooms · Unit {draft.unit}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Measure each room, set its condition, and capture photos.
          </ThemedText>
          {photoError ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {photoError}
            </ThemedText>
          ) : null}
          {draft.rooms.map((room) => (
            <View
              key={room.id}
              style={[styles.roomBlock, { borderTopColor: theme.border }]}>
              <View style={styles.roomHeader}>
                <TextInput
                  style={[styles.input, styles.roomNameInput, inputStyle]}
                  placeholder="Room name"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="words"
                  value={room.name}
                  onChangeText={(name) => updateRoom(room.id, { name })}
                />
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => removeRoom(room.id)}>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Remove
                  </ThemedText>
                </Pressable>
              </View>
              <View style={styles.fieldGroup}>
                <ThemedText type="small" themeColor="textSecondary">
                  Measured sq ft
                </ThemedText>
                <TextInput
                  style={[styles.input, inputStyle]}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                  value={room.sqft}
                  onChangeText={(sqft) => updateRoom(room.id, { sqft })}
                />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Condition
              </ThemedText>
              <View style={styles.chipRow}>
                {CONDITIONS.map((condition) => (
                  <Pressable
                    key={condition}
                    accessibilityRole="button"
                    onPress={() => updateRoom(room.id, { condition })}
                    style={[
                      styles.choiceChip,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderColor: theme.border,
                      },
                      room.condition === condition && {
                        backgroundColor: conditionFill[condition].background,
                        borderColor: conditionFill[condition].background,
                      },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={
                        room.condition === condition
                          ? { color: conditionFill[condition].label }
                          : undefined
                      }>
                      {conditionLabel(condition)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Photos ({room.photos.length})
              </ThemedText>
              {room.photos.length > 0 ? (
                <View style={styles.photoRow}>
                  {room.photos.map((photo) => (
                    <View key={photo.id} style={styles.photoWrap}>
                      <Image
                        source={{ uri: photo.uri }}
                        style={styles.photoThumb}
                        contentFit="cover"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                        hitSlop={8}
                        onPress={() => removePhoto(room.id, photo.id)}
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
              ) : null}
              <View style={styles.fieldRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void addPhoto(room.id, 'camera')}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.fieldGrow,
                    { borderColor: theme.border },
                    pressed && styles.buttonPressed,
                  ]}>
                  <ThemedText type="smallBold">Take photo</ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void addPhoto(room.id, 'library')}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    styles.fieldGrow,
                    { borderColor: theme.border },
                    pressed && styles.buttonPressed,
                  ]}>
                  <ThemedText type="smallBold">Add from library</ThemedText>
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, styles.notesInput, inputStyle]}
                placeholder="Room notes"
                placeholderTextColor={theme.textSecondary}
                value={room.notes}
                onChangeText={(notes) => updateRoom(room.id, { notes })}
              />
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={addRoom}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.border },
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Add room</ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary">
            Measured total {measured.toLocaleString()} sq ft · {photos} photos
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('findings')}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.accent },
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              Continue to findings
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {step === 'findings' && draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="heading">Condition findings</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Log issues the office and vendors should see before scope goes out.
          </ThemedText>
          {draft.findings.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No findings yet.
            </ThemedText>
          ) : null}
          {draft.findings.map((finding) => (
            <View
              key={finding.id}
              style={[styles.findingBlock, { borderTopColor: theme.border }]}>
              <View style={styles.chipRow}>
                {SEVERITIES.map((severity) => (
                  <Pressable
                    key={severity}
                    accessibilityRole="button"
                    onPress={() => updateFinding(finding.id, { severity })}
                    style={[
                      styles.choiceChip,
                      {
                        backgroundColor: theme.backgroundSelected,
                        borderColor: theme.border,
                      },
                      finding.severity === severity && {
                        backgroundColor: severityFill[severity].background,
                        borderColor: severityFill[severity].background,
                      },
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={
                        finding.severity === severity
                          ? { color: severityFill[severity].label }
                          : undefined
                      }>
                      {severityLabel(severity)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={[styles.input, inputStyle]}
                placeholder="Finding title"
                placeholderTextColor={theme.textSecondary}
                value={finding.title}
                onChangeText={(title) => updateFinding(finding.id, { title })}
              />
              <TextInput
                style={[styles.input, styles.notesInput, inputStyle]}
                placeholder="Details"
                placeholderTextColor={theme.textSecondary}
                value={finding.body}
                onChangeText={(body) => updateFinding(finding.id, { body })}
              />
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => removeFinding(finding.id)}>
                <ThemedText type="linkPrimary" style={{ color: theme.danger }}>
                  Remove
                </ThemedText>
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={addFinding}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.border },
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Add finding</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={completeWalkthrough}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.accent },
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
              Save walkthrough
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {step === 'review' && draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="heading">
            {draft.property} · Unit {draft.unit}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Measured {measured.toLocaleString()} sq ft
            {recorded !== null
              ? ` · Recorded ${recorded.toLocaleString()} sq ft`
              : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {variance !== null
              ? `Variance ${variance > 0 ? '+' : ''}${variance.toLocaleString()} sq ft · `
              : ''}
            {photos} photos · {draft.findings.length} findings
          </ThemedText>
          {draft.completedAt ? (
            <ThemedText type="smallBold">
              Saved {new Date(draft.completedAt).toLocaleString()}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Draft in progress — finish findings to save.
            </ThemedText>
          )}
          {savedMessage ? (
            <ThemedText type="smallBold" style={{ color: theme.success }}>
              {savedMessage}
            </ThemedText>
          ) : null}

          <View style={styles.summaryList}>
            {draft.rooms.map((room) => (
              <ThemedText key={room.id} type="small" themeColor="textSecondary">
                {room.name || 'Room'}: {room.sqft || '0'} sq ft ·{' '}
                {conditionLabel(room.condition)} · {room.photos.length} photos
              </ThemedText>
            ))}
          </View>

          {draft.findings.map((finding) => (
            <View key={finding.id} style={styles.summaryFinding}>
              <ThemedText type="smallBold">
                [{severityLabel(finding.severity)}]{' '}
                {finding.title || 'Untitled finding'}
              </ThemedText>
              {finding.body ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {finding.body}
                </ThemedText>
              ) : null}
            </View>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('rooms')}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.border },
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Edit rooms</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={startAnother}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: theme.border },
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Start another walkthrough</ThemedText>
          </Pressable>
        </ThemedView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  card: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
  },
  stepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  stepChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  stepChipDisabled: {
    opacity: 0.4,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  savedCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  savedActions: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  roomBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  roomNameInput: {
    flex: 1,
    fontWeight: '600',
  },
  findingBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  fieldGrow: {
    flex: 1,
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: MinTouchTarget,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  choiceChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photoWrap: {
    position: 'relative',
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: Spacing.two,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    minHeight: 48,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  summaryList: {
    gap: Spacing.one,
  },
  summaryFinding: {
    gap: Spacing.one,
  },
});
