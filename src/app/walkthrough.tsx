import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ManualWalkthrough,
  type ScanTarget,
} from '@/components/manual-walkthrough';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { commitRoomScan } from '@/lib/draft-store';
import { readVerifiedMeasurementFromExport } from '@/lib/read-roomplan-measure';
import type { TranslationKey } from '@/lib/i18n';
import type { RoomScanArtifact } from '@/lib/walkthrough-draft';
import { useLocale } from '@/providers/locale-provider';
import {
  RoomScanView,
  addErrorListener,
  addProcessedListener,
  addStatusChangeListener,
  cancelSession,
  exportResults,
  finishSession,
  isSupported,
  startSession,
} from '../../modules/expo-room-scan';

type ActiveScan = {
  scanId: string;
  target: ScanTarget;
};

type ScanState =
  | { phase: 'checking' }
  | {
      phase: 'manual';
      lidarAvailable: boolean;
      manualUnverified: boolean;
    }
  | { phase: 'ready'; scan: ActiveScan }
  | { phase: 'scanning' }
  | { phase: 'processing' }
  | {
      phase: 'error';
      messageKey: Extract<
        TranslationKey,
        'scanInterrupted' | 'scanMeasureFailed' | 'scanDraftMissing'
      >;
      retryTarget: ScanTarget;
    };

