import { useMemo } from 'react';
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
}: {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  systemOnly?: boolean;
}) {
  const categories = useCategories();
  const index = useMemo(() => categoryIndex(categories.data ?? [], { systemOnly }), [categories.data, systemOnly]);
  const selectedRoot = index.rootOf(value);
  const children = selectedRoot ? index.childrenOf(selectedRoot.id) : [];

  return (
    <>
      <ChipRow>
        {index.roots.map((c) => (
          <Chip
            key={c.id}
            label={`${categoryEmoji(c)} ${c.name}`}
            selected={selectedRoot?.id === c.id}
            onPress={() => onChange(selectedRoot?.id === c.id ? null : c.id)}
          />
        ))}
      </ChipRow>
      {selectedRoot && children.length > 0 ? (
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
      ) : null}
    </>
  );
}
