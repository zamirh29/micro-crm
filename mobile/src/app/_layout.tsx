import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { OfflineBanner } from '@/components/offline-banner';
import { AuthProvider, useSession } from '@/lib/auth';

SplashScreen.preventAutoHideAsync().catch(() => {});

function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading } = useSession();

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  if (loading) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <SplashGate>
          <OfflineBanner />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: 'Sign In' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="quote/[id]" options={{ title: 'Quote' }} />
            <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice' }} />
            <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          </Stack>
        </SplashGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
