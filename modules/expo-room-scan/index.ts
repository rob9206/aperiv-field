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

/** True when the ExpoRoomScan native module is present in this binary. */
export function isNativeModuleAvailable(): boolean {
  return ExpoRoomScanModule != null;
}

export async function isSupported(): Promise<boolean> {
  if (!ExpoRoomScanModule) {
    return false;
  }

  return ExpoRoomScanModule.isSupported();
}

export async function startSession(): Promise<void> {
  if (!ExpoRoomScanModule) {
    throw new Error(
      'Room scanning native module is missing from this app install. Install a new EAS iOS build that includes expo-room-scan.'
    );
  }

  await ExpoRoomScanModule.startSession();
}

export async function finishSession(): Promise<void> {
  if (!ExpoRoomScanModule) {
    throw new Error(
      'Room scanning native module is missing from this app install. Install a new EAS iOS build that includes expo-room-scan.'
    );
  }

  await ExpoRoomScanModule.finishSession();
}

export async function cancelSession(): Promise<void> {
  if (!ExpoRoomScanModule) {
    throw new Error(
      'Room scanning native module is missing from this app install. Install a new EAS iOS build that includes expo-room-scan.'
    );
  }

  await ExpoRoomScanModule.cancelSession();
}

export async function exportResults(scanId: string): Promise<RoomScanExportResult> {
  if (!ExpoRoomScanModule) {
    throw new Error(
      'Room scanning native module is missing from this app install. Install a new EAS iOS build that includes expo-room-scan.'
    );
  }

  return ExpoRoomScanModule.exportResults(scanId);
}

export async function share(paths: string[]): Promise<void> {
  if (!ExpoRoomScanModule) {
    throw new Error(
      'Room scanning native module is missing from this app install. Install a new EAS iOS build that includes expo-room-scan.'
    );
  }

  await ExpoRoomScanModule.share(paths);
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
  isNativeModuleAvailable,
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
