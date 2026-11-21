import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../components/theme';
import { t } from '../../i18n';

type IconName = keyof typeof Ionicons.glyphMap;

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
          sceneStyle: { backgroundColor: theme.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t.tabs.home, tabBarIcon: icon('home-outline') }} />
        <Tabs.Screen name="groups" options={{ title: t.tabs.groups, tabBarIcon: icon('people-outline') }} />
        <Tabs.Screen name="ledger" options={{ title: t.tabs.ledger, tabBarIcon: icon('pie-chart-outline') }} />
        <Tabs.Screen name="profile" options={{ title: t.tabs.profile, tabBarIcon: icon('person-outline') }} />
      </Tabs>
      {/* Botón principal: cargar un gasto desde cualquier pestaña. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.expense.new}
        onPress={() => router.push('/expense/new')}
        style={[styles.fab, { backgroundColor: theme.primary, bottom: insets.bottom + 64 }]}
      >
        <Ionicons name="add" size={32} color={theme.primaryText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
