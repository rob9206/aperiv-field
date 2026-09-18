import type { AppLocale } from './i18n';

export const NOTE_SNIPPET_MAX = 80;

export type RoomSummaryInput = {
  issueParts?: string[];
  notes: string;
};

export type RoomSummaryLabels = {
  partLabel: (key: string) => string;
  readyHint: string;
};

/** Append a spoken phrase onto an existing optional note. */
export function appendTranscript(existing: string, incoming: string): string {
  const next = incoming.trim();
  if (!next) {
    return existing;
  }
  const prev = existing.trimEnd();
  if (!prev) {
    return next;
  }
  if (existing.endsWith('\n')) {
    return `${prev}\n${next}`;
  }
  return `${prev} ${next}`;
}

export function speechLocaleForAppLocale(
  locale: AppLocale
): 'en-US' | 'es-US' {
  return locale === 'es' ? 'es-US' : 'en-US';
}

function noteSnippet(notes: string): string {
  const collapsed = notes.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= NOTE_SNIPPET_MAX) {
    return collapsed;
  }
  return `${collapsed.slice(0, NOTE_SNIPPET_MAX)}…`;
}

/** One-line tile copy: parts, else note, else ready hint. */
export function roomSummaryLine(
  room: RoomSummaryInput,
  labels: RoomSummaryLabels
): string {
  const parts = (room.issueParts ?? [])
    .map((key) => labels.partLabel(key).trim())
    .filter((label) => label.length > 0);
  if (parts.length > 0) {
    return parts.join(', ');
  }
  const snippet = noteSnippet(room.notes);
  if (snippet) {
    return snippet;
  }
  return labels.readyHint;
}
