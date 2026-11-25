import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { space, useTheme } from './theme';
import { categoryEmoji, categoryIndex } from '../lib/categories';
import { useCategories } from '../lib/queries';
import { Chip, ChipRow } from './ui';

/**
 * Selector de categoría en dos niveles: principal y, opcionalmente, subcategoría.
 * Tocar de nuevo la principal la deselecciona.
 */
export function CategoryPicker({
  value,
  onChange,
  systemOnly = false,
  variant = 'chips',
}: {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  systemOnly?: boolean;
  /** 'tiles': cuadrados con emoji grande (pantalla de carga sobre el color del grupo). */
  variant?: 'chips' | 'tiles';
}) {
  const theme = useTheme();
  const categories = useCategories();
  const index = useMemo(() => categoryIndex(categories.data ?? [], { systemOnly }), [categories.data, systemOnly]);
  const selectedRoot = index.rootOf(value);
  const children = selectedRoot ? index.childrenOf(selectedRoot.id) : [];

  const rootRow =
    variant === 'tiles' ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
        {index.roots.map((c) => {
          const on = selectedRoot?.id === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.name}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(on ? null : c.id)}
              style={{
                width: 64,
                paddingVertical: 8,
                borderRadius: 16,
                alignItems: 'center',
                gap: 2,
                backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
                borderWidth: 2.5,
                borderColor: on ? theme.onGroup : 'transparent',
              }}
            >
              <Text style={{ fontSize: 22 }}>{categoryEmoji(c)}</Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.onGroup }} numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    ) : null;

  return (
    <>
      {rootRow ?? <ChipRow>
        {index.roots.map((c) => (
          <Chip
            key={c.id}
            label={`${categoryEmoji(c)} ${c.name}`}
            selected={selectedRoot?.id === c.id}
            onPress={() => onChange(selectedRoot?.id === c.id ? null : c.id)}
          />
        ))}
      </ChipRow>}
      {selectedRoot && children.length > 0 ? (
        <View style={{ paddingHorizontal: variant === 'tiles' ? space.lg : 0 }}>
        <ChipRow>
          {children.map((c) => (
            <Chip
              key={c.id}
              label={c.owner_id && c.icon ? `${c.icon} ${c.name}` : c.name}
              selected={value === c.id}
              onPress={() => onChange(value === c.id ? selectedRoot.id : c.id)}
            />
          ))}
        </ChipRow>
        </View>
      ) : null}
    </>
  );
}
