import { supabase } from './supabase';
import type { Json } from './database.types';
import type { ManualWalkthroughDraft } from './walkthrough-draft';
import {
  submitFieldDraft,
  type SubmissionPayload,
  type SubmissionPorts,
} from './field-submission';

export const fieldSubmissionEnabled =
  process.env.EXPO_PUBLIC_FIELD_SUBMISSION_ENABLED === 'true';

function databasePayload(payload: SubmissionPayload) {
  return {
    ...payload,
    rooms: payload.rooms as Json,
    condition_findings: payload.condition_findings as Json,
  };
}

export async function loadFieldRoster() {
  if (!supabase) throw new Error('Sign-in unavailable');
  const [properties, units] = await Promise.all([
    supabase.from('properties').select('*').order('name'),
    supabase.from('units').select('*').order('unit_number'),
  ]);
  if (properties.error || units.error) throw new Error('Could not load units');
  return { properties: properties.data ?? [], units: units.data ?? [] };
}

const pending = new Map<string, Promise<string>>();

export async function sendFieldDraft(
  draft: ManualWalkthroughDraft,
  unitId: string
) {
  const client = supabase;
  if (!fieldSubmissionEnabled || !client)
    throw new Error('Sending is unavailable');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in again');
  const userId = data.user.id;
  const key = `${userId}:${draft.id}:${draft.completedAt}:${unitId}`;
  const running = pending.get(key);
  if (running) return running;
  const ports: SubmissionPorts = {
    async begin(payload) {
      const { error: insertError } = await client
        .from('walkthroughs')
        .upsert(
          { ...databasePayload(payload), status: 'in_progress' },
          { onConflict: 'captured_by,source_draft_id', ignoreDuplicates: true }
        );
      if (insertError) throw insertError;
      const { data: row, error: readError } = await client
        .from('walkthroughs')
        .select('id,unit_id,status')
        .eq('captured_by', userId)
        .eq('source_draft_id', payload.source_draft_id)
        .single();
      if (readError || !row)
        throw readError ?? new Error('Submission unavailable');
      return row;
    },
    async upload(asset) {
      // Native file reads only. Import lazily so the web fallback stays usable.
      const { File, Paths, Directory } = await import('expo-file-system');
      const file = new File(asset.uri);
      const root = new Directory(
        Paths.document,
        asset.bucket === 'walkthrough-scans' ? 'scans' : 'walkthrough-photos'
      ).uri;
      if (
        !file.uri.startsWith(`${root.replace(/\/$/, '')}/`) ||
        /(?:^|\/)\.\.(?:\/|$)/.test(asset.uri) ||
        !file.exists
      )
        throw new Error('Capture file is missing');
      if (file.size <= 0 || file.size > 50 * 1024 * 1024)
        throw new Error('Capture file exceeds upload limit');
      const body = await file.arrayBuffer();
      const { error: uploadError } = await client.storage
        .from(asset.bucket)
        .upload(asset.path, body, {
          contentType: asset.contentType,
          upsert: true,
        });
      if (uploadError) throw uploadError;
    },
    async complete(id, payload) {
      const { data: row, error: updateError } = await client
        .from('walkthroughs')
        .update({ ...databasePayload(payload), status: 'complete' })
        .eq('id', id)
        .eq('captured_by', userId)
        .eq('source_draft_id', payload.source_draft_id)
        .select('id')
        .single();
      if (updateError || !row)
        throw updateError ?? new Error('Submission was not saved');
    },
  };
  const work = submitFieldDraft(draft, unitId, userId, ports);
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
