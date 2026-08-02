import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { LocaleProvider, useLocale } from '@/providers/locale-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LocaleProvider>
        <AuthProvider>
          <SplashScreenController />
          <RootNavigator />
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

function SplashScreenController() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      void SplashScreen.hideAsync();
    }
  }, [isLoading]);

  return null;
}

function RootNavigator() {
  const { session, isLoading } = useAuth();
  const { t } = useLocale();

  if (isLoading) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: t('appName'), headerShown: false }}
      />
      <Stack.Screen name="login" options={{ title: t('signIn') }} />
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="walkthrough" options={{ title: t('appName') }} />
      </Stack.Protected>
    </Stack>
  );
}
