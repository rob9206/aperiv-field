import type {
  DraftStoreRepository,
  CommitRoomScanInput,
  CommitRoomScanResult,
} from './draft-store.ts';
import type {
  DraftStore,
  ManualWalkthroughDraft,
  RoomPhoto,
} from './walkthrough-draft.ts';
import type { RoomScanArtifact } from './walkthrough-schema.ts';

export type CaptureRoots = {
  scans: string;
  photos: string;
};

export type CaptureFileEntry = {
  kind: 'file' | 'directory';
  uri: string;
};

export type CaptureFileAdapter = {
  roots: CaptureRoots;
  copyPhoto(draftId: string, sourceUri: string): RoomPhoto;
  deleteFile(uriOrPath: string): void;
  deleteDirectory(uriOrPath: string): void;
  listEntries(root: string): CaptureFileEntry[];
};

export type CaptureCleanupPlan = {
  deleteFiles: string[];
  deleteDirectories: string[];
};

type ScanExportPaths = Pick<RoomScanArtifact, 'jsonPath' | 'usdzPath'>;

function canonicalLocalPath(uriOrPath: string): string | null {
  if (
    typeof uriOrPath !== 'string' ||
    uriOrPath.length === 0 ||
    uriOrPath.trim() !== uriOrPath ||
    uriOrPath.includes('\0')
  ) {
    return null;
  }

  let path = uriOrPath;
  if (path.startsWith('file://')) {
    path = path.slice('file://'.length);
    if (path.startsWith('localhost/')) {
      path = path.slice('localhost'.length);
    } else if (!path.startsWith('/')) {
      return null;
    }
  } else if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(path)) {
    return null;
  }

  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (!path.startsWith('/') || path.includes('\0')) {
    return null;
  }

  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

function canonicalRoots(roots: CaptureRoots): string[] {
  return [roots.scans, roots.photos]
    .map(canonicalLocalPath)
    .filter((root): root is string => root !== null && root !== '/');
}

function isOwnedDescendant(path: string, roots: readonly string[]): boolean {
  return roots.some((root) => path.startsWith(`${root}/`));
}

function referencedCanonicalPaths(store: DraftStore): Set<string> {
  const paths = new Set<string>();
  for (const current of Object.values(store.drafts)) {
    for (const path of capturePathsForDraft(current)) {
      const canonical = canonicalLocalPath(path);
      if (canonical !== null) {
        paths.add(canonical);
      }
    }
  }
  return paths;
}

export function scanPathsForArtifact(
  artifact: RoomScanArtifact
): [string, string] {
  return [artifact.jsonPath, artifact.usdzPath];
}

export function scanPathsForDraft(
  draft: ManualWalkthroughDraft
): string[] {
  return draft.rooms.flatMap((room) =>
    room.scanArtifact ? scanPathsForArtifact(room.scanArtifact) : []
  );
}

export function photoPathsForDraft(
  draft: ManualWalkthroughDraft
): string[] {
  return draft.rooms.flatMap((room) => room.photos.map((photo) => photo.uri));
}

export function capturePathsForDraft(
  draft: ManualWalkthroughDraft
): string[] {
  return [...photoPathsForDraft(draft), ...scanPathsForDraft(draft)];
}

export function planUnreferencedCapturePaths(
  candidates: readonly string[],
  committedStore: DraftStore,
  roots: CaptureRoots
): string[] {
  const ownedRoots = canonicalRoots(roots);
  const referenced = referencedCanonicalPaths(committedStore);
  return candidates.filter((candidate) => {
    const canonical = canonicalLocalPath(candidate);
    return (
      canonical !== null &&
      isOwnedDescendant(canonical, ownedRoots) &&
      !referenced.has(canonical)
    );
  });
}

