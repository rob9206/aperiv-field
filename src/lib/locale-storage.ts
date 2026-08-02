import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeLocale, type AppLocale } from './i18n';

export const LOCALE_STORAGE_KEY = 'aperiv.field.locale.v1';

export function parseStoredLocale(raw: string | null): AppLocale {
  if (raw == null) return 'en';
  try {
    const parsed: unknown = JSON.parse(raw);
    return normalizeLocale(parsed);
  } catch {
    return normalizeLocale(raw);
  }
}

export async function loadLocale(): Promise<AppLocale> {
  try {
    const raw = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    return parseStoredLocale(raw);
  } catch {
    return 'en';
  }
}

export async function saveLocale(locale: AppLocale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(locale));
}
