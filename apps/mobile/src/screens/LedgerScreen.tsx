import { cashflowSummary } from '@clear-accounts/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LedgerList } from '../components/LedgerList';
import { Money } from '../components/Money';
import { radius, space, useTheme } from '../components/theme';
import { Card, Chip, ChipRow, Empty, ErrorState, Input, Label, Loading, Row, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { categoryEmoji } from '../lib/categories';
import { monthLabel, monthRange } from '../lib/dates';
import { toLedgerEntries } from '../lib/ledger';
import { compareByCategory, filterLedger, type LedgerFilter, type LedgerKind } from '../lib/ledger-filters';
import { useCategories, useLedger, useRefreshAll } from '../lib/queries';

const KINDS: { key: LedgerKind; label: string }[] = [
  { key: 'all', label: t.ledger.all },
  { key: 'personal', label: t.ledger.personalOnly },
  { key: 'shared', label: t.ledger.sharedOnly },
];

export default function LedgerScreen() {
  const theme = useTheme();
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [filter, setFilter] = useState<LedgerFilter>({ query: '', kind: 'all', rootCategoryId: null });

  const { from, to } = monthRange(cursor.year, cursor.month);
  const prevDate = new Date(cursor.year, cursor.month - 1, 1);
  const prev = monthRange(prevDate.getFullYear(), prevDate.getMonth());
  const ledger = useLedger(from, to);
  const previous = useLedger(prev.from, prev.to);
  const categories = useCategories();
  const refreshAll = useRefreshAll();

  const byId = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  // Los mismos filtros se aplican a los dos meses, para comparar peras con peras.
  const base = { ...filter, rootCategoryId: null };
  const current = useMemo(() => filterLedger(ledger.data ?? [], base, byId), [ledger.data, filter.query, filter.kind, byId]);
  const before = useMemo(() => filterLedger(previous.data ?? [], base, byId), [previous.data, filter.query, filter.kind, byId]);
  const visible = useMemo(() => filterLedger(current, filter, byId), [current, filter, byId]);

  const currencies = [...new Set(current.map((r) => r.currency))];
  const totals = useMemo(() => cashflowSummary(toLedgerEntries(visible)), [visible]);
  const categoryName = (key: string) => (key === 'none' ? t.ledger.uncategorized : (byId.get(key)?.name ?? '?'));

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

      <Input
        value={filter.query}
        onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
        placeholder={`🔍 ${t.ledger.search}`}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <ChipRow>
        {filter.rootCategoryId ? (
          <Chip
            label={t.ledger.filteredBy(categoryName(filter.rootCategoryId))}
            selected
            onPress={() => setFilter((f) => ({ ...f, rootCategoryId: null }))}
          />
        ) : null}
        {KINDS.map((k) => (
          <Chip key={k.key} label={k.label} selected={filter.kind === k.key} onPress={() => setFilter((f) => ({ ...f, kind: k.key }))} />
        ))}
      </ChipRow>

      {ledger.isLoading ? <Loading /> : null}
      {ledger.error ? <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} /> : null}
      {ledger.data && ledger.data.length === 0 ? <Empty>{t.ledger.empty}</Empty> : null}
      {ledger.data && ledger.data.length > 0 && visible.length === 0 ? <Empty>{t.ledger.noResults}</Empty> : null}

      {currencies.map((currency) => {
        const cmp = compareByCategory(current, before, currency, byId);
        const total = totals[currency];
        const max = cmp.categories[0]?.current || 1;
        return (
          <Card key={currency}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Label>{t.ledger.consumed}</Label>
                <Money minor={total?.consumedMinor ?? 0} currency={currency} style={{ fontSize: 26 }} />
                {!filter.rootCategoryId ? <Change pct={cmp.total.changePct} /> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Label>{t.ledger.paid}</Label>
                <Money minor={total?.paidMinor ?? 0} currency={currency} style={{ fontSize: 18, color: theme.muted }} />
              </View>
            </Row>
            <Label style={{ marginTop: space.md }}>{t.ledger.byCategory}</Label>
            {cmp.categories
              .filter((c) => c.current > 0)
              .map((c) => {
                const selected = filter.rootCategoryId === c.key;
                const dimmed = filter.rootCategoryId !== null && !selected;
                return (
                  <Pressable
                    key={c.key}
                    accessibilityRole="button"
                    onPress={() => setFilter((f) => ({ ...f, rootCategoryId: selected ? null : c.key }))}
                    style={{ gap: 4, marginTop: space.xs, opacity: dimmed ? 0.4 : 1 }}
                  >
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ color: theme.text, fontWeight: selected ? '700' : '400' }}>
                        {c.key === 'none' ? '🏷️' : categoryEmoji(byId.get(c.key))} {categoryName(c.key)}
                      </Text>
                      <Row style={{ gap: space.xs }}>
                        <Change pct={c.changePct} isNew={c.previous === 0} compact />
                        <Money minor={c.current} currency={currency} />
                      </Row>
                    </Row>
                    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: theme.chip }}>
                      <View
                        style={{
                          height: 6,
                          borderRadius: radius.pill,
                          backgroundColor: theme.primary,
                          width: `${Math.max(2, (c.current / max) * 100)}%`,
                        }}
                      />
                    </View>
                  </Pressable>
                );
              })}
          </Card>
        );
      })}

      <LedgerList rows={visible} />
    </Screen>
  );
}

/** Variación contra el mes anterior: ▲ más gasto (rojo), ▼ menos gasto (verde). */
function Change({ pct, isNew, compact }: { pct: number | null; isNew?: boolean; compact?: boolean }) {
  const theme = useTheme();
  if (pct === null) {
    return isNew && compact ? <Text style={{ color: theme.muted, fontSize: 12 }}>{t.ledger.newThisMonth}</Text> : null;
  }
  const color = pct > 0 ? theme.negative : pct < 0 ? theme.positive : theme.muted;
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
  return (
    <Text style={{ color, fontSize: compact ? 12 : 13, fontWeight: '600' }}>
      {arrow} {Math.abs(pct)}%{compact ? '' : ` ${t.ledger.vsPrevious}`}
    </Text>
  );
}
