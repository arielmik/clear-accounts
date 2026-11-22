import { cashflowSummary } from '@clear-accounts/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LedgerList } from '../components/LedgerList';
import { Money } from '../components/Money';
import { radius, space, useTheme } from '../components/theme';
import { Card, Empty, ErrorState, Label, Loading, Row, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { categoryEmoji, categoryIndex } from '../lib/categories';
import { monthLabel, monthRange } from '../lib/dates';
import { toLedgerEntries } from '../lib/ledger';
import { useCategories, useLedger, useRefreshAll } from '../lib/queries';

export default function Ledger() {
  const theme = useTheme();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const { from, to } = monthRange(cursor.year, cursor.month);
  const ledger = useLedger(from, to);
  const categories = useCategories();
  const refreshAll = useRefreshAll();

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  // Consumo agrupado por categoría de primer nivel, por moneda.
  const report = useMemo(() => {
    const index = categoryIndex(categories.data ?? []);
    const byCurrency: Record<string, { key: string; label: string; emoji: string; minor: number }[]> = {};
    for (const r of ledger.data ?? []) {
      const root = index.rootOf(r.category_id);
      const key = root?.id ?? 'none';
      const list = (byCurrency[r.currency] ??= []);
      let item = list.find((x) => x.key === key);
      if (!item) {
        item = { key, label: root?.name ?? t.ledger.uncategorized, emoji: categoryEmoji(root), minor: 0 };
        list.push(item);
      }
      item.minor += r.consumed_minor;
    }
    Object.values(byCurrency).forEach((list) => list.sort((a, b) => b.minor - a.minor));
    return byCurrency;
  }, [ledger.data, categories.data]);

  const totals = useMemo(() => cashflowSummary(toLedgerEntries(ledger.data ?? [])), [ledger.data]);

  return (
    <Screen onRefresh={refreshAll}>
      <Title>{t.ledger.title}</Title>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel="Mes anterior" onPress={() => move(-1)} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </Pressable>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600' }}>{monthLabel(cursor.year, cursor.month)}</Text>
        <Pressable accessibilityLabel="Mes siguiente" onPress={() => move(1)} hitSlop={12}>
          <Ionicons name="chevron-forward" size={24} color={theme.text} />
        </Pressable>
      </Row>

      {ledger.isLoading ? <Loading /> : null}
      {ledger.error ? <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} /> : null}
      {ledger.data && ledger.data.length === 0 ? <Empty>{t.ledger.empty}</Empty> : null}

      {Object.entries(report).map(([currency, items]) => {
        const total = totals[currency];
        const max = items[0]?.minor || 1;
        return (
          <Card key={currency}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Label>{t.ledger.consumed}</Label>
                <Money minor={total?.consumedMinor ?? 0} currency={currency} style={{ fontSize: 26 }} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Label>{t.ledger.paid}</Label>
                <Money minor={total?.paidMinor ?? 0} currency={currency} style={{ fontSize: 18, color: theme.muted }} />
              </View>
            </Row>
            <Label style={{ marginTop: space.md }}>{t.ledger.byCategory}</Label>
            {items.map((item) => (
              <View key={item.key} style={{ gap: 4, marginTop: space.xs }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.text }}>
                    {item.emoji} {item.label}
                  </Text>
                  <Money minor={item.minor} currency={currency} />
                </Row>
                <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: theme.chip }}>
                  <View
                    style={{
                      height: 6,
                      borderRadius: radius.pill,
                      backgroundColor: theme.primary,
                      width: `${Math.max(2, (item.minor / max) * 100)}%`,
                    }}
                  />
                </View>
              </View>
            ))}
          </Card>
        );
      })}

      <LedgerList rows={ledger.data ?? []} />
    </Screen>
  );
}
