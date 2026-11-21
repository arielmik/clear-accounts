import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../components/theme';
import { Body, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { AuthProvider, useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';

function RootNavigator() {
  const { session, loading } = useAuth();
  const theme = useTheme();
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
        <Stack.Screen name="group/[id]" options={{ title: '' }} />
        <Stack.Screen name="group/new" options={{ title: t.groups.new, presentation: 'modal' }} />
        <Stack.Screen name="expense/new" options={{ title: t.expense.new, presentation: 'modal' }} />
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
          </AuthProvider>
        </QueryClientProvider>
      ) : (
        <MissingConfig />
      )}
    </SafeAreaProvider>
  );
}
