import ExpoModulesCore

#if os(iOS)
import UIKit
#endif

#if os(iOS) && canImport(RoomPlan)
import RoomPlan

@available(iOS 16.0, *)
final class RoomScanView: ExpoView, RoomCaptureViewDelegate, RoomCaptureSessionDelegate {
  weak var roomScanModule: ExpoRoomScanModule?

  private let roomCaptureView: RoomCaptureView?
  private var isSessionRunning = false
  private var hasBeenAttachedToWindow = false

  required init(appContext: AppContext? = nil) {
    if RoomCaptureSession.isSupported {
      let captureView = RoomCaptureView(frame: .zero)
      captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      roomCaptureView = captureView
    } else {
      roomCaptureView = nil
    }

    super.init(appContext: appContext)

    clipsToBounds = true
    backgroundColor = .black

    if let roomCaptureView {
      roomCaptureView.delegate = self
      roomCaptureView.captureSession.delegate = self
      addSubview(roomCaptureView)
    }

    if let module = appContext?.moduleRegistry.get(moduleWithName: "ExpoRoomScan") as? ExpoRoomScanModule {
      module.register(view: self)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    roomCaptureView?.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window != nil {
      hasBeenAttachedToWindow = true
    } else if hasBeenAttachedToWindow {
      roomScanModule?.viewWillUnmount(self)
      stopSession()
    }
  }

  func startSession(configuration: RoomCaptureSession.Configuration) throws {
    guard let roomCaptureView else {
      throw RoomScanUnsupportedException()
    }
    guard !isSessionRunning else {
      return
    }

    isSessionRunning = true
    roomCaptureView.captureSession.run(configuration: configuration)
  }

  func stopSession() {
    guard isSessionRunning else {
      return
    }

    isSessionRunning = false
    roomCaptureView?.captureSession.stop()
  }

  func captureView(
    shouldPresent roomDataForProcessing: CapturedRoomData,
    error: Error?
  ) -> Bool {
    return roomScanModule?.captureViewShouldPresent(
      roomDataForProcessing: roomDataForProcessing,
      error: error
    ) ?? false
  }

  func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
    roomScanModule?.captureViewDidPresent(processedResult: processedResult, error: error)
  }

  func captureSession(
    _ session: RoomCaptureSession,
    didEndWith data: CapturedRoomData,
    error: Error?
  ) {
    isSessionRunning = false
    roomScanModule?.captureSessionDidEnd(error: error)
  }

  deinit {
    roomScanModule?.viewWillUnmount(self)
    stopSession()
  }
}

#else

final class RoomScanView: ExpoView {
  weak var roomScanModule: ExpoRoomScanModule?
  private var hasBeenAttachedToWindow = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    #if os(iOS)
    clipsToBounds = true
    backgroundColor = .black
    #endif

    if let module = appContext?.moduleRegistry.get(moduleWithName: "ExpoRoomScan") as? ExpoRoomScanModule {
      module.register(view: self)
    }
  }

  #if os(iOS)
  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window != nil {
      hasBeenAttachedToWindow = true
    } else if hasBeenAttachedToWindow {
      roomScanModule?.viewWillUnmount(self)
    }
  }
  #endif

  deinit {
    roomScanModule?.viewWillUnmount(self)
  }
}

#endif
