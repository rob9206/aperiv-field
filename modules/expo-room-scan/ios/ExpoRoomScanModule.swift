import ExpoModulesCore

#if os(iOS)
import UIKit
#endif

#if os(iOS) && canImport(RoomPlan)
import RoomPlan
#endif

public final class ExpoRoomScanModule: Module {
  private weak var activeView: RoomScanView?
  private var isScanning = false
  private var isProcessing = false
  private var isCancelled = false
  private var didEmitTerminalError = false

  #if os(iOS) && canImport(RoomPlan)
  @available(iOS 16.0, *)
  private lazy var roomCaptureSessionConfiguration = RoomCaptureSession.Configuration()

  @available(iOS 16.0, *)
  private var finalResults: CapturedRoom?
  #endif

  public func definition() -> ModuleDefinition {
    Name("ExpoRoomScan")

    Events("onStatusChange", "onProcessed", "onError")

    AsyncFunction("isSupported") { () -> Bool in
      #if os(iOS) && canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        return RoomCaptureSession.isSupported
      }
      #endif

      return false
    }

    AsyncFunction("startSession") {
      #if os(iOS) && canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        try self.startRoomCaptureSession()
        return
      }
      #endif

      throw RoomScanUnsupportedException()
    }.runOnQueue(.main)

    AsyncFunction("finishSession") {
      #if os(iOS) && canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        try self.finishRoomCaptureSession()
        return
      }
      #endif

      throw RoomScanUnsupportedException()
    }.runOnQueue(.main)

    AsyncFunction("cancelSession") {
      #if os(iOS) && canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        self.cancelRoomCaptureSession()
        return
      }
      #endif

      throw RoomScanUnsupportedException()
    }.runOnQueue(.main)

    AsyncFunction("exportResults") { (scanId: String) -> [String: String] in
      #if os(iOS) && canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        return try self.exportRoomCaptureResults(scanId: scanId)
      }
      #endif

      throw RoomScanUnsupportedException()
    }.runOnQueue(.main)

    AsyncFunction("share") { (paths: [String], promise: Promise) in
      #if os(iOS)
      do {
        try self.presentShareSheet(paths: paths, promise: promise)
      } catch {
        promise.reject(error)
      }
      #else
      promise.reject(RoomScanUnsupportedException())
      #endif
    }.runOnQueue(.main)

    View(RoomScanView.self) {
    }
  }

  func register(view: RoomScanView) {
    activeView = view
    view.roomScanModule = self

    if !isScanning && !isProcessing {
      sendStatus("ready")
    }
  }

  func viewWillUnmount(_ view: RoomScanView) {
    guard activeView === view else {
      return
    }

    if isScanning || isProcessing {
      isCancelled = true
      isScanning = false
      isProcessing = false

      #if os(iOS) && canImport(RoomPlan)
      if #available(iOS 16.0, *) {
        finalResults = nil
      }
      #endif
    }

    activeView = nil
    view.roomScanModule = nil
  }

  private func sendStatus(_ status: String) {
    sendEvent("onStatusChange", [
      "status": status
    ])
  }

  private func reportRoomCaptureError(_ error: Error) {
    guard !isCancelled && !didEmitTerminalError else {
      return
    }

    didEmitTerminalError = true
    isScanning = false
    isProcessing = false
    sendStatus("error")
    sendEvent("onError", [
      "message": error.localizedDescription
    ])
  }

  #if os(iOS) && canImport(RoomPlan)

  @available(iOS 16.0, *)
  private func startRoomCaptureSession() throws {
    guard RoomCaptureSession.isSupported else {
      throw RoomScanUnsupportedException()
    }
    guard let activeView else {
      throw RoomScanViewUnavailableException()
    }
    guard !isScanning else {
      return
    }
    guard !isProcessing else {
      throw RoomScanSessionBusyException()
    }

    finalResults = nil
    isCancelled = false
    isProcessing = false
    didEmitTerminalError = false

    try activeView.startSession(configuration: roomCaptureSessionConfiguration)
    isScanning = true
    sendStatus("scanning")
  }

  @available(iOS 16.0, *)
  private func finishRoomCaptureSession() throws {
    guard RoomCaptureSession.isSupported else {
      throw RoomScanUnsupportedException()
    }
    guard let activeView else {
      throw RoomScanViewUnavailableException()
    }
    guard isScanning else {
      throw RoomScanSessionNotRunningException()
    }

    isScanning = false
    isProcessing = true
    isCancelled = false
    sendStatus("processing")
    activeView.stopSession()
  }

  @available(iOS 16.0, *)
  private func cancelRoomCaptureSession() {
    isCancelled = true
    isScanning = false
    isProcessing = false
    finalResults = nil
    activeView?.stopSession()
    sendStatus("cancelled")
  }

  @available(iOS 16.0, *)
  func captureViewShouldPresent(
    roomDataForProcessing: CapturedRoomData,
    error: Error?
  ) -> Bool {
    guard !isCancelled else {
      return false
    }

    if let error {
      reportRoomCaptureError(error)
      return false
    }

    return isProcessing
  }

  @available(iOS 16.0, *)
  func captureViewDidPresent(processedResult: CapturedRoom, error: Error?) {
    guard !isCancelled else {
      return
    }

    if let error {
      reportRoomCaptureError(error)
      return
    }
    guard isProcessing else {
      return
    }

    finalResults = processedResult
    isProcessing = false
    sendStatus("processed")
    sendEvent("onProcessed")
  }

  @available(iOS 16.0, *)
  func captureSessionDidEnd(error: Error?) {
    guard !isCancelled else {
      return
    }

    if let error {
      reportRoomCaptureError(error)
    } else if isScanning {
      reportRoomCaptureError(RoomScanUnexpectedEndException())
    }
  }

  @available(iOS 16.0, *)
  private func exportRoomCaptureResults(scanId: String) throws -> [String: String] {
    guard RoomCaptureSession.isSupported else {
      throw RoomScanUnsupportedException()
    }
    guard let finalResults else {
      throw RoomScanResultsUnavailableException()
    }

    let allowedCharacters = CharacterSet.alphanumerics.union(
      CharacterSet(charactersIn: "-_")
    )
    guard !scanId.isEmpty,
      scanId.count <= 128,
      scanId.unicodeScalars.allSatisfy({ allowedCharacters.contains($0) }) else {
      throw RoomScanInvalidIdentifierException(scanId)
    }

    let fileManager = FileManager.default
    guard let documentsURL = fileManager.urls(
      for: .documentDirectory,
      in: .userDomainMask
    ).first else {
      throw RoomScanDocumentsUnavailableException()
    }

    let scanDirectoryURL = documentsURL
      .appendingPathComponent("scans", isDirectory: true)
      .appendingPathComponent(scanId, isDirectory: true)

    guard !fileManager.fileExists(atPath: scanDirectoryURL.path) else {
      throw RoomScanIdentifierExistsException(scanId)
    }

    do {
      try fileManager.createDirectory(
        at: scanDirectoryURL,
        withIntermediateDirectories: true
      )

      let usdzURL = scanDirectoryURL.appendingPathComponent("Room.usdz")
      let jsonURL = scanDirectoryURL.appendingPathComponent("Room.json")

      let jsonData = try JSONEncoder().encode(finalResults)
      try jsonData.write(to: jsonURL, options: .atomic)
      try finalResults.export(to: usdzURL, exportOptions: .mesh)

      guard fileManager.fileExists(atPath: usdzURL.path),
        fileManager.fileExists(atPath: jsonURL.path) else {
        throw RoomScanIncompleteExportException()
      }

      return [
        "usdzPath": usdzURL.path,
        "jsonPath": jsonURL.path
      ]
    } catch {
      try? fileManager.removeItem(at: scanDirectoryURL)

      if let exception = error as? Exception {
        throw exception
      }
      throw RoomScanExportException(error.localizedDescription)
    }
  }

  #endif

  #if os(iOS)

  private func presentShareSheet(paths: [String], promise: Promise) throws {
    guard !paths.isEmpty else {
      throw RoomScanShareItemsMissingException()
    }

    let fileManager = FileManager.default
    let urls = try paths.map { path -> URL in
      let url = URL(fileURLWithPath: path)
      guard fileManager.fileExists(atPath: url.path) else {
        throw RoomScanShareFileMissingException(path)
      }
      return url
    }

    guard let viewController = appContext?.utilities?.currentViewController() else {
      throw RoomScanViewControllerUnavailableException()
    }

    let activityViewController = UIActivityViewController(
      activityItems: urls,
      applicationActivities: nil
    )
    activityViewController.completionWithItemsHandler = { _, _, _, error in
      if let error {
        promise.reject(error)
      } else {
        promise.resolve()
      }
    }

    if let popover = activityViewController.popoverPresentationController {
      popover.sourceView = viewController.view
      popover.sourceRect = CGRect(
        x: viewController.view.bounds.midX,
        y: viewController.view.bounds.midY,
        width: 0,
        height: 0
      )
    }

    viewController.present(activityViewController, animated: true)
  }

  #endif
}

