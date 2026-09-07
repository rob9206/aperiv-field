import type { Asset } from './field-submission.ts';
import { resolveCaptureFileUri } from './capture-paths.ts';

export type SubmissionErrorCode = 'missing_scan' | 'missing_photo' | 'file_too_large' | 'upload_failed' | 'finalize_failed' | 'job_changed';

export class FieldSubmissionError extends Error {
  code: SubmissionErrorCode;
  roomName?: string;
  constructor(code: SubmissionErrorCode, roomName?: string) {
    super(code);
    this.name = 'FieldSubmissionError';
    this.code = code;
    this.roomName = roomName;
  }
}

type CaptureFile = {
  exists: boolean;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export async function uploadFieldAsset(
  asset: Asset,
  root: string,
  open: (uri: string) => CaptureFile,
  upload: (body: ArrayBuffer) => Promise<void>
) {
  const missing = asset.bucket === 'walkthrough-scans' ? 'missing_scan' : 'missing_photo';
  const uri = resolveCaptureFileUri(asset.uri, root);
  if (!uri) throw new FieldSubmissionError(missing, asset.roomName);
  let body: ArrayBuffer;
  try {
    const file = open(uri);
    if (!file.exists || file.size <= 0) throw new FieldSubmissionError(missing, asset.roomName);
    if (file.size > 50 * 1024 * 1024) throw new FieldSubmissionError('file_too_large', asset.roomName);
    body = await file.arrayBuffer();
  } catch (error) {
    if (error instanceof FieldSubmissionError) throw error;
    throw new FieldSubmissionError(missing, asset.roomName);
  }
  try { await upload(body); } catch { throw new FieldSubmissionError('upload_failed', asset.roomName); }
}
