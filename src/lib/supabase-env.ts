/**
 * Public Supabase env for the Field app.
 * Mirrors the web app's hardening: truthiness alone is not enough,
 * whitespace / non-HTTP URLs must be treated as "not configured"
 * instead of crashing at client creation.
 */
export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!url || !anonKey) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }

  return { url, anonKey };
}

export function hasSupabaseEnv() {
  return getSupabasePublicEnv() !== null;
}
