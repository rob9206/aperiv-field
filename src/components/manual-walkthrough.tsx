import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { Colors, Spacing } from '@/constants/theme';
import {
  DEMO_UNITS,
  createDraftFromUnit,
  measuredSqft,
  totalPhotos,
  type FindingSeverity,
  type ManualWalkthroughDraft,
  type RoomCapture,
  type RoomCondition,
  type WalkthroughFinding,
} from '@/lib/demo-units';

const DRAFT_KEY = 'aperiv.field.walkthrough.draft.v1';

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

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ManualWalkthrough({
  onOpenLidar,
  lidarAvailable = false,
}: ManualWalkthroughProps) {
  const [step, setStep] = useState<Step>('unit');
  const [draft, setDraft] = useState<ManualWalkthroughDraft | null>(null);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as ManualWalkthroughDraft;
        if (parsed?.unitId && Array.isArray(parsed.rooms)) {
          setDraft(parsed);
          setStep(parsed.completedAt ? 'review' : 'rooms');
        }
      })
      .catch(() => {
        setHydrateError('Could not restore the previous draft.');
      });
  }, []);

  const measured = useMemo(
    () => (draft ? measuredSqft(draft.rooms) : 0),
    [draft]
  );
  const photos = useMemo(() => (draft ? totalPhotos(draft.rooms) : 0), [draft]);
  const variance = draft ? draft.recordedSqft - measured : 0;

  const persist = async (next: ManualWalkthroughDraft) => {
    setDraft(next);
    setSavedMessage(null);
    try {
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      setHydrateError('Draft could not be saved on this device.');
    }
  };

  const selectUnit = (unitId: string) => {
    const unit = DEMO_UNITS.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }
    void persist(createDraftFromUnit(unit));
    setStep('rooms');
  };

  const updateRoom = (roomId: string, patch: Partial<RoomCapture>) => {
    if (!draft) {
      return;
    }
    void persist({
      ...draft,
      rooms: draft.rooms.map((room) =>
        room.id === roomId ? { ...room, ...patch } : room
      ),
      completedAt: undefined,
    });
  };

  const addFinding = () => {
    if (!draft) {
      return;
    }
    const finding: WalkthroughFinding = {
      id: nextId('finding'),
      severity: 'medium',
      title: '',
      body: '',
    };
    void persist({
      ...draft,
      findings: [...draft.findings, finding],
      completedAt: undefined,
    });
  };

  const updateFinding = (id: string, patch: Partial<WalkthroughFinding>) => {
    if (!draft) {
      return;
    }
    void persist({
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
    void persist({
      ...draft,
      findings: draft.findings.filter((finding) => finding.id !== id),
      completedAt: undefined,
    });
  };

  const completeWalkthrough = async () => {
    if (!draft) {
      return;
    }
    const completed: ManualWalkthroughDraft = {
      ...draft,
      completedAt: new Date().toISOString(),
    };
    await persist(completed);
    setSavedMessage('Walkthrough saved on this device.');
    setStep('review');
  };

  const resetWalkthrough = async () => {
    setDraft(null);
    setSavedMessage(null);
    setStep('unit');
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore clear failures — in-memory reset still lets the user continue.
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">Walkthrough</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          On-site capture: pick a unit, record room measurements and photos, then
          log condition findings.
        </ThemedText>
        {lidarAvailable && onOpenLidar ? (
          <Pressable
            accessibilityRole="button"
            onPress={onOpenLidar}
            style={({ pressed }) => [
              styles.secondaryButton,
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
          <ThemedText type="small" style={styles.errorText}>
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
              step === item && styles.stepChipActive,
              item !== 'unit' && !draft && styles.stepChipDisabled,
            ]}>
            <ThemedText
              type="smallBold"
              style={step === item ? styles.stepChipLabelActive : undefined}>
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
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Select unit</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Demo portfolio units — same roster as the web turnover path.
          </ThemedText>
          {DEMO_UNITS.map((unit) => (
            <Pressable
              key={unit.id}
              accessibilityRole="button"
              onPress={() => selectUnit(unit.id)}
              style={({ pressed }) => [
                styles.unitRow,
                draft?.unitId === unit.id && styles.unitRowSelected,
                pressed && styles.buttonPressed,
              ]}>
              <View style={styles.unitCopy}>
                <ThemedText type="smallBold">
                  {unit.property} · Unit {unit.unit}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Recorded {unit.recordedSqft.toLocaleString()} sq ft ·{' '}
                  {unit.rooms.length} rooms
                </ThemedText>
              </View>
              <ThemedText type="linkPrimary">Select</ThemedText>
            </Pressable>
          ))}
          {draft ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep('rooms')}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}>
              <ThemedText type="smallBold" style={styles.primaryButtonLabel}>
                Continue with Unit {draft.unit}
              </ThemedText>
            </Pressable>
          ) : null}
        </ThemedView>
      )}

      {step === 'rooms' && draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">
            Rooms · Unit {draft.unit}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Enter measured sq ft, condition, and photo count per room.
          </ThemedText>
          {draft.rooms.map((room) => (
            <View key={room.id} style={styles.roomBlock}>
              <ThemedText type="smallBold">{room.name}</ThemedText>
              <View style={styles.fieldRow}>
                <View style={styles.fieldGrow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Measured sq ft
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={room.sqft}
                    onChangeText={(sqft) => updateRoom(room.id, { sqft })}
                  />
                </View>
                <View style={styles.fieldGrow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Photos
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={room.photoCount}
                    onChangeText={(photoCount) =>
                      updateRoom(room.id, { photoCount })
                    }
                  />
                </View>
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
                      room.condition === condition && styles.choiceChipActive,
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={
                        room.condition === condition
                          ? styles.choiceChipLabelActive
                          : undefined
                      }>
                      {conditionLabel(condition)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Room notes"
                placeholderTextColor={Colors.light.textSecondary}
                value={room.notes}
                onChangeText={(notes) => updateRoom(room.id, { notes })}
              />
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            Measured total {measured.toLocaleString()} sq ft · {photos} photos
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep('findings')}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold" style={styles.primaryButtonLabel}>
              Continue to findings
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {step === 'findings' && draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Condition findings</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Log issues the office and vendors should see before scope goes out.
          </ThemedText>
          {draft.findings.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No findings yet.
            </ThemedText>
          ) : null}
          {draft.findings.map((finding) => (
            <View key={finding.id} style={styles.findingBlock}>
              <View style={styles.chipRow}>
                {SEVERITIES.map((severity) => (
                  <Pressable
                    key={severity}
                    accessibilityRole="button"
                    onPress={() => updateFinding(finding.id, { severity })}
                    style={[
                      styles.choiceChip,
                      finding.severity === severity && styles.choiceChipActive,
                    ]}>
                    <ThemedText
                      type="smallBold"
                      style={
                        finding.severity === severity
                          ? styles.choiceChipLabelActive
                          : undefined
                      }>
                      {severity}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Finding title"
                placeholderTextColor={Colors.light.textSecondary}
                value={finding.title}
                onChangeText={(title) => updateFinding(finding.id, { title })}
              />
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Details"
                placeholderTextColor={Colors.light.textSecondary}
                value={finding.body}
                onChangeText={(body) => updateFinding(finding.id, { body })}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => removeFinding(finding.id)}>
                <ThemedText type="linkPrimary">Remove</ThemedText>
              </Pressable>
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={addFinding}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Add finding</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void completeWalkthrough()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold" style={styles.primaryButtonLabel}>
              Save walkthrough
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}

      {step === 'review' && draft && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">
            {draft.property} · Unit {draft.unit}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Measured {measured.toLocaleString()} sq ft · Recorded{' '}
            {draft.recordedSqft.toLocaleString()} sq ft
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Variance {variance > 0 ? '+' : ''}
            {variance.toLocaleString()} sq ft · {photos} photos ·{' '}
            {draft.findings.length} findings
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
            <ThemedText type="smallBold">{savedMessage}</ThemedText>
          ) : null}

          <View style={styles.summaryList}>
            {draft.rooms.map((room) => (
              <ThemedText key={room.id} type="small" themeColor="textSecondary">
                {room.name}: {room.sqft || '0'} sq ft ·{' '}
                {conditionLabel(room.condition)} · {room.photoCount || '0'} photos
              </ThemedText>
            ))}
          </View>

          {draft.findings.map((finding) => (
            <View key={finding.id} style={styles.summaryFinding}>
              <ThemedText type="smallBold">
                [{finding.severity}] {finding.title || 'Untitled finding'}
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
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Edit rooms</ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void resetWalkthrough()}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold">Start new walkthrough</ThemedText>
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
    backgroundColor: '#E8E9ED',
  },
  stepChipActive: {
    backgroundColor: '#0B1120',
  },
  stepChipDisabled: {
    opacity: 0.45,
  },
  stepChipLabelActive: {
    color: '#ffffff',
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#ffffff',
  },
  unitRowSelected: {
    borderWidth: 1,
    borderColor: '#3c87f7',
  },
  unitCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  roomBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C8CAD0',
  },
  findingBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C8CAD0',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  fieldGrow: {
    flex: 1,
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#ffffff',
    color: '#0B1120',
    fontSize: 16,
  },
  notesInput: {
    minHeight: 72,
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
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C8CAD0',
  },
  choiceChipActive: {
    backgroundColor: '#3c87f7',
    borderColor: '#3c87f7',
  },
  choiceChipLabelActive: {
    color: '#ffffff',
  },
  primaryButton: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#3c87f7',
  },
  primaryButtonLabel: {
    color: '#ffffff',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    borderColor: '#8b8f97',
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  errorText: {
    color: '#d13c3c',
  },
  summaryList: {
    gap: Spacing.one,
  },
  summaryFinding: {
    gap: Spacing.one,
  },
});
