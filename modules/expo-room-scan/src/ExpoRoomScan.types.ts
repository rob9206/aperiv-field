import type { StyleProp, ViewStyle } from 'react-native';

export type ExpoRoomScanModuleEvents = {
  onStatusChange: (event: RoomScanStatusChangeEvent) => void;
  onProcessed: () => void;
  onError: (event: RoomScanErrorEvent) => void;
};

export type RoomScanStatus =
  | 'ready'
  | 'scanning'
  | 'processing'
  | 'processed'
  | 'cancelled'
  | 'error';

export type RoomScanStatusChangeEvent = {
  status: RoomScanStatus;
};

export type RoomScanErrorEvent = {
  message: string;
};

export type RoomScanExportResult = {
  usdzPath: string;
  jsonPath: string;
};

export type RoomScanSubscription = {
  remove(): void;
};

export type ExpoRoomScanViewProps = {
  style?: StyleProp<ViewStyle>;
};
