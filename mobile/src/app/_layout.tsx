import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

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
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={DefaultTheme}>
        <AuthProvider>
          <SplashGate>
            <OfflineBanner />
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ title: 'Sign In' }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="quote/[id]" options={{ title: 'Quote' }} />
              <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice' }} />
              <Stack.Screen name="customer/[id]" options={{ title: 'Customer' }} />
              <Stack.Screen name="settings" options={{ title: 'Settings' }} />
            </Stack>
          </SplashGate>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}