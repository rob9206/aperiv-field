import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { speechLocaleForAppLocale } from '@/lib/room-voice';
import { useLocale } from '@/providers/locale-provider';

export type VoiceErrorKey = 'voiceMicDenied' | 'voiceHearFailed';

type SpeechPackage = typeof import('expo-speech-recognition');
type SpeechNative = SpeechPackage['ExpoSpeechRecognitionModule'];

function loadSpeechPackage(): SpeechPackage | null {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    // Throws when the installed binary does not include the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech-recognition') as SpeechPackage;
  } catch {
    return null;
  }
}

function deviceSupportsOnDeviceSpeech(mod: SpeechNative): boolean {
  try {
    return (
      mod.isRecognitionAvailable() && mod.supportsOnDeviceRecognition()
    );
  } catch {
    return false;
  }
}

function localeIsListed(haystack: string[], lang: string): boolean {
  const needle = lang.toLowerCase();
  const prefix = needle.split('-')[0] ?? needle;
  return haystack.some((item) => {
    const value = item.toLowerCase();
    return value === needle || value === prefix || value.startsWith(`${prefix}-`);
  });
}

export function useSpeechToText(onFinalTranscript: (text: string) => void) {
  const { locale } = useLocale();
  const lang = speechLocaleForAppLocale(locale);
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [errorKey, setErrorKey] = useState<VoiceErrorKey | null>(null);

  const wantRef = useRef(false);
  const finalRef = useRef('');
  const partialRef = useRef('');
  const onFinalRef = useRef(onFinalTranscript);
  const nativeRef = useRef<SpeechNative | null>(null);

  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    const pack = loadSpeechPackage();
    const native = pack?.ExpoSpeechRecognitionModule ?? null;
    nativeRef.current = native;
    if (!native || !deviceSupportsOnDeviceSpeech(native)) {
      return;
    }

    let cancelled = false;
    native
      .getSupportedLocales({})
      .then(({ locales, installedLocales }) => {
        if (cancelled) {
          return;
        }
        const pool =
          installedLocales.length > 0 ? installedLocales : locales;
        if (pool.length > 0 && !localeIsListed(pool, lang)) {
          setAvailable(false);
          return;
        }
        setAvailable(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(deviceSupportsOnDeviceSpeech(native));
        }
      });

    const startSub = native.addListener('start', () => {
      setListening(true);
    });
    const resultSub = native.addListener('result', (event) => {
      const text = event.results[0]?.transcript?.trim() ?? '';
      if (!text) {
        return;
      }
      partialRef.current = text;
      setPartial(text);
      if (event.isFinal) {
        finalRef.current = text;
      }
    });
    const endSub = native.addListener('end', () => {
      setListening(false);
      const text = (finalRef.current || partialRef.current).trim();
      finalRef.current = '';
      partialRef.current = '';
      setPartial('');
      wantRef.current = false;
      if (text) {
        onFinalRef.current(text);
      }
    });
    const errorSub = native.addListener('error', (event) => {
      if (event.error === 'aborted') {
        return;
      }
      setListening(false);
      if (
        event.error === 'language-not-supported' ||
        event.error === 'service-not-allowed'
      ) {
        setAvailable(false);
        return;
      }
      if (event.error === 'not-allowed') {
        setErrorKey('voiceMicDenied');
        return;
      }
      setErrorKey('voiceHearFailed');
    });

    return () => {
      cancelled = true;
      startSub.remove();
      resultSub.remove();
      endSub.remove();
      errorSub.remove();
      wantRef.current = false;
      try {
        native.abort();
      } catch {
        // Older binaries or already idle.
      }
    };
  }, [lang]);

  const begin = useCallback(async () => {
    const native = nativeRef.current;
    if (!available || !native) {
      return;
    }
    wantRef.current = true;
    setErrorKey(null);
    setPartial('');
    finalRef.current = '';
    partialRef.current = '';
    try {
      const perm = await native.requestMicrophonePermissionsAsync();
      if (!wantRef.current) {
        return;
      }
      if (!perm.granted) {
        setErrorKey('voiceMicDenied');
        return;
      }
      native.start({
        lang,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
        maxAlternatives: 1,
        addsPunctuation: true,
        recordingOptions: { persist: false },
        iosTaskHint: 'dictation',
      });
    } catch {
      if (wantRef.current) {
        setErrorKey('voiceHearFailed');
      }
    }
  }, [available, lang]);

  const end = useCallback(() => {
    wantRef.current = false;
    try {
      nativeRef.current?.stop();
    } catch {
      setListening(false);
    }
  }, []);

  return { available, listening, partial, errorKey, begin, end };
}
