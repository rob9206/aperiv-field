import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useLocale } from '@/providers/locale-provider';

export function OverflowButton({ open, onPress, disabled = false, label }: {
  open: boolean;
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const { t } = useLocale();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? t('moreOptions')}
      accessibilityState={{ expanded: open, disabled }} onPress={onPress}
      disabled={disabled} style={styles.button}>
      <ThemedText themeColor="textSecondary" style={styles.icon}>{open ? '×' : '⋯'}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 28, lineHeight: 32 },
});
