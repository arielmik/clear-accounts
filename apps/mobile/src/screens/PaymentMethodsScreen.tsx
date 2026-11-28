import { Stack } from 'expo-router';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, space, useTheme } from '../components/theme';
import { Button, Empty, Input, Label, Loading, Row, Screen } from '../components/ui';
import { t } from '../i18n';
import { createPaymentMethod, updatePaymentMethod } from '../lib/api';
import { useUserId } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { paymentMethodEmoji } from '../lib/payment-methods';
import { useInvalidatePaymentMethods, usePaymentMethods, useRefreshAll } from '../lib/queries';
import type { PaymentMethod } from '../lib/types';

/** Primer emoji (o caracter) de lo que escriba el usuario. */
function firstGlyph(text: string): string | null {
  return Array.from(text.trim())[0] ?? null;
}

/** Medios de pago propios: crear, renombrar y archivar (igual que "Mis categorías"). */
export default function PaymentMethodsScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const methods = usePaymentMethods();
  const invalidate = useInvalidatePaymentMethods();
  const refreshAll = useRefreshAll();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = methods.data ?? [];
  const system = all.filter((m) => m.owner_id === null);
  const mine = all.filter((m) => m.owner_id === userId);
  const active = mine.filter((m) => !m.archived_at);
  const archived = mine.filter((m) => !!m.archived_at);

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
      await createPaymentMethod({ ownerId: userId, name: name.trim(), icon: firstGlyph(emoji) });
      setName('');
      setEmoji('');
    });

  const renderRow = (m: PaymentMethod, i: number) => {
    const isEditing = editing?.id === m.id;
    const isArchived = !!m.archived_at;
    return (
      <View key={m.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.border }}>
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
                      await updatePaymentMethod(m.id, { name: editing.name.trim(), icon: firstGlyph(editing.emoji) });
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
              onPress={() => setEditing({ id: m.id, name: m.name, emoji: m.icon ?? '' })}
              style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.6 : 1 })}
            >
              <View style={[styles.emojiTile, { backgroundColor: theme.bg, opacity: isArchived ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 20 }}>{paymentMethodEmoji(m)}</Text>
              </View>
              <Text style={{ flex: 1, color: isArchived ? theme.muted : theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                {m.name}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${isArchived ? t.categories.restore : t.categories.archive}: ${m.name}`}
              hitSlop={8}
              disabled={busy}
              onPress={() => run(() => updatePaymentMethod(m.id, { archived_at: isArchived ? null : new Date().toISOString() }))}
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
      <Stack.Screen options={{ title: t.paymentMethods.title }} />
      <Text style={{ color: theme.muted, fontSize: 14 }}>{t.paymentMethods.note}</Text>

      <View style={[styles.newCard, { backgroundColor: theme.card }]}>
        <Text style={{ color: theme.text, fontFamily: fonts.displayBold, fontSize: 17 }}>{t.paymentMethods.new}</Text>
        <Row>
          <Input style={styles.emojiInput} value={emoji} onChangeText={setEmoji} placeholder="💳" accessibilityLabel={t.categories.emoji} />
          <Input
            style={{ flex: 1 }}
            value={name}
            onChangeText={setName}
            placeholder={t.paymentMethods.namePlaceholder}
            accessibilityLabel={t.categories.name}
          />
        </Row>
        <Button title={t.categories.add} onPress={add} loading={busy && !editing} disabled={!name.trim()} />
      </View>

      {error ? <Text style={{ color: theme.negative, fontSize: 15, fontWeight: '600' }}>{error}</Text> : null}
      {methods.isLoading ? <Loading /> : null}
      {methods.data && mine.length === 0 ? <Empty>{t.paymentMethods.empty}</Empty> : null}

      {active.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Label>{t.paymentMethods.mine(active.length)}</Label>
          <View style={[styles.list, { backgroundColor: theme.card }]}>{active.map(renderRow)}</View>
        </View>
      ) : null}
      {archived.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Label>{t.paymentMethods.archivedList(archived.length)}</Label>
          <View style={[styles.list, { backgroundColor: theme.card }]}>{archived.map(renderRow)}</View>
        </View>
      ) : null}
      {system.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Label>{t.paymentMethods.system}</Label>
          <Text style={{ color: theme.muted, fontSize: 14 }}>
            {system.map((m) => `${paymentMethodEmoji(m)} ${m.name}`).join('   ')}
          </Text>
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
