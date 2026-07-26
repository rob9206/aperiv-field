import ExpoRoomScanModule from './src/ExpoRoomScanModule';
import RoomScanView from './src/ExpoRoomScanView';
import type {
  RoomScanErrorEvent,
  RoomScanExportResult,
  RoomScanStatusChangeEvent,
  RoomScanSubscription,
} from './src/ExpoRoomScan.types';

export { RoomScanView };
export type {
  ExpoRoomScanModuleEvents,
  ExpoRoomScanViewProps,
  RoomScanErrorEvent,
  RoomScanExportResult,
  RoomScanStatus,
  RoomScanStatusChangeEvent,
  RoomScanSubscription,
} from './src/ExpoRoomScan.types';

function emptySubscription(): RoomScanSubscription {
  return { remove() {} };
}

export async function isSupported(): Promise<boolean> {
  return ExpoRoomScanModule?.isSupported() ?? false;
}

export async function startSession(): Promise<void> {
  await ExpoRoomScanModule?.startSession();
}

export async function finishSession(): Promise<void> {
  await ExpoRoomScanModule?.finishSession();
}

export async function cancelSession(): Promise<void> {
  await ExpoRoomScanModule?.cancelSession();
}

export async function exportResults(scanId: string): Promise<RoomScanExportResult> {
  if (!ExpoRoomScanModule) {
    throw new Error('Room scanning is not available on this platform.');
  }

  return ExpoRoomScanModule.exportResults(scanId);
}

export async function share(paths: string[]): Promise<void> {
  await ExpoRoomScanModule?.share(paths);
}

export function addStatusChangeListener(
  listener: (event: RoomScanStatusChangeEvent) => void
): RoomScanSubscription {
  return ExpoRoomScanModule?.addListener('onStatusChange', listener) ?? emptySubscription();
}

export function addProcessedListener(listener: () => void): RoomScanSubscription {
  return (
    ExpoRoomScanModule?.addListener('onProcessed', () => {
      listener();
    }) ?? emptySubscription()
  );
}

export function addErrorListener(
  listener: (event: RoomScanErrorEvent) => void
): RoomScanSubscription {
  return ExpoRoomScanModule?.addListener('onError', listener) ?? emptySubscription();
}

const ExpoRoomScan = {
  isSupported,
  startSession,
  finishSession,
  cancelSession,
  exportResults,
  share,
  addStatusChangeListener,
  addProcessedListener,
  addErrorListener,
  RoomScanView,
};

export default ExpoRoomScan;