export default function WalkthroughScreen() {
  const theme = useTheme();
  const { t } = useLocale();
  const [scanState, setScanState] = useState<ScanState>({ phase: 'checking' });
  const activeScan = useRef<ActiveScan | null>(null);
  const startRequested = useRef(false);
  const stopRequested = useRef(false);
  const exportInFlight = useRef(false);

  const enterManual = useCallback(
    (lidarAvailable: boolean, manualUnverified = false) => {
      activeScan.current = null;
      stopRequested.current = false;
      startRequested.current = false;
      exportInFlight.current = false;
      setScanState({ phase: 'manual', lidarAvailable, manualUnverified });
    },
    []
  );

  const showScanError = useCallback(
    (
      messageKey: Extract<
        TranslationKey,
        'scanInterrupted' | 'scanMeasureFailed' | 'scanDraftMissing'
      >,
      retryTarget: ScanTarget
    ) => {
      activeScan.current = null;
      stopRequested.current = false;
      startRequested.current = false;
      exportInFlight.current = false;
      setScanState({ phase: 'error', messageKey, retryTarget });
    },
    []
  );

  const prepareScan = useCallback((target: ScanTarget) => {
    const scan: ActiveScan = {
      scanId: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      target,
    };
    activeScan.current = scan;
    stopRequested.current = false;
    startRequested.current = false;
    exportInFlight.current = false;
    setScanState({ phase: 'ready', scan });
  }, []);

  const saveProcessedScan = useCallback(async () => {
    const scan = activeScan.current;
    if (!scan || !stopRequested.current || exportInFlight.current) {
      return;
    }

    exportInFlight.current = true;
    setScanState({ phase: 'processing' });

    try {
      const results = await exportResults(scan.scanId);
      if (activeScan.current !== scan) {
        return;
      }
      const measurement = await readVerifiedMeasurementFromExport(results);
      if (activeScan.current !== scan) {
        return;
      }
      if (measurement === null) {
        showScanError('scanMeasureFailed', scan.target);
        return;
      }
      const artifact: RoomScanArtifact = {
        scanId: scan.scanId,
        jsonPath: results.jsonPath,
        usdzPath: results.usdzPath,
        measuredSqft: measurement.measuredSqft,
        source: measurement.source,
        capturedAt: new Date().toISOString(),
      };
      const committed = await commitRoomScan({
        draftId: scan.target.draftId,
        roomId: scan.target.roomId,
        artifact,
      });
      if (activeScan.current !== scan) {
        return;
      }
      if (committed === null) {
        showScanError('scanDraftMissing', scan.target);
        return;
      }
      enterManual(true);
    } catch {
      if (activeScan.current === scan) {
        showScanError('scanInterrupted', scan.target);
      }
    } finally {
      exportInFlight.current = false;
    }
  }, [enterManual, showScanError]);

  useEffect(() => {
    let isMounted = true;

    isSupported().then(
      (supported) => {
        if (isMounted) {
          enterManual(supported);
        }
      },
      (error: unknown) => {
        if (isMounted) {
          // RoomPlan probe failed — still allow the manual walkthrough.
          enterManual(false);
          console.warn('RoomPlan support check failed', error);
        }
      }
    );

    return () => {
      isMounted = false;
    };
  }, [enterManual]);

  useEffect(() => {
    const subscriptions = [
      addStatusChangeListener(({ status }) => {
        if (status === 'processing') {
          setScanState((current) =>
            current.phase === 'scanning' || current.phase === 'processing'
              ? { phase: 'processing' }
              : current
          );
        }
      }),
      addProcessedListener(() => {
        void saveProcessedScan();
      }),
      addErrorListener(() => {
        const scan = activeScan.current;
        if (scan) {
          showScanError('scanInterrupted', scan.target);
        }
      }),
    ];

    return () => {
      activeScan.current = null;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [saveProcessedScan, showScanError]);

  useEffect(() => {
    if (scanState.phase !== 'scanning' || startRequested.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const scan = activeScan.current;
      if (!scan) {
        return;
      }
      startRequested.current = true;
      startSession().catch(() => {
        if (activeScan.current === scan) {
          showScanError('scanInterrupted', scan.target);
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [scanState.phase, showScanError]);

  const beginScan = (scan: ActiveScan) => {
    if (activeScan.current !== scan) {
      return;
    }
    startRequested.current = false;
    stopRequested.current = false;
    exportInFlight.current = false;
    setScanState({ phase: 'scanning' });
  };

  const finishScan = async () => {
    const scan = activeScan.current;
    if (!scan || stopRequested.current) {
      return;
    }

    stopRequested.current = true;
    setScanState({ phase: 'processing' });

    try {
      await finishSession();
    } catch {
      if (activeScan.current === scan) {
        showScanError('scanInterrupted', scan.target);
      }
    }
  };

  const cancelScan = async () => {
    const scan = activeScan.current;
    if (!scan || stopRequested.current) {
      return;
    }

    stopRequested.current = true;
    activeScan.current = null;

    try {
      await cancelSession();
      enterManual(true);
    } catch {
      showScanError('scanInterrupted', scan.target);
    }
  };

  const isCapturing = scanState.phase === 'scanning' || scanState.phase === 'processing';

  if (isCapturing) {
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
        <View style={styles.scanContainer}>
          <RoomScanView style={StyleSheet.absoluteFill} />
          <SafeAreaView pointerEvents="box-none" style={styles.scanOverlay}>
            {scanState.phase === 'scanning' ? (
              <>
                <View style={styles.instructionPill}>
                  <ThemedText type="smallBold" style={styles.overlayText}>
                    {t('scanInstructions')}
                  </ThemedText>
                </View>
                <View style={styles.scanActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void cancelScan()}
                    style={({ pressed }) => [
                      styles.overlayButton,
                      styles.cancelButton,
                      pressed && styles.buttonPressed,
                    ]}>
                    <ThemedText type="smallBold" style={styles.overlayText}>
                      {t('scanCancel')}
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void finishScan()}
                    style={({ pressed }) => [
                      styles.overlayButton,
                      { backgroundColor: theme.accent },
                      pressed && styles.buttonPressed,
                    ]}>
                    <ThemedText type="smallBold" style={styles.overlayText}>
                      {t('scanDone')}
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.processingCard}>
                <ActivityIndicator color="#ffffff" size="large" />
                <ThemedText type="smallBold" style={styles.overlayText}>
                  {t('scanProcessing')}
                </ThemedText>
                <ThemedText type="small" style={styles.processingSecondaryText}>
                  {t('scanKeepOpen')}
                </ThemedText>
              </View>
            )}
          </SafeAreaView>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: true }} />
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['bottom', 'left', 'right']}>
          {scanState.phase === 'checking' && (
            <ThemedView type="backgroundElement" style={[styles.card, styles.centeredCard]}>
              <ActivityIndicator color={theme.accent} size="large" />
              <ThemedText type="small" themeColor="textSecondary">
                {t('scanPreparing')}
              </ThemedText>
            </ThemedView>
          )}

          {scanState.phase === 'manual' && (
            <ManualWalkthrough
              lidarAvailable={scanState.lidarAvailable}
              manualUnverified={scanState.manualUnverified}
              onOpenLidar={
                scanState.lidarAvailable
                  ? prepareScan
                  : undefined
              }
            />
          )}

          {scanState.phase === 'ready' && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="heading">{t('scanTitle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('scanInstructions')}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => beginScan(scanState.scan)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.accent },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold" style={styles.overlayText}>
                  {t('scanStart')}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => enterManual(true)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.border },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold">{t('back')}</ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {scanState.phase === 'error' && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="heading">{t('scanInterrupted')}</ThemedText>
              {scanState.messageKey !== 'scanInterrupted' ? (
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {t(scanState.messageKey)}
                </ThemedText>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => prepareScan(scanState.retryTarget)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.accent },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold" style={styles.overlayText}>
                  {t('scanRetry')}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => enterManual(true, true)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.border },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold">
                  {t('continueUnverified')}
                </ThemedText>
              </Pressable>
            </ThemedView>
          )}
        </SafeAreaView>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
  },
  centeredCard: {
    alignItems: 'center',
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
  scanContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scanOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  instructionPill: {
    alignSelf: 'center',
    maxWidth: 360,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  overlayText: {
    color: '#ffffff',
    textAlign: 'center',
  },
  scanActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  overlayButton: {
    minWidth: 112,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  cancelButton: {
    backgroundColor: 'rgba(35, 35, 38, 0.88)',
  },
  processingCard: {
    alignSelf: 'center',
    gap: Spacing.two,
    maxWidth: 320,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  processingSecondaryText: {
    color: '#d7d9dd',
    textAlign: 'center',
  },
});