export function planOrphanSweep(
  committedStore: DraftStore,
  roots: CaptureRoots,
  actualEntries: readonly CaptureFileEntry[]
): CaptureCleanupPlan {
  const ownedRoots = canonicalRoots(roots);
  const referenced = referencedCanonicalPaths(committedStore);
  const deleteFiles: string[] = [];
  const deleteDirectories: string[] = [];

  for (const entry of actualEntries) {
    const canonical = canonicalLocalPath(entry.uri);
    if (
      canonical === null ||
      !isOwnedDescendant(canonical, ownedRoots)
    ) {
      continue;
    }
    if (entry.kind === 'file') {
      if (!referenced.has(canonical)) {
        deleteFiles.push(entry.uri);
      }
      continue;
    }
    const containsReference = [...referenced].some(
      (path) => path === canonical || path.startsWith(`${canonical}/`)
    );
    if (!containsReference) {
      deleteDirectories.push(entry.uri);
    }
  }

  return { deleteFiles, deleteDirectories };
}

export function createCaptureFileService(adapter: CaptureFileAdapter) {
  const roots = adapter.roots;
  const ownedRoots = canonicalRoots(roots);

  function isOwned(uriOrPath: string): boolean {
    const canonical = canonicalLocalPath(uriOrPath);
    return canonical !== null && isOwnedDescendant(canonical, ownedRoots);
  }

  function deleteLocalFile(uriOrPath: string): void {
    if (!isOwned(uriOrPath)) {
      return;
    }
    try {
      adapter.deleteFile(uriOrPath);
    } catch {
      // Metadata is authoritative; a later sweep can retry an orphan.
    }
  }

  function deleteLocalDirectory(uriOrPath: string): void {
    if (!isOwned(uriOrPath)) {
      return;
    }
    try {
      adapter.deleteDirectory(uriOrPath);
    } catch {
      // Empty/orphaned directories are safe to retry during a later sweep.
    }
  }

  function deleteScanArtifactFiles(artifact: RoomScanArtifact): void {
    for (const path of scanPathsForArtifact(artifact)) {
      deleteLocalFile(path);
    }
  }

  function deleteDraftCaptureFiles(draft: ManualWalkthroughDraft): void {
    for (const path of capturePathsForDraft(draft)) {
      deleteLocalFile(path);
    }
  }

  function deleteUnreferenced(
    candidates: readonly string[],
    committedStore: DraftStore
  ): void {
    for (const path of planUnreferencedCapturePaths(
      candidates,
      committedStore,
      roots
    )) {
      deleteLocalFile(path);
    }
  }

  function sweepOrphans(committedStore: DraftStore): void {
    const entries: CaptureFileEntry[] = [];
    for (const root of [roots.scans, roots.photos]) {
      try {
        entries.push(...adapter.listEntries(root));
      } catch {
        // A missing or unreadable root must not block sweeping the other root.
      }
    }
    const plan = planOrphanSweep(committedStore, roots, entries);
    for (const path of plan.deleteFiles) {
      deleteLocalFile(path);
    }
    for (const path of [...plan.deleteDirectories].sort(
      (left, right) =>
        (canonicalLocalPath(right)?.split('/').length ?? 0) -
        (canonicalLocalPath(left)?.split('/').length ?? 0)
    )) {
      deleteLocalDirectory(path);
    }
  }

  return {
    roots,
    copyPhoto: adapter.copyPhoto,
    deleteLocalFile,
    deleteScanArtifactFiles,
    deleteDraftCaptureFiles,
    deleteUnreferenced,
    sweepOrphans,
  };
}

export type CaptureFileService = ReturnType<typeof createCaptureFileService>;

