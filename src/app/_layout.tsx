import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Aperiv Field' }} />
        <Stack.Screen name="login" options={{ title: 'Sign in' }} />
        <Stack.Screen name="walkthrough" options={{ title: 'Walkthrough' }} />
      </Stack>
    </ThemeProvider>
  );
}
