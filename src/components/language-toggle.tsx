import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AppLocale } from '@/lib/i18n';
import { useLocale } from '@/providers/locale-provider';

function LocaleChip({
  code,
  label,
  active,
  onSelect,
  background,
  border,
  activeBackground,
  onAccent,
}: {
  code: AppLocale;
  label: string;
  active: boolean;
  onSelect: (code: AppLocale) => void;
  background: string;
  border: string;
  activeBackground: string;
  onAccent: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => onSelect(code)}
      style={[
        styles.chip,
        {
          backgroundColor: active ? activeBackground : background,
          borderColor: border,
        },
      ]}>
      <ThemedText
        type="smallBold"
        style={active ? { color: onAccent } : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function LanguageToggle() {
  const theme = useTheme();
  const { locale, setLocale, t } = useLocale();

  return (
    <View style={styles.wrap} accessibilityLabel={t('language')}>
      <LocaleChip
        code="en"
        label="EN"
        active={locale === 'en'}
        onSelect={setLocale}
        background={theme.backgroundSelected}
        border={theme.border}
        activeBackground={theme.accent}
        onAccent={theme.onAccent}
      />
      <LocaleChip
        code="es"
        label="ES"
        active={locale === 'es'}
        onSelect={setLocale}
        background={theme.backgroundSelected}
        border={theme.border}
        activeBackground={theme.accent}
        onAccent={theme.onAccent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget + 8,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
