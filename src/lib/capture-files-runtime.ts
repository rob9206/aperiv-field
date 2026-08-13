import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  createCaptureFileLifecycle,
  createCaptureFileService,
  type CaptureFileEntry,
} from './capture-files';
import { draftStoreRepository } from './draft-store';
import { newId, type RoomPhoto } from './walkthrough-draft';

const SCANS_DIR = 'scans';
const PHOTOS_DIR = 'walkthrough-photos';

function assertSafeSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${label} is not a safe local path segment`);
  }
}

function listDirectoryTree(rootUri: string): CaptureFileEntry[] {
  const root = new Directory(rootUri);
  if (!root.exists) {
    return [];
  }

  const entries: CaptureFileEntry[] = [];
  const visit = (directory: Directory) => {
    for (const entry of directory.list()) {
      if (entry instanceof Directory) {
        entries.push({ kind: 'directory', uri: entry.uri });
        visit(entry);
      } else {
        entries.push({ kind: 'file', uri: entry.uri });
      }
    }
  };
  visit(root);
  return entries;
}

function copyPhoto(draftId: string, sourceUri: string): RoomPhoto {
  assertSafeSegment(draftId, 'Draft ID');
  const directory = new Directory(Paths.document, PHOTOS_DIR, draftId);
  directory.create({ idempotent: true, intermediates: true });

  const id = newId('photo');
  assertSafeSegment(id, 'Photo ID');
  const source = new File(sourceUri);
  const extension = /^\.[A-Za-z0-9]{1,10}$/.test(source.extension)
    ? source.extension
    : '.jpg';
  const destination = new File(directory, `${id}${extension}`);
  source.copySync(destination);
  return { id, uri: destination.uri };
}

export const captureFileService = createCaptureFileService({
  enabled: Platform.OS !== 'web',
  getRoots() {
    return {
      scans: new Directory(Paths.document, SCANS_DIR).uri,
      photos: new Directory(Paths.document, PHOTOS_DIR).uri,
    };
  },
  copyPhoto,
  deleteFile(uriOrPath) {
    const file = new File(uriOrPath);
    if (file.exists) {
      file.delete();
    }
  },
  deleteDirectory(uriOrPath) {
    const directory = new Directory(uriOrPath);
    if (directory.exists) {
      directory.delete();
    }
  },
  listEntries: listDirectoryTree,
});

export const captureFileLifecycle = createCaptureFileLifecycle(
  draftStoreRepository,
  captureFileService
);
