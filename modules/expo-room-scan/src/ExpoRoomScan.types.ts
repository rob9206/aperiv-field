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
  /** Floor area in square meters when native export computed it. */
  areaSquareMeters?: string;
  /** Floor area in square feet when native export computed it. */
  areaSquareFeet?: string;
};

export type RoomScanSubscription = {
  remove(): void;
};

export type ExpoRoomScanViewProps = {
  style?: StyleProp<ViewStyle>;
};
