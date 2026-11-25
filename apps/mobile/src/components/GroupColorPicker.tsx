import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { t } from '../i18n';
import { GROUP_COLORS, groupColorValue, type GroupColor } from '../lib/group-colors';
import { space, useTheme } from './theme';

/** Las ocho opciones de color de un grupo, en una grilla de 4 × 2. */
export function GroupColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: GroupColor;
  onChange: (color: GroupColor) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {GROUP_COLORS.map((c) => {
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
              width: '21%',
              aspectRatio: 1,
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
  );
}
