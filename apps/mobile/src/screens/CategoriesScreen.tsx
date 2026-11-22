import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { space, useTheme } from '../components/theme';
import { Body, Button, Card, Chip, ChipRow, Empty, Input, Label, Loading, Row, Screen } from '../components/ui';
import { t } from '../i18n';
import { createCategory, updateCategory } from '../lib/api';
import { useUserId } from '../lib/auth';
import { categoryEmoji } from '../lib/categories';
import { friendlyError } from '../lib/errors';
import { useCategories, useInvalidateCategories, useRefreshAll } from '../lib/queries';
import type { Category } from '../lib/types';

/** Primer emoji (o caracter) de lo que escriba el usuario. */
function firstGlyph(text: string): string | null {
  const glyph = Array.from(text.trim())[0];
  return glyph ?? null;
}

export default function CategoriesScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const categories = useCategories();
  const invalidate = useInvalidateCategories();
  const refreshAll = useRefreshAll();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = categories.data ?? [];
  const byId = useMemo(() => new Map(all.map((c) => [c.id, c])), [all]);
  const mine = all.filter((c) => c.owner_id === userId);
  // Se puede colgar de una principal del sistema o de una principal propia activa.
  const parents = all.filter((c) => c.parent_id === null && !c.archived_at);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await invalidate();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      await createCategory({ ownerId: userId, name: name.trim(), icon: firstGlyph(emoji), parentId });
      setName('');
      setEmoji('');
      setParentId(null);
    });

  const label = (c: Category) => {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };

  return (
    <Screen edges={[]} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: t.categories.title }} />
      <Body style={{ color: theme.muted, fontSize: 14 }}>{t.categories.sharedNote}</Body>

      <Card>
        <Label>{t.categories.new}</Label>
        <Row>
          <Input style={{ width: 64, textAlign: 'center' }} value={emoji} onChangeText={setEmoji} placeholder="🏷️" />
          <Input style={{ flex: 1 }} value={name} onChangeText={setName} placeholder={t.categories.name} />
        </Row>
        <Label>{t.categories.parent}</Label>
        <ChipRow>
          <Chip label={t.categories.none} selected={parentId === null} onPress={() => setParentId(null)} />
          {parents.map((p) => (
            <Chip
              key={p.id}
              label={`${categoryEmoji(p)} ${p.name}`}
              selected={parentId === p.id}
              onPress={() => setParentId(p.id)}
            />
          ))}
        </ChipRow>
        <Button title={t.categories.add} onPress={add} loading={busy} disabled={!name.trim()} />
      </Card>

      {error ? <Text style={{ color: theme.negative }}>{error}</Text> : null}
      {categories.isLoading ? <Loading /> : null}
      {categories.data && mine.length === 0 ? <Empty>{t.categories.empty}</Empty> : null}

      {mine.length > 0 ? (
        <Card>
          {mine.map((c, i) => {
            const isEditing = editing?.id === c.id;
            const archived = !!c.archived_at;
            return (
              <View
                key={c.id}
                style={{ gap: space.sm, paddingVertical: space.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.border }}
              >
                {isEditing ? (
                  <>
                    <Row>
                      <Input
                        style={{ width: 64, textAlign: 'center' }}
                        value={editing.emoji}
                        onChangeText={(v) => setEditing({ ...editing, emoji: v })}
                      />
                      <Input style={{ flex: 1 }} value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} autoFocus />
                    </Row>
                    <Row>
                      <Chip
                        label={`✓ ${t.categories.save}`}
                        selected
                        onPress={() =>
                          run(async () => {
                            await updateCategory(c.id, { name: editing.name.trim(), icon: firstGlyph(editing.emoji) });
                            setEditing(null);
                          })
                        }
                      />
                      <Chip label={t.common.cancel} onPress={() => setEditing(null)} />
                    </Row>
                  </>
                ) : (
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Pressable
                      style={{ flex: 1 }}
                      accessibilityRole="button"
                      onPress={() => setEditing({ id: c.id, name: c.name, emoji: c.icon ?? '' })}
                    >
                      <Text style={{ color: archived ? theme.muted : theme.text, fontSize: 16 }}>
                        {categoryEmoji(c)} {label(c)}
                      </Text>
                      {archived ? <Text style={{ color: theme.muted, fontSize: 12 }}>{t.categories.archived}</Text> : null}
                    </Pressable>
                    <Chip
                      label={archived ? t.categories.restore : t.categories.archive}
                      onPress={() =>
                        run(() => updateCategory(c.id, { archived_at: archived ? null : new Date().toISOString() }))
                      }
                    />
                  </Row>
                )}
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
