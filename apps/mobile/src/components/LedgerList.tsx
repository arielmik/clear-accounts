import { Text, View } from 'react-native';
import { t } from '../i18n';
import { categoryEmoji, categoryIndex } from '../lib/categories';
import { shortDate } from '../lib/dates';
import { useCategories } from '../lib/queries';
import type { LedgerRow } from '../lib/types';
import { Money } from './Money';
import { space, useTheme } from './theme';
import { Card, Row } from './ui';

export function LedgerList({ rows }: { rows: readonly LedgerRow[] }) {
  const theme = useTheme();
  const categories = useCategories();
  const index = categoryIndex(categories.data ?? []);
  if (rows.length === 0) return null;
  return (
    <Card style={{ paddingVertical: space.sm }}>
      {rows.map((r, i) => {
        const cat = r.category_id ? index.byId.get(r.category_id) : undefined;
        return (
          <Row
            key={r.expense_id}
            style={{
              paddingVertical: space.sm,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: theme.border,
            }}
          >
            <Text style={{ fontSize: 22, width: 32 }}>{categoryEmoji(index.rootOf(r.category_id))}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 16 }} numberOfLines={1}>
                {r.description}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13 }} numberOfLines={1}>
                {shortDate(r.spent_at)} · {cat?.name ?? t.ledger.uncategorized}
                {r.is_personal ? '' : ` · ${r.group_name}`}
              </Text>
            </View>
            <Money minor={r.consumed_minor} currency={r.currency} />
          </Row>
        );
      })}
    </Card>
  );
}
