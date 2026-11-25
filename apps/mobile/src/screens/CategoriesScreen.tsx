import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, space, useTheme } from '../components/theme';
import { Button, Chip, ChipRow, Empty, Input, Label, Loading, Row, Screen } from '../components/ui';
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

  const parentName = (c: Category) => (c.parent_id ? byId.get(c.parent_id)?.name : undefined);
  const active = mine.filter((c) => !c.archived_at);
  const archived = mine.filter((c) => !!c.archived_at);

  const renderRow = (c: Category, i: number) => {
    const isEditing = editing?.id === c.id;
    const isArchived = !!c.archived_at;
    return (
      <View key={c.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.border }}>
        {isEditing ? (
          <View style={{ padding: space.md, gap: space.sm }}>
            <Row>
              <Input
                style={styles.emojiInput}
                value={editing.emoji}
                onChangeText={(v) => setEditing({ ...editing, emoji: v })}
                accessibilityLabel={t.categories.emoji}
              />
              <Input
                style={{ flex: 1 }}
                value={editing.name}
                onChangeText={(v) => setEditing({ ...editing, name: v })}
                accessibilityLabel={t.categories.name}
                autoFocus
              />
            </Row>
            <Row>
              <View style={{ flex: 1 }}>
                <Button title={t.common.cancel} variant="secondary" onPress={() => setEditing(null)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={t.categories.save}
                  loading={busy}
                  disabled={!editing.name.trim()}
                  onPress={() =>
                    run(async () => {
                      await updateCategory(c.id, { name: editing.name.trim(), icon: firstGlyph(editing.emoji) });
                      setEditing(null);
                    })
                  }
                />
              </View>
            </Row>
          </View>
        ) : (
          <Row style={{ paddingHorizontal: space.md, paddingVertical: space.sm + 2, gap: space.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t.categories.tapToEdit}
              onPress={() => setEditing({ id: c.id, name: c.name, emoji: c.icon ?? '' })}
              style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.6 : 1 })}
            >
              <View style={[styles.emojiTile, { backgroundColor: theme.bg, opacity: isArchived ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 20 }}>{categoryEmoji(c)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: isArchived ? theme.muted : theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                  {c.name}
                </Text>
                {parentName(c) ? (
                  <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
                    {t.categories.inside(parentName(c)!)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${isArchived ? t.categories.restore : t.categories.archive}: ${c.name}`}
              hitSlop={8}
              disabled={busy}
              onPress={() => run(() => updateCategory(c.id, { archived_at: isArchived ? null : new Date().toISOString() }))}
              style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.bg, opacity: pressed ? 0.6 : 1 }]}
            >
              <Ionicons name={isArchived ? 'arrow-undo-outline' : 'archive-outline'} size={18} color={theme.text} />
            </Pressable>
          </Row>
        )}
      </View>
    );
  };

  return (
    <Screen edges={[]} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: t.categories.title }} />
      <Text style={{ color: theme.muted, fontSize: 14 }}>{t.categories.sharedNote}</Text>

      {/* Nueva categoría: emoji + nombre y, si querés, dentro de cuál va. */}
      <View style={[styles.newCard, { backgroundColor: theme.card }]}>
        <Text style={{ color: theme.text, fontFamily: fonts.displayBold, fontSize: 17 }}>{t.categories.new}</Text>
        <Row>
          <Input
            style={styles.emojiInput}
            value={emoji}
            onChangeText={setEmoji}
            placeholder="🏷️"
            accessibilityLabel={t.categories.emoji}
          />
          <Input style={{ flex: 1 }} value={name} onChangeText={setName} placeholder={t.categories.name} />
        </Row>
        <Label>{t.categories.parent}</Label>
        <ChipRow>
          <Chip label={t.categories.none} selected={parentId === null} onPress={() => setParentId(null)} />
          {parents.map((p) => (
            <Chip key={p.id} label={`${categoryEmoji(p)} ${p.name}`} selected={parentId === p.id} onPress={() => setParentId(p.id)} />
          ))}
        </ChipRow>
        <Button title={t.categories.add} onPress={add} loading={busy && !editing} disabled={!name.trim()} />
      </View>

      {error ? <Text style={{ color: theme.negative }}>{error}</Text> : null}
      {categories.isLoading ? <Loading /> : null}
      {categories.data && mine.length === 0 ? <Empty>{t.categories.empty}</Empty> : null}

      {active.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Label>{t.categories.mine(active.length)}</Label>
          <View style={[styles.list, { backgroundColor: theme.card }]}>{active.map(renderRow)}</View>
        </View>
      ) : null}
      {archived.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Label>{t.categories.archivedList(archived.length)}</Label>
          <View style={[styles.list, { backgroundColor: theme.card }]}>{archived.map(renderRow)}</View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newCard: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  list: { borderRadius: radius.lg, overflow: 'hidden' },
  emojiInput: { width: 56, textAlign: 'center', fontSize: 22, paddingHorizontal: 0 },
  emojiTile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
