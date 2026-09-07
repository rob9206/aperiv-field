import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCaptureFileUri } from './capture-paths.ts';
import { FieldSubmissionError, uploadFieldAsset } from './field-upload.ts';
import type { Asset } from './field-submission.ts';

const oldDocuments = '/var/mobile/Containers/Data/Application/11111111-1111-1111-1111-111111111111/Documents';
const currentDocuments = 'file:///var/mobile/Containers/Data/Application/22222222-2222-2222-2222-222222222222/Documents';
const root = `${currentDocuments}/scans`;
const scan: Asset = {
  bucket: 'walkthrough-scans', path: 'field/user/submission/room/scan.usdz',
  uri: `${oldDocuments}/scans/saved-scan/Room.usdz`, contentType: 'model/vnd.usdz+zip', roomName: 'Living',
};

describe('capture file resolution and upload', () => {
  it('reads the preserved file in the current container and uploads its bytes', async () => {
    const body = new Uint8Array([1, 2, 3]).buffer;
    let uploaded = false;
    await uploadFieldAsset(scan, root, uri => {
      assert.equal(uri, `${root}/saved-scan/Room.usdz`);
      return { exists: true, size: body.byteLength, arrayBuffer: async () => body };
    }, async actual => { assert.equal(actual, body); uploaded = true; });
    assert.equal(uploaded, true);
  });

  it('normalizes native paths, file URLs, and the private var alias', () => {
    for (const uri of [scan.uri, `file://${scan.uri}`, `/private${scan.uri}`, `file:///private${scan.uri}`]) {
      assert.equal(resolveCaptureFileUri(uri, root), `${root}/saved-scan/Room.usdz`);
    }
    assert.equal(resolveCaptureFileUri(`${currentDocuments}/walkthrough-photos/job/photo.jpg`, `${currentDocuments}/walkthrough-photos`), `${currentDocuments}/walkthrough-photos/job/photo.jpg`);
  });

  it('rejects unrelated paths, traversal, foreign file hosts, and the wrong capture folder', () => {
    for (const uri of [
      '/tmp/scans/file.usdz', 'https://example.com/scans/file.usdz',
      `file://evil.example${scan.uri}`, `${oldDocuments}/scans/../private/file.usdz`,
      `${oldDocuments}/scans/%2e%2e/private/file.usdz`, `${oldDocuments}/scans/%252e%252e/file.usdz`,
      `${oldDocuments}/walkthrough-photos/job/photo.jpg`, `${oldDocuments}/scans`,
    ]) {
      const result = resolveCaptureFileUri(uri, root);
      if (uri.includes('%252e')) {
        // Double encoding remains a literal filename, never a parent directory.
        assert.equal(result, `${root}/%252e%252e/file.usdz`);
      } else assert.equal(result, null, uri);
    }
  });

  it('reports the missing room scan without uploading an empty or partial file', async () => {
    let uploaded = false;
    await assert.rejects(uploadFieldAsset(scan, root, () => ({ exists: false, size: 0, arrayBuffer: async () => new ArrayBuffer(0) }), async () => { uploaded = true; }), error => error instanceof FieldSubmissionError && error.code === 'missing_scan' && error.roomName === 'Living');
    assert.equal(uploaded, false);
  });

  it('distinguishes unreadable photos, oversized captures, and network failures', async () => {
    const photo: Asset = { ...scan, bucket: 'walkthrough-photos', uri: `${oldDocuments}/walkthrough-photos/job/photo.jpg` };
    await assert.rejects(uploadFieldAsset(photo, `${currentDocuments}/walkthrough-photos`, () => { throw new Error('native read'); }, async () => {}), { code: 'missing_photo' });
    await assert.rejects(uploadFieldAsset(scan, root, () => ({ exists: true, size: 51 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(1) }), async () => {}), { code: 'file_too_large' });
    await assert.rejects(uploadFieldAsset(scan, root, () => ({ exists: true, size: 1, arrayBuffer: async () => new ArrayBuffer(1) }), async () => { throw new Error('network'); }), { code: 'upload_failed' });
  });
});
