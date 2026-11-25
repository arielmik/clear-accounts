import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { t } from '../i18n';
import { categoryEmoji, categoryIndex } from '../lib/categories';
import { dayLabel } from '../lib/dates';
import { groupColorKey, groupColorValue } from '../lib/group-colors';
import { useTabBase } from '../lib/nav';
import { useCategories, useGroups } from '../lib/queries';
import type { LedgerRow } from '../lib/types';
import { formatMoney } from '../lib/money';
import { radius, space, useTheme } from './theme';

/**
 * Lista de gastos del registro personal. Cada fila muestra si es personal o
 * tu parte de un grupo (con el color del grupo). Con `byDay`, separa por día.
 */
export function LedgerList({ rows, byDay = false }: { rows: readonly LedgerRow[]; byDay?: boolean }) {
  const theme = useTheme();
  const categories = useCategories();
  const groups = useGroups();
  const index = categoryIndex(categories.data ?? []);
  const base = useTabBase();
  if (rows.length === 0) return null;
  const groupById = new Map((groups.data ?? []).map((g) => [g.id, g]));

  return (
    <View style={{ gap: 2 }}>
      {rows.map((r, i) => {
        const cat = r.category_id ? index.byId.get(r.category_id) : undefined;
        const g = groupById.get(r.group_id);
        const newDay = byDay && (i === 0 || rows[i - 1]!.spent_at !== r.spent_at);
        return (
          <Fragment key={r.expense_id}>
            {newDay ? (
              <Text
                style={{
                  color: theme.muted,
                  fontSize: 12,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginTop: i === 0 ? 0 : space.md,
                  marginBottom: space.xs,
                }}
              >
                {dayLabel(r.spent_at)}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`${base}/expense/${r.expense_id}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingVertical: space.sm,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  backgroundColor: theme.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 20 }}>{categoryEmoji(index.rootOf(r.category_id))}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                  {r.description}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      borderRadius: radius.sm - 2,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      backgroundColor: r.is_personal ? theme.positiveSoft : g ? groupColorValue(groupColorKey(g), theme) : theme.chip,
                      flexShrink: 1,
                    }}
                  >
                    <Text
                      style={{ fontSize: 11, fontWeight: '700', color: r.is_personal ? theme.positive : theme.onGroup }}
                      numberOfLines={1}
                    >
                      {r.is_personal ? t.common.personal : t.ledger.yourShareIn(r.group_name)}
                    </Text>
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {byDay ? (cat?.name ?? t.ledger.uncategorized) : dayLabel(r.spent_at)}
                  </Text>
                </View>
              </View>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {formatMoney(r.consumed_minor, r.currency)}
              </Text>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}
