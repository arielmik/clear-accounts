import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../components/theme';
import { UpdateBanner } from '../components/UpdateBanner';
import { Body, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { AuthProvider, useAuth } from '../lib/auth';
import { setupFocusRefetch, useRealtimeSync } from '../lib/realtime';
import { isSupabaseConfigured, missingEnvVars } from '../lib/supabase';

setupFocusRefetch();

function RootNavigator() {
  const { session, loading } = useAuth();
  const theme = useTheme();
  useRealtimeSync(!!session);
  if (loading) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="group-form" options={{ title: t.groups.new, presentation: 'modal' }} />
        <Stack.Screen name="expense-form" options={{ title: t.expense.new, presentation: 'modal' }} />
        <Stack.Screen name="settle-form" options={{ title: t.settle.title, presentation: 'modal' }} />
        <Stack.Screen name="invite" options={{ title: t.invite.title, presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="join/[token]" options={{ title: t.join.title }} />
    </Stack>
  );
}

function MissingConfig() {
  return (
    <Screen>
      <Title>{t.config.title}</Title>
      <Body>{t.config.body}</Body>
      <Body style={{ fontWeight: '700' }}>{t.config.missing}</Body>
      {missingEnvVars.map((v) => (
        <Body key={v} style={{ fontFamily: 'monospace' }}>• {v}</Body>
      ))}
      <Body>{t.config.hint}</Body>
    </Screen>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {isSupabaseConfigured ? (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
            <UpdateBanner />
          </AuthProvider>
        </QueryClientProvider>
      ) : (
        <MissingConfig />
      )}
    </SafeAreaProvider>
  );
}
