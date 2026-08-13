export const SCAN_PROCESSING_TIMEOUT_MS = 60_000;

export type ProcessingTimeoutState = {
  activeScanId: string | null;
  timeoutScanId: string;
  stopRequested: boolean;
  exportInFlight: boolean;
};

export function shouldHandleProcessingTimeout({
  activeScanId,
  timeoutScanId,
  stopRequested,
  exportInFlight,
}: ProcessingTimeoutState): boolean {
  return (
    activeScanId === timeoutScanId &&
    stopRequested &&
    !exportInFlight
  );
}
