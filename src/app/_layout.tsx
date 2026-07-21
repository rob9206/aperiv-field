import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <SplashScreenController />
        <RootNavigator />
      </AuthProvider>
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
  const { session } = useAuth();

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Aperiv Field' }} />
      <Stack.Screen name="login" options={{ title: 'Sign in' }} />
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="walkthrough" options={{ title: 'Walkthrough' }} />
      </Stack.Protected>
    </Stack>
  );
}
