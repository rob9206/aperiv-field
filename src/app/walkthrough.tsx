import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ManualWalkthrough } from '@/components/manual-walkthrough';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  RoomScanView,
  addErrorListener,
  addProcessedListener,
  addStatusChangeListener,
  cancelSession,
  exportResults,
  finishSession,
  isSupported,
  share,
  startSession,
  type RoomScanExportResult,
} from '../../modules/expo-room-scan';

type ScanState =
  | { phase: 'checking' }
  | { phase: 'manual'; lidarAvailable: boolean }
  | { phase: 'ready' }
  | { phase: 'scanning' }
  | { phase: 'processing' }
  | { phase: 'complete'; results: RoomScanExportResult; shareError?: string }
  | { phase: 'error'; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected room scanning error occurred.';
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export default function WalkthroughScreen() {
  const theme = useTheme();
  const [scanState, setScanState] = useState<ScanState>({ phase: 'checking' });
  const activeScanId = useRef<string | null>(null);
  const startRequested = useRef(false);
  const stopRequested = useRef(false);
  const exportInFlight = useRef(false);

  const enterManual = useCallback((lidarAvailable: boolean) => {
    stopRequested.current = false;
    startRequested.current = false;
    exportInFlight.current = false;
    activeScanId.current = null;
    setScanState({ phase: 'manual', lidarAvailable });
  }, []);

  const checkSupport = useCallback(async () => {
    stopRequested.current = false;

    try {
      const supported = await isSupported();
      // Manual capture is always available; LiDAR is an optional path.
      enterManual(supported);
    } catch (error) {
      setScanState({ phase: 'error', message: errorMessage(error) });
    }
  }, [enterManual]);

  const saveProcessedScan = useCallback(async () => {
    const scanId = activeScanId.current;
    if (!scanId || exportInFlight.current) {
      return;
    }

    exportInFlight.current = true;
    setScanState({ phase: 'processing' });

    try {
      const results = await exportResults(scanId);
      setScanState({ phase: 'complete', results });
    } catch (error) {
      setScanState({ phase: 'error', message: errorMessage(error) });
    } finally {
      exportInFlight.current = false;
    }
  }, []);

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
      addErrorListener(({ message }) => {
        stopRequested.current = false;
        setScanState({ phase: 'error', message });
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [saveProcessedScan]);

  useEffect(() => {
    if (scanState.phase !== 'scanning' || startRequested.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      startRequested.current = true;
      startSession().catch((error: unknown) => {
        stopRequested.current = false;
        setScanState({ phase: 'error', message: errorMessage(error) });
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [scanState.phase]);

  const beginScan = () => {
    activeScanId.current = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    startRequested.current = false;
    stopRequested.current = false;
    exportInFlight.current = false;
    setScanState({ phase: 'scanning' });
  };

  const finishScan = async () => {
    if (stopRequested.current) {
      return;
    }

    stopRequested.current = true;
    setScanState({ phase: 'processing' });

    try {
      await finishSession();
    } catch (error) {
      stopRequested.current = false;
      setScanState({ phase: 'error', message: errorMessage(error) });
    }
  };

  const cancelScan = async () => {
    if (stopRequested.current) {
      return;
    }

    stopRequested.current = true;

    try {
      await cancelSession();
      enterManual(true);
    } catch (error) {
      stopRequested.current = false;
      setScanState({ phase: 'error', message: errorMessage(error) });
    }
  };

  const shareResults = async (results: RoomScanExportResult) => {
    try {
      await share([results.usdzPath, results.jsonPath]);
      setScanState({ phase: 'complete', results });
    } catch (error) {
      setScanState({
        phase: 'complete',
        results,
        shareError: errorMessage(error),
      });
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
                    Move slowly and capture every wall.
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
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void finishScan()}
                    style={({ pressed }) => [
                      styles.overlayButton,
                      styles.doneButton,
                      pressed && styles.buttonPressed,
                    ]}>
                    <ThemedText type="smallBold" style={styles.overlayText}>
                      Done
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.processingCard}>
                <ActivityIndicator color="#3c87f7" size="large" />
                <ThemedText type="smallBold" style={styles.overlayText}>
                  Processing room scan…
                </ThemedText>
                <ThemedText type="small" style={styles.processingSecondaryText}>
                  Keep this screen open while RoomPlan builds the model.
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
              <ActivityIndicator color="#3c87f7" size="large" />
              <ThemedText type="small" themeColor="textSecondary">
                Preparing walkthrough capture…
              </ThemedText>
            </ThemedView>
          )}

          {scanState.phase === 'manual' && (
            <ManualWalkthrough
              lidarAvailable={scanState.lidarAvailable}
              onOpenLidar={
                scanState.lidarAvailable
                  ? () => setScanState({ phase: 'ready' })
                  : undefined
              }
            />
          )}

          {scanState.phase === 'ready' && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="subtitle">Room scan</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Walk the room slowly so LiDAR can capture walls, openings, fixtures, and
                furniture. You can save the finished model and share both source files.
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={beginScan}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold" style={styles.overlayText}>
                  Start room scan
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => enterManual(true)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.textSecondary },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold">Back to manual walkthrough</ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {scanState.phase === 'complete' && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="subtitle">Scan saved</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Both RoomPlan files are stored locally on this device.
              </ThemedText>
              <ThemedView style={styles.fileList}>
                <ThemedText type="smallBold">{fileName(scanState.results.usdzPath)}</ThemedText>
                <ThemedText type="smallBold">{fileName(scanState.results.jsonPath)}</ThemedText>
              </ThemedView>
              {scanState.shareError && (
                <ThemedText type="small" style={styles.errorText}>
                  {scanState.shareError}
                </ThemedText>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => void shareResults(scanState.results)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold" style={styles.overlayText}>
                  Share files
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => enterManual(true)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.textSecondary },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold">Back to walkthrough</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={beginScan}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.textSecondary },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold">Re-scan</ThemedText>
              </Pressable>
            </ThemedView>
          )}

          {scanState.phase === 'error' && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="subtitle">Scan interrupted</ThemedText>
              <ThemedText type="small" style={styles.errorText}>
                {scanState.message}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => enterManual(true)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold" style={styles.overlayText}>
                  Continue with manual capture
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setScanState({ phase: 'checking' });
                  void checkSupport();
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: theme.textSecondary },
                  pressed && styles.buttonPressed,
                ]}>
                <ThemedText type="smallBold">Try LiDAR again</ThemedText>
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
    backgroundColor: '#3c87f7',
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
  doneButton: {
    backgroundColor: '#3c87f7',
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
  fileList: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
  },
  errorText: {
    color: '#d13c3c',
  },
});
