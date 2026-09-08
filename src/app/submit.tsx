import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OverflowButton } from '@/components/overflow-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { loadDraftStore, mutateDraftById } from '@/lib/draft-store';
import { isJobSent, matchJobDestination } from '@/lib/crew-workflow';
import { FieldSubmissionError } from '@/lib/field-upload';
import {
  fieldSubmissionEnabled,
  findCompletedFieldSubmission,
  loadFieldRoster,
  sendFieldDraft,
} from '@/lib/field-submission-runtime';
import type { ManualWalkthroughDraft } from '@/lib/walkthrough-draft';
import type { Property, Unit } from '@/lib/database.types';
import { useAuth } from '@/providers/auth-provider';
import { useLocale } from '@/providers/locale-provider';

function SubmitButton({
  label,
  onPress,
  selected = false,
  disabled = false,
  primary = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  primary?: boolean;
  loading?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled, busy: loading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: primary || selected ? theme.accent : theme.border,
          backgroundColor: primary
            ? theme.accent
            : selected
              ? theme.backgroundSelected
              : theme.backgroundElement,
          opacity: disabled && !loading ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading && (
        <ActivityIndicator color={primary ? theme.onAccent : theme.accent} />
      )}
      {selected && (
        <ThemedText style={{ color: theme.accentText }}>✓</ThemedText>
      )}
      <ThemedText
        style={[
          styles.buttonLabel,
          {
            color: primary
              ? theme.onAccent
              : selected
                ? theme.accentText
                : theme.text,
          },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function SubmitScreen() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  if (authLoading) return null;
  if (!user) return <Redirect href="/login" />;
  if (!fieldSubmissionEnabled || Platform.OS === 'web')
    return <Redirect href="/" />;
  return <SubmissionForm key={`${user.id}:${draftId}`} draftId={draftId} />;
}

function SubmissionForm({ draftId }: { draftId: string }) {
  const { t } = useLocale();
  const { user } = useAuth();
  const userId = user?.id;
  const theme = useTheme();
  const [draft, setDraft] = useState<ManualWalkthroughDraft | null>(null);
  const [roster, setRoster] = useState<{
    properties: Property[];
    units: Unit[];
  } | null>(null);
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [choosingProperty, setChoosingProperty] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sendError, setSendError] = useState<FieldSubmissionError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [receiptFailed, setReceiptFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const property = roster?.properties.find((item) => item.id === propertyId);
  const unit = roster?.units.find((item) => item.id === unitId);
  const availableUnits =
    roster?.units.filter((item) => item.property_id === propertyId) ?? [];

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadDraftStore(), loadFieldRoster()])
      .then(async ([store, next]) => {
        if (cancelled) return;
        let saved = store.drafts[draftId];
        if (!saved?.completedAt) throw new Error('Save the job first');
        // Older builds did not keep receipts. Recover only this user's exact
        // saved revision; a network error leaves the local job usable.
        if (userId && !isJobSent(saved, userId)) {
          const remote = await findCompletedFieldSubmission(saved, userId).catch(() => null);
          if (cancelled) return;
          if (remote) {
            const receipt = {
              captureId: remote.id, userId: userId, unitId: remote.unit_id,
              completedAt: saved.completedAt, sentAt: new Date().toISOString(),
            };
            saved = { ...saved, submissionReceipt: receipt };
            try {
              const recovered = await mutateDraftById(saved.id, current =>
                current.completedAt === receipt.completedAt
                  ? { draft: { ...current, submissionReceipt: receipt }, value: undefined }
                  : null);
              if (!cancelled) setReceiptFailed(!recovered);
            } catch {
              if (!cancelled) setReceiptFailed(true);
            }
          }
        }
        if (cancelled) return;
        setDraft(saved);
        setRoster(next);
        const alreadySent = isJobSent(saved, userId);
        const sentUnit = alreadySent
          ? next.units.find(item => item.id === saved.submissionReceipt?.unitId)
          : null;
        const destination = sentUnit
          ? { propertyId: sentUnit.property_id, unitId: sentUnit.id }
          : alreadySent ? null : matchJobDestination(saved, next.properties, next.units);
        if (destination) {
          setPropertyId(destination.propertyId);
          setUnitId(destination.unitId);
          setChoosingProperty(false);
        }
        setSent(alreadySent);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, attempt, userId]);

  const send = async () => {
    if (!draft || !unitId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setShowOptions(false);
    setFailed(false);
    setSendError(null);
    try {
      // Reload the saved revision. Never send an out-of-date screen snapshot.
      const latest = (await loadDraftStore()).drafts[draft.id];
      if (!latest?.completedAt || latest.completedAt !== draft.completedAt)
        throw new FieldSubmissionError('job_changed');
      const captureId = await sendFieldDraft(latest, unitId);
      setSent(true);
      // A local receipt failure must never turn an acknowledged upload into
      // a "send failed" message. Retrying the same revision is idempotent.
      try {
        const committed = await mutateDraftById(latest.id, current => {
          if (current.completedAt !== latest.completedAt || !userId) return null;
          return {
            draft: { ...current, submissionReceipt: {
              captureId, userId: userId, unitId,
              completedAt: latest.completedAt!, sentAt: new Date().toISOString(),
            } },
            value: undefined,
          };
        });
        setReceiptFailed(!committed);
      } catch {
        setReceiptFailed(true);
      }
    } catch (error) {
      setFailed(true);
      setSendError(error instanceof FieldSubmissionError ? error : null);
    } finally {
      lock.current = false;
      setBusy(false);
      scroll.current?.scrollTo({ y: 0, animated: true });
    }
  };
  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['left', 'right', 'bottom']}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <ThemedText accessibilityRole="header" style={[styles.title, { flex: 1 }]}>
              {t(sent ? 'sentTitle' : 'reviewDestination')}
            </ThemedText>
            <OverflowButton open={showOptions} onPress={() => setShowOptions(value => !value)} disabled={busy} />
          </View>
          {showOptions && draft ? (
            <View style={styles.section}>
              <SubmitButton label={t('viewJob')} disabled={busy}
                onPress={() => router.replace({ pathname: '/walkthrough', params: { mode: 'resume', id: draftId } })} />
              {!sent ? <SubmitButton label={t('changeDestination')} disabled={busy}
                onPress={() => { setChoosingProperty(true); setUnitId(''); setShowOptions(false); }} /> : null}
            </View>
          ) : null}
          {sent ? (
            <View
              style={[
                styles.card,
                styles.successCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.accent,
                },
              ]}
              accessibilityLiveRegion="polite"
            >
              <View
                style={[styles.successMark, { backgroundColor: theme.accent }]}
              >
                <ThemedText
                  style={{
                    color: theme.onAccent,
                    fontSize: 30,
                    lineHeight: 36,
                  }}
                >
                  ✓
                </ThemedText>
              </View>
              <ThemedText type="heading" style={styles.centered}>
                {property?.name ?? draft?.property} · {t('unit')} {unit?.unit_number ?? draft?.unit}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.centered}>
                {t('sentToManager')}
              </ThemedText>
              {receiptFailed ? (
                <ThemedText style={{ color: theme.danger }}>{t('sentReceiptFailed')}</ThemedText>
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <ThemedText themeColor="textSecondary">
                  {t('sendKeepsCopy')}
                </ThemedText>
              </View>
              {draft ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('savedJob')}: {draft.property} · {draft.unit}
                </ThemedText>
              ) : null}
              {failed && (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  style={{ color: theme.danger }}
                >
                  {!roster
                    ? t('loadSendFailed')
                    : sendError
                      ? t(
                          {
                            missing_scan: 'sendMissingScan',
                            missing_photo: 'sendMissingPhoto',
                            file_too_large: 'sendFileTooLarge',
                            upload_failed: 'sendUploadFailed',
                            finalize_failed: 'sendFinalizeFailed',
                            job_changed: 'sendJobChanged',
                          }[sendError.code] as Parameters<typeof t>[0],
                        )
                      : t('sendFailed')}
                  {sendError?.roomName ? ` (${sendError.roomName})` : ''}
                </ThemedText>
              )}
              {failed && draft && !showOptions && (
                <SubmitButton
                  label={t('viewJob')}
                  disabled={busy}
                  onPress={() =>
                    router.replace({
                      pathname: '/walkthrough',
                      params: { mode: 'resume', id: draft.id },
                    })
                  }
                />
              )}
              {!roster ? (
                failed ? (
                  <SubmitButton
                    label={t('retryLoad')}
                    onPress={() => {
                      setFailed(false);
                      setAttempt((value) => value + 1);
                    }}
                  />
                ) : (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={theme.accent} />
                    <ThemedText>{t('loading')}</ThemedText>
                  </View>
                )
              ) : property && unit && !choosingProperty ? (
                <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">{property.name}</ThemedText>
                  <ThemedText type="heading">{unit.unit_number}</ThemedText>
                </View>
              ) : (
                <>
                  <View style={styles.section}>
                    <ThemedText type="heading">
                      {t('chooseProperty')}
                    </ThemedText>
                    {property && !choosingProperty ? (
                      <View
                        style={[
                          styles.card,
                          {
                            backgroundColor: theme.backgroundElement,
                            borderColor: theme.accent,
                          },
                        ]}
                      >
                        <ThemedText type="heading">{property.name}</ThemedText>

                      </View>
                    ) : (
                      roster.properties.map((property) => (
                        <SubmitButton
                          key={property.id}
                          label={property.name}
                          onPress={() => {
                            setPropertyId(property.id);
                            setUnitId('');
                            setChoosingProperty(false);
                            scroll.current?.scrollTo({ y: 0, animated: true });
                          }}
                          selected={propertyId === property.id}
                          disabled={busy}
                        />
                      ))
                    )}
                  </View>
                  {!!propertyId && !choosingProperty && (
                    <View style={styles.section}>
                      <ThemedText type="heading">{t('chooseUnit')}</ThemedText>
                      {unit ? (
                        <View style={[styles.card, { borderColor: theme.accent }]}>
                          <ThemedText type="heading">{unit.unit_number}</ThemedText>
                        </View>
                      ) : <View style={styles.units}>
                        {availableUnits.map((unit) => (
                          <View key={unit.id} style={styles.unit}>
                            <SubmitButton
                              label={`${t('unit')} ${unit.unit_number}`}
                              onPress={() => setUnitId(unit.id)}
                              selected={unitId === unit.id}
                              disabled={busy}
                            />
                          </View>
                        ))}
                      </View>}
                    </View>
                  )}
                  {(roster.units.length === 0 ||
                    (!!propertyId && availableUnits.length === 0)) && (
                    <ThemedText>{t('noRemoteUnits')}</ThemedText>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          {sent ? (
            <SubmitButton
              label={t('myJobs')}
              onPress={() => router.replace('/')}
              primary
            />
          ) : (
            <>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.centered}
                accessibilityLiveRegion="polite"
              >
                {busy
                  ? t('sending')
                  : property && unit
                    ? `${t('sendToLabel')} ${property.name} · ${t('unit')} ${unit.unit_number}`
                    : t('sendSelectUnitHint')}
              </ThemedText>
              <SubmitButton
                label={
                  busy
                    ? t('sendingShort')
                    : failed
                      ? t('retrySend')
                      : t('sendToManager')
                }
                onPress={() => void send()}
                primary
                loading={busy}
                disabled={busy || !unitId || !draft}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 24, flexGrow: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  section: { gap: 12 },
  card: { padding: 16, gap: 8, borderWidth: 1, borderRadius: 16 },
  successCard: { alignItems: 'center', paddingVertical: 32, gap: 16 },
  successMark: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  unit: { flexBasis: '45%', flexGrow: 1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonLabel: { textAlign: 'center', flexShrink: 1, fontWeight: '700' },
});
