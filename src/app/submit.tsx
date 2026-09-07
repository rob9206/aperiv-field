import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LanguageToggle } from '@/components/language-toggle';
import { useTheme } from '@/hooks/use-theme';
import { loadDraftStore } from '@/lib/draft-store';
import {
  fieldSubmissionEnabled,
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
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          borderColor: theme.border,
          backgroundColor: selected
            ? theme.backgroundSelected
            : theme.backgroundElement,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <ThemedText>{label}</ThemedText>
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
  const theme = useTheme();
  const [draft, setDraft] = useState<ManualWalkthroughDraft | null>(null);
  const [roster, setRoster] = useState<{
    properties: Property[];
    units: Unit[];
  } | null>(null);
  const [propertyId, setPropertyId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadDraftStore(), loadFieldRoster()])
      .then(([store, next]) => {
        if (cancelled) return;
        const saved = store.drafts[draftId];
        if (!saved?.completedAt) throw new Error('Save the job first');
        setDraft(saved);
        setRoster(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, attempt]);

  const send = async () => {
    if (!draft || !unitId || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {
      // Reload the saved revision. Never send an out-of-date screen snapshot.
      const latest = (await loadDraftStore()).drafts[draft.id];
      if (!latest?.completedAt || latest.completedAt !== draft.completedAt)
        throw new Error('Job changed');
      await sendFieldDraft(latest, unitId);
      setSent(true);
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <LanguageToggle />
          <ThemedText type="title">{t('sendToManager')}</ThemedText>
          {draft && (
            <ThemedText>
              {draft.property} · {t('unit')} {draft.unit}
            </ThemedText>
          )}
          <ThemedText themeColor="textSecondary">
            {t('sendKeepsCopy')}
          </ThemedText>
          {sent ? (
            <ThemedText accessibilityLiveRegion="polite">
              {t('sentToManager')}
            </ThemedText>
          ) : (
            <>
              {failed && (
                <ThemedText
                  accessibilityLiveRegion="polite"
                  style={{ color: theme.danger }}
                >
                  {t('sendFailed')}
                </ThemedText>
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
                  <ThemedText>{t('loading')}</ThemedText>
                )
              ) : (
                <>
                  <ThemedText type="heading">{t('chooseProperty')}</ThemedText>
                  {roster.properties.map((property) => (
                    <SubmitButton
                      key={property.id}
                      label={property.name}
                      onPress={() => {
                        setPropertyId(property.id);
                        setUnitId('');
                      }}
                      selected={propertyId === property.id}
                      disabled={busy}
                    />
                  ))}
                  {!!propertyId && (
                    <ThemedText type="heading">{t('chooseUnit')}</ThemedText>
                  )}
                  {roster.units
                    .filter((unit) => unit.property_id === propertyId)
                    .map((unit) => (
                      <SubmitButton
                        key={unit.id}
                        label={`${t('unit')} ${unit.unit_number}`}
                        onPress={() => setUnitId(unit.id)}
                        selected={unitId === unit.id}
                        disabled={busy}
                      />
                    ))}
                  {(roster.units.length === 0 ||
                    (!!propertyId &&
                      !roster.units.some(
                        (unit) => unit.property_id === propertyId
                      ))) && <ThemedText>{t('noRemoteUnits')}</ThemedText>}
                  <SubmitButton
                    label={busy ? t('sending') : t('sendToManager')}
                    onPress={() => void send()}
                    selected
                    disabled={busy || !unitId}
                  />
                </>
              )}
            </>
          )}
          <SubmitButton
            label={t('myJobs')}
            onPress={() => router.replace('/')}
            disabled={busy}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 14 },
  button: {
    minHeight: 52,
    padding: 14,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
  },
});