final class RoomScanUnsupportedException: Exception {
  override var reason: String {
    "Room scanning requires an iOS 16 or newer LiDAR-equipped iPhone or iPad."
  }
}

private final class RoomScanViewUnavailableException: Exception {
  override var reason: String {
    "The RoomScanView must be mounted before starting a scan."
  }
}

private final class RoomScanSessionNotRunningException: Exception {
  override var reason: String {
    "There is no active room scan to finish."
  }
}

private final class RoomScanSessionBusyException: Exception {
  override var reason: String {
    "RoomPlan is still processing the previous scan."
  }
}

private final class RoomScanUnexpectedEndException: Exception {
  override var reason: String {
    "The room capture session ended before the scan was finished."
  }
}

private final class RoomScanResultsUnavailableException: Exception {
  override var reason: String {
    "RoomPlan has not finished processing a scan yet."
  }
}

private final class RoomScanInvalidIdentifierException: GenericException<String> {
  override var reason: String {
    "Invalid scan identifier '\(param)'. Use 1-128 letters, numbers, hyphens, or underscores."
  }
}

private final class RoomScanIdentifierExistsException: GenericException<String> {
  override var reason: String {
    "A saved scan already exists for identifier '\(param)'."
  }
}

private final class RoomScanDocumentsUnavailableException: Exception {
  override var reason: String {
    "The app's Documents directory is unavailable."
  }
}

private final class RoomScanIncompleteExportException: Exception {
  override var reason: String {
    "RoomPlan did not create both Room.usdz and Room.json."
  }
}

private final class RoomScanExportException: GenericException<String> {
  override var reason: String {
    "Unable to save the room scan: \(param)"
  }
}

private final class RoomScanShareItemsMissingException: Exception {
  override var reason: String {
    "At least one saved scan file is required to open the share sheet."
  }
}

private final class RoomScanShareFileMissingException: GenericException<String> {
  override var reason: String {
    "The file does not exist and cannot be shared: \(param)"
  }
}

private final class RoomScanViewControllerUnavailableException: Exception {
  override var reason: String {
    "No active view controller is available to present the share sheet."
  }
}
