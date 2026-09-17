import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendTranscript,
  NOTE_SNIPPET_MAX,
  roomSummaryLine,
  speechLocaleForAppLocale,
} from './room-voice.ts';

describe('appendTranscript', () => {
  it('returns incoming text when notes are empty', () => {
    assert.equal(appendTranscript('', '  carpet stain  '), 'carpet stain');
    assert.equal(appendTranscript('   ', 'needs paint'), 'needs paint');
  });

  it('ignores empty incoming speech', () => {
    assert.equal(appendTranscript('existing note', '  '), 'existing note');
    assert.equal(appendTranscript('', ''), '');
  });

  it('appends with a space when notes already have text', () => {
    assert.equal(
      appendTranscript('Kitchen sink', 'leaks'),
      'Kitchen sink leaks'
    );
  });

  it('keeps a trailing newline instead of adding a space', () => {
    assert.equal(
      appendTranscript('Kitchen sink\n', 'leaks'),
      'Kitchen sink\nleaks'
    );
  });
});

describe('speechLocaleForAppLocale', () => {
  it('maps app locale to a speech locale', () => {
    assert.equal(speechLocaleForAppLocale('en'), 'en-US');
    assert.equal(speechLocaleForAppLocale('es'), 'es-US');
  });
});

describe('roomSummaryLine', () => {
  const labels = {
    partLabel: (key: string) =>
      ({ partCarpet: 'Carpet', partPaint: 'Paint' })[key] ?? key,
    readyHint: 'Nothing to do in here.',
  };

  it('joins part chips first', () => {
    assert.equal(
      roomSummaryLine(
        { issueParts: ['partCarpet', 'partPaint'], notes: 'ignore me' },
        labels
      ),
      'Carpet, Paint'
    );
  });

  it('uses a note snippet when there are no parts', () => {
    assert.equal(
      roomSummaryLine({ issueParts: [], notes: '  drip under sink  ' }, labels),
      'drip under sink'
    );
  });

  it('truncates long notes', () => {
    const notes = 'x'.repeat(NOTE_SNIPPET_MAX + 12);
    const line = roomSummaryLine({ notes }, labels);
    assert.equal(line.length, NOTE_SNIPPET_MAX + 1);
    assert.equal(line.endsWith('…'), true);
  });

  it('falls back to the ready hint', () => {
    assert.equal(
      roomSummaryLine({ issueParts: [], notes: '  ' }, labels),
      'Nothing to do in here.'
    );
  });
});
