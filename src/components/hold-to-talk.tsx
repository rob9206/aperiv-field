import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSpeechToText } from '@/hooks/use-speech-to-text';
import { useTheme } from '@/hooks/use-theme';
import { appendTranscript } from '@/lib/room-voice';
import { useLocale } from '@/providers/locale-provider';

export function HoldToTalk({
  onAppend,
}: {
  onAppend: (text: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();
  const speech = useSpeechToText(onAppend);

  if (!speech.available) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('holdToTalk')}
        onPressIn={() => {
          void speech.begin();
        }}
        onPressOut={speech.end}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: speech.listening
              ? theme.accent
              : theme.backgroundSelected,
            borderColor: theme.accent,
          },
          pressed && styles.pressed,
        ]}>
        <ThemedText
          type="default"
          style={[
            styles.label,
            {
              color: speech.listening ? theme.onAccent : theme.accentText,
            },
          ]}>
          {speech.listening ? t('listening') : t('holdToTalk')}
        </ThemedText>
      </Pressable>
      {speech.partial ? (
        <ThemedText type="default" themeColor="textSecondary">
          {speech.partial}
        </ThemedText>
      ) : null}
      {speech.errorKey ? (
        <ThemedText type="default" style={{ color: theme.danger }}>
          {t(speech.errorKey)}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function RoomNotesField({
  value,
  onChange,
}: {
  value: string;
  onChange: (notes: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLocale();

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">{t('notes')}</ThemedText>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
        placeholder={t('damageNotes')}
        placeholderTextColor={theme.textSecondary}
        value={value}
        multiline
        textAlignVertical="top"
        onChangeText={onChange}
      />
      <HoldToTalk
        onAppend={(text) => onChange(appendTranscript(value, text))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  button: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  label: {
    fontWeight: '700',
    fontSize: 17,
  },
  pressed: {
    opacity: 0.88,
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderWidth: 1.5,
    fontSize: 17,
    minHeight: 96,
  },
});
