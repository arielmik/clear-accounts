import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { useTheme } from '../../components/theme';
import { t } from '../../i18n';
import { useUserId } from '../../lib/auth';
import { useProfile } from '../../lib/queries';

type IconName = keyof typeof Ionicons.glyphMap;

const icon =
  (name: IconName, active: IconName) =>
  ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : name} color={color as string} size={size} />
  );

/** Hueco en el centro de la barra para el botón de carga. */
const FAB_GAP = 36;
const FAB_SIZE = 56;
const BAR_HEIGHT = 58;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const profile = useProfile(useUserId());
  const avatarPath = profile.data?.avatar_path;
  // Dentro de un grupo, el "+" carga el gasto en ese grupo; si no, va a Personal.
  const groupId = /^\/groups\/([^/]+)$/.exec(pathname)?.[1];
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Al salir de una pestaña, vuelve a su pantalla principal: tocar "Grupos"
          // siempre muestra la lista, no el último grupo abierto.
          popToTopOnBlur: true,
          tabBarActiveTintColor: theme.text,
          tabBarInactiveTintColor: theme.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarStyle: {
            backgroundColor: theme.bg,
            borderTopColor: theme.border,
            height: BAR_HEIGHT + insets.bottom,
            paddingTop: 6,
          },
          sceneStyle: { backgroundColor: theme.bg },
        }}
      >
        <Tabs.Screen name="(home)" options={{ title: t.tabs.home, tabBarIcon: icon('home-outline', 'home') }} />
        <Tabs.Screen
          name="ledger"
          options={{
            title: t.tabs.ledger,
            tabBarIcon: icon('pie-chart-outline', 'pie-chart'),
            tabBarItemStyle: { marginRight: FAB_GAP },
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: t.tabs.groups,
            tabBarIcon: icon('people-outline', 'people'),
            tabBarItemStyle: { marginLeft: FAB_GAP },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t.tabs.profile,
            // Con foto cargada, reemplaza al ícono; si no, queda el ícono de siempre.
            tabBarIcon: avatarPath
              ? ({ size }) => <Avatar path={avatarPath} size={size + 2} />
              : icon('person-outline', 'person'),
          }}
        />
      </Tabs>
      {/* Botón principal, en el centro de la barra: cargar un gasto desde cualquier pestaña. */}
      <View pointerEvents="box-none" style={[styles.fabSlot, { bottom: insets.bottom + BAR_HEIGHT - FAB_SIZE / 2 - 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.expense.new}
          onPress={() => router.push({ pathname: '/expense-form', params: groupId ? { groupId } : {} })}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.accent, shadowColor: theme.accent, transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <Ionicons name="add" size={32} color={theme.accentText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fabSlot: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
