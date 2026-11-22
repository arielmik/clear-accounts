import { Stack } from 'expo-router';
import { useTheme } from './theme';

/**
 * Pila de pantallas dentro de una pestaña: los detalles se abren acá adentro,
 * así el menú inferior queda siempre visible.
 */
export function TabStack() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
        headerBackButtonDisplayMode: 'minimal',
        title: '',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
