import { createClient } from '@supabase/supabase-js';

const projectRef = process.env.FIELD_TEST_PROJECT_REF;
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
if (!projectRef || !url || !key) {
  throw new Error('The preview environment needs the approved project and public Supabase settings.');
}
const parsed = new URL(url);
if (parsed.protocol !== 'https:' || parsed.hostname !== `${projectRef}.supabase.co` || parsed.username || parsed.password) {
  throw new Error('The preview environment does not target the approved Field test database.');
}

const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
// Request column metadata with zero rows. Do not fetch resident or capture data.
const { error } = await client.from('walkthroughs')
  .select('id,unit_id,status,source_draft_id,verification_status,rooms,condition_findings')
  .limit(0);
if (error) {
  throw new Error('Field submission schema is unavailable. Apply and verify the companion migration before building an enabled test app.');
}
console.log('The approved database exposes the Field submission columns.');
