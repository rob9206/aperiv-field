import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

type ProcessingModule = {
  SCAN_PROCESSING_TIMEOUT_MS?: unknown;
  shouldHandleProcessingTimeout?: (input: {
    activeScanId: string | null;
    timeoutScanId: string;
    stopRequested: boolean;
    exportInFlight: boolean;
  }) => boolean;
};

async function loadProcessingModule(): Promise<ProcessingModule> {
  const modulePath = './scan-processing.ts';
  return import(modulePath).catch(() => ({}));
}

describe('scan processing timeout', () => {
  it('uses an exact 60-second processing deadline', async () => {
    const processing = await loadProcessingModule();

    assert.equal(processing.SCAN_PROCESSING_TIMEOUT_MS, 60_000);
  });

  it('handles only the still-current unfinished processing attempt', async () => {
    const processing = await loadProcessingModule();
    const shouldHandle = processing.shouldHandleProcessingTimeout;
    assert.equal(typeof shouldHandle, 'function');
    if (!shouldHandle) {
      return;
    }

    const current = {
      activeScanId: 'scan-current',
      timeoutScanId: 'scan-current',
      stopRequested: true,
      exportInFlight: false,
    };
    assert.equal(shouldHandle(current), true);
    assert.equal(
      shouldHandle({ ...current, activeScanId: null }),
      false,
      'late processed events must be ignored after timeout'
    );
    assert.equal(
      shouldHandle({ ...current, timeoutScanId: 'scan-retried' }),
      false,
      'a retry must invalidate the old timeout'
    );
    assert.equal(
      shouldHandle({ ...current, stopRequested: false }),
      false,
      'an active scan that has not been finished must not time out'
    );
    assert.equal(
      shouldHandle({ ...current, exportInFlight: true }),
      false,
      'a processed event must win once export begins'
    );
  });

  it('wires timeout cancellation and clearing into the scan component', () => {
    const source = readFileSync(
      new URL('../app/walkthrough.tsx', import.meta.url),
      'utf8'
    );

    assert.match(source, /SCAN_PROCESSING_TIMEOUT_MS/);
    assert.match(source, /shouldHandleProcessingTimeout/);
    assert.match(
      source,
      /setTimeout\([\s\S]*SCAN_PROCESSING_TIMEOUT_MS[\s\S]*\)/
    );
    assert.match(source, /clearProcessingTimeout/);
    assert.match(
      source,
      /showScanError\('scanInterrupted', scan\.target\)[\s\S]*cancelSession\(\)/
    );
  });
});