export function createCaptureFileLifecycle(
  repository: DraftStoreRepository,
  files: CaptureFileService
) {
  let operationChain: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = operationChain.then(operation, operation);
    operationChain = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  async function cleanAgainstLatest(candidates: readonly string[]) {
    try {
      const current = await repository.loadDraftStore();
      files.deleteUnreferenced(candidates, current);
    } catch {
      // Without committed truth it is not safe to delete; sweep can recover.
    }
  }

  function loadDraftStore() {
    return repository.loadDraftStore();
  }

  function addPhotos(input: {
    draftId: string;
    roomId: string;
    sourceUris: readonly string[];
  }) {
    return enqueue(async () => {
      const copied: RoomPhoto[] = [];
      try {
        for (const sourceUri of input.sourceUris) {
          copied.push(files.copyPhoto(input.draftId, sourceUri));
        }
      } catch (error) {
        for (const current of copied) {
          files.deleteLocalFile(current.uri);
        }
        throw error;
      }

      try {
        const committed = await repository.mutateDraftById(
          input.draftId,
          (current) => {
            const roomIndex = current.rooms.findIndex(
              (room) => room.id === input.roomId
            );
            if (roomIndex < 0) {
              return null;
            }
            return {
              draft: {
                ...current,
                rooms: current.rooms.map((room, index) =>
                  index === roomIndex
                    ? {
                        ...room,
                        photos: [...room.photos, ...copied],
                        skipped: false,
                      }
                    : room
                ),
                completedAt: undefined,
                guidePhase: 'room',
              },
              value: copied,
            };
          }
        );
        if (committed === null) {
          await cleanAgainstLatest(copied.map((current) => current.uri));
        }
        return committed;
      } catch (error) {
        await cleanAgainstLatest(copied.map((current) => current.uri));
        throw error;
      }
    });
  }

  function removePhoto(input: {
    draftId: string;
    roomId: string;
    photoId: string;
  }) {
    return enqueue(async () => {
      const committed = await repository.mutateDraftById(
        input.draftId,
        (current) => {
          const roomIndex = current.rooms.findIndex(
            (room) => room.id === input.roomId
          );
          if (roomIndex < 0) {
            return null;
          }
          const removed = current.rooms[roomIndex].photos.find(
            (entry) => entry.id === input.photoId
          );
          if (!removed) {
            return null;
          }
          return {
            draft: {
              ...current,
              rooms: current.rooms.map((room, index) =>
                index === roomIndex
                  ? {
                      ...room,
                      photos: room.photos.filter(
                        (entry) => entry.id !== input.photoId
                      ),
                    }
                  : room
              ),
              completedAt: undefined,
            },
            value: removed,
          };
        }
      );
      if (committed !== null) {
        files.deleteUnreferenced(
          [committed.value.uri],
          committed.store
        );
      }
      return committed;
    });
  }

  function deleteDraft(draftId: string) {
    return enqueue(async () => {
      const committed = await repository.mutateDraftStore((current) => {
        const deleted = current.drafts[draftId];
        if (!deleted) {
          return null;
        }
        const { [draftId]: _deleted, ...drafts } = current.drafts;
        return {
          store: {
            activeDraftId:
              current.activeDraftId === draftId
                ? null
                : current.activeDraftId,
            drafts,
          },
          value: deleted,
        };
      });
      if (committed === null) {
        return null;
      }
      files.deleteUnreferenced(
        capturePathsForDraft(committed.value),
        committed.store
      );
      return {
        store: committed.store,
        deleted: committed.value,
      };
    });
  }

  function commitRoomScan(
    input: CommitRoomScanInput
  ): Promise<CommitRoomScanResult | null> {
    return enqueue(async () => {
      let committed: CommitRoomScanResult | null;
      try {
        committed = await repository.commitRoomScan(input);
      } catch (error) {
        await cleanAgainstLatest(scanPathsForArtifact(input.artifact));
        throw error;
      }
      if (committed === null) {
        await cleanAgainstLatest(scanPathsForArtifact(input.artifact));
        return null;
      }
      if (committed.replaced) {
        files.deleteUnreferenced(
          scanPathsForArtifact(committed.replaced),
          committed.store
        );
      }
      return committed;
    });
  }

  function cleanupExportedScanPaths(paths: ScanExportPaths) {
    return enqueue(() =>
      cleanAgainstLatest([paths.jsonPath, paths.usdzPath])
    );
  }

  function sweepOrphans() {
    return enqueue(async () => {
      const committed = await repository.loadDraftStore();
      files.sweepOrphans(committed);
    });
  }

  return {
    loadDraftStore,
    addPhotos,
    removePhoto,
    deleteDraft,
    commitRoomScan,
    cleanupExportedScanPaths,
    sweepOrphans,
  };
}

export type CaptureFileLifecycle = ReturnType<
  typeof createCaptureFileLifecycle
>;
