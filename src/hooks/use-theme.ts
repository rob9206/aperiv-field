/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // Treat null/unspecified as light so themed text never resolves to undefined.
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
