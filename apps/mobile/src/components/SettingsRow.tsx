import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { radius, space, useTheme } from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Bloque de filas de ajustes con un título chico arriba. */
export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {title ? (
        <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </Text>
      ) : null}
      <View style={{ backgroundColor: theme.card, borderRadius: radius.lg, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/**
 * Fila de ajustes: ícono, título, valor actual y a la derecha una flecha o un control.
 * Con `expanded` muestra debajo `children` (el editor de ese ajuste), sin cambiar de pantalla.
 */
export function SettingsRow({
  icon,
  title,
  value,
  onPress,
  right,
  expanded,
  first,
  danger,
  children,
}: {
  icon: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  expanded?: boolean;
  first?: boolean;
  danger?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const color = danger ? theme.negative : theme.text;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: theme.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: !!expanded }}
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            backgroundColor: danger ? theme.negativeSoft : theme.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color, fontSize: 15, fontWeight: '600' }}>{title}</Text>
          {value ? (
            <Text style={{ color: theme.muted, fontSize: 13 }} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
        </View>
        {right ??
          (onPress && !danger ? (
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={18} color={theme.muted} />
          ) : null)}
      </Pressable>
      {expanded && children ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm }}>{children}</View>
      ) : null}
    </View>
  );
}
