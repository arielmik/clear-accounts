import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { t } from '../i18n';
import { GROUP_COLORS, groupColorValue, type GroupColor } from '../lib/group-colors';
import { space, useTheme } from './theme';

const PER_ROW = 5;

/**
 * Todos los colores de grupo a la vista, sin scroll: filas explícitas de cuadrados
 * de tamaño fijo (calculado con el ancho de la pantalla), para que ninguna fila quede
 * oculta por cálculos de alto con porcentajes.
 */
export function GroupColorPicker({
  value,
  onChange,
  disabled,
  horizontalPadding = space.lg,
}: {
  value: GroupColor;
  onChange: (color: GroupColor) => void;
  disabled?: boolean;
  /** Margen lateral total de la pantalla donde se muestra (por lado). */
  horizontalPadding?: number;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const gap = space.md;
  const size = Math.min(60, Math.floor((width - horizontalPadding * 2 - gap * (PER_ROW - 1)) / PER_ROW));

  const rows: GroupColor[][] = [];
  for (let i = 0; i < GROUP_COLORS.length; i += PER_ROW) rows.push(GROUP_COLORS.slice(i, i + PER_ROW));

  return (
    <View accessibilityRole="radiogroup" style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((c) => {
            const selected = c === value;
            return (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityLabel={t.groups.colors[c]}
                accessibilityState={{ selected, disabled: !!disabled }}
                disabled={disabled}
                onPress={() => onChange(c)}
                style={({ pressed }) => ({
                  width: size,
                  height: size,
                  borderRadius: 16,
                  backgroundColor: groupColorValue(c, theme),
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 3,
                  borderColor: selected ? theme.text : 'transparent',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                {selected ? <Ionicons name="checkmark" size={24} color={theme.onGroup} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
