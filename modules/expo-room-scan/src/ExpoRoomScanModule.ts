import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  ExpoRoomScanModuleEvents,
  RoomScanExportResult,
} from './ExpoRoomScan.types';

declare class ExpoRoomScanNativeModule extends NativeModule<ExpoRoomScanModuleEvents> {
  isSupported(): Promise<boolean>;
  startSession(): Promise<void>;
  finishSession(): Promise<void>;
  cancelSession(): Promise<void>;
  exportResults(scanId: string): Promise<RoomScanExportResult>;
  share(paths: string[]): Promise<void>;
}

export default requireOptionalNativeModule<ExpoRoomScanNativeModule>('ExpoRoomScan');
