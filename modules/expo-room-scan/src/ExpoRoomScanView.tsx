import { requireNativeView } from 'expo';
import * as React from 'react';

import type { ExpoRoomScanViewProps } from './ExpoRoomScan.types';
import ExpoRoomScanModule from './ExpoRoomScanModule';

const NativeView: React.ComponentType<ExpoRoomScanViewProps> | null = ExpoRoomScanModule
  ? requireNativeView('ExpoRoomScan')
  : null;

export default function ExpoRoomScanView(props: ExpoRoomScanViewProps) {
  if (!NativeView) {
    return null;
  }

  return <NativeView {...props} />;
}
