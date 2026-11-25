import { cashflowSummary } from '@clear-accounts/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LedgerList } from '../components/LedgerList';
import { Money } from '../components/Money';
import { fonts, radius, space, useTheme } from '../components/theme';
import { Chip, ChipRow, Empty, ErrorState, Input, Loading, Row, Screen, Segmented, Title } from '../components/ui';
import { formatMoney } from '../lib/money';
import { t } from '../i18n';
import { categoryEmoji } from '../lib/categories';
import { monthLabel, monthRange } from '../lib/dates';
import { toLedgerEntries } from '../lib/ledger';
import { compareByCategory, filterLedger, type LedgerFilter, type LedgerKind } from '../lib/ledger-filters';
import { useCategories, useLedger, useRefreshAll } from '../lib/queries';

/** Colores de las barras por categoría (los mismos que la tarjeta del mes en Inicio). */
const BAR_COLORS = ['#FF6A4D', '#FFC83D', '#6F86FF', '#2BC48A', '#B59BE6', '#7CC5CC'];

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

  const sharedVsPersonal = (currency: string) => {
    let personal = 0;
    let shared = 0;
    for (const r of visible) {
      if (r.currency !== currency) continue;
      if (r.is_personal) personal += r.consumed_minor;
      else shared += r.consumed_minor;
    }
    return { personal, shared };
  };

  return (
    <Screen onRefresh={refreshAll}>
      <Title>{t.ledger.title}</Title>
      <Row style={[styles.month, { backgroundColor: theme.card }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => move(-1)} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{monthLabel(cursor.year, cursor.month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" onPress={() => move(1)} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </Pressable>
      </Row>

      {ledger.isLoading ? <Loading /> : null}
      {ledger.error ? <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} /> : null}

      {currencies.map((currency) => {
        const cmp = compareByCategory(current, before, currency, byId);
        const total = totals[currency];
        const split = sharedVsPersonal(currency);
        const max = cmp.categories[0]?.current || 1;
        const visibleCats = cmp.categories.filter((c) => c.current > 0);
        return (
          <View key={currency} style={{ gap: space.md }}>
            <View style={{ gap: 2 }}>
              <Text
                style={{ color: theme.text, fontFamily: fonts.display, fontSize: 40, letterSpacing: -1, fontVariant: ['tabular-nums'] }}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {formatMoney(total?.consumedMinor ?? 0, currency)}
              </Text>
              {!filter.rootCategoryId ? <Change pct={cmp.total.changePct} /> : null}
              <Text style={{ color: theme.muted, fontSize: 13 }}>
                {t.ledger.split(formatMoney(split.personal, currency), formatMoney(split.shared, currency))}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 13 }}>{t.ledger.youPaidTotal(formatMoney(total?.paidMinor ?? 0, currency))}</Text>
            </View>

            {visibleCats.length > 0 ? (
              <View style={{ gap: space.sm }}>
                {visibleCats.map((c, i) => {
                  const selected = filter.rootCategoryId === c.key;
                  const dimmed = filter.rootCategoryId !== null && !selected;
                  return (
                    <Pressable
                      key={c.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setFilter((f) => ({ ...f, rootCategoryId: selected ? null : c.key }))}
                      style={{ gap: 5, opacity: dimmed ? 0.35 : 1 }}
                    >
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Text style={{ color: theme.text, fontWeight: selected ? '800' : '600', fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
                          {c.key === 'none' ? '🏷️' : categoryEmoji(byId.get(c.key))}  {categoryName(c.key)}
                        </Text>
                        <Row style={{ gap: space.sm }}>
                          <Change pct={c.changePct} isNew={c.previous === 0} compact />
                          <Money minor={c.current} currency={currency} style={{ fontWeight: '800' }} />
                        </Row>
                      </Row>
                      <View style={{ height: 7, borderRadius: radius.pill, backgroundColor: theme.card }}>
                        <View
                          style={{
                            height: 7,
                            borderRadius: radius.pill,
                            backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                            width: `${Math.max(2, (c.current / max) * 100)}%`,
                          }}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={{ gap: space.sm }}>
        <Segmented options={KINDS} value={filter.kind} onChange={(kind) => setFilter((f) => ({ ...f, kind }))} />
        <Input
          value={filter.query}
          onChangeText={(query) => setFilter((f) => ({ ...f, query }))}
          placeholder={`🔍 ${t.ledger.search}`}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {filter.rootCategoryId ? (
          <ChipRow>
            <Chip
              label={t.ledger.filteredBy(categoryName(filter.rootCategoryId))}
              selected
              onPress={() => setFilter((f) => ({ ...f, rootCategoryId: null }))}
            />
          </ChipRow>
        ) : null}
      </View>

      {ledger.data && ledger.data.length === 0 ? <Empty>{t.ledger.empty}</Empty> : null}
      {ledger.data && ledger.data.length > 0 && visible.length === 0 ? <Empty>{t.ledger.noResults}</Empty> : null}
      <LedgerList rows={visible} byDay />
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

const styles = StyleSheet.create({
  month: { justifyContent: 'space-between', borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 10 },
});
