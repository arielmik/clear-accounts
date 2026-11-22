import { cashflowSummary } from '@clear-accounts/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { LedgerList } from '../components/LedgerList';
import { Money } from '../components/Money';
import { space, useTheme } from '../components/theme';
import { Card, Empty, ErrorState, Label, Loading, Row, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { useUserId } from '../lib/auth';
import { monthRange } from '../lib/dates';
import { myDebts, totalsByCurrency } from '../lib/debts';
import { toLedgerEntries } from '../lib/ledger';
import { useBalances, useGroups, useLedger, useRefreshAll } from '../lib/queries';

export default function HomeScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const refreshAll = useRefreshAll();
  const now = new Date();
  const { from, to } = monthRange(now.getFullYear(), now.getMonth());
  const ledger = useLedger(from, to);
  const groups = useGroups();
  const balances = useBalances();

  const debts = useMemo(
    () => myDebts(groups.data ?? [], balances.data ?? [], userId),
    [groups.data, balances.data, userId],
  );
  const owed = totalsByCurrency(debts.owed);
  const owe = totalsByCurrency(debts.owe);
  const currencies = [...new Set([...Object.keys(owed), ...Object.keys(owe)])];

  const consumed = useMemo(() => cashflowSummary(toLedgerEntries(ledger.data ?? [])), [ledger.data]);

  return (
    <Screen onRefresh={refreshAll}>
      <Title>{t.appName}</Title>

      <Card>
        <Label>{t.home.thisMonth}</Label>
        {ledger.isLoading ? (
          <Loading />
        ) : Object.keys(consumed).length === 0 ? (
          <Money minor={0} currency="ARS" style={{ fontSize: 34 }} />
        ) : (
          Object.entries(consumed).map(([currency, c]) => (
            <Money key={currency} minor={c.consumedMinor} currency={currency} style={{ fontSize: 34 }} />
          ))
        )}
      </Card>

      {(currencies.length ? currencies : groups.data?.some((g) => g.kind !== 'personal') ? ['ARS'] : []).map((currency) => (
        <Row key={currency} style={{ gap: space.md }}>
          <DebtCard
            label={t.home.owedToYou}
            minor={owed[currency] ?? 0}
            currency={currency}
            color={theme.positive}
            onPress={() => router.push('/debts/owed')}
          />
          <DebtCard
            label={t.home.youOwe}
            minor={owe[currency] ?? 0}
            currency={currency}
            color={owe[currency] ? theme.negative : theme.text}
            onPress={() => router.push('/debts/owe')}
          />
        </Row>
      ))}

      <View style={{ gap: space.sm }}>
        <Label>{t.home.recent}</Label>
        {ledger.error ? (
          <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} />
        ) : ledger.data && ledger.data.length === 0 ? (
          <Empty>{t.home.empty}</Empty>
        ) : (
          <LedgerList rows={(ledger.data ?? []).slice(0, 8)} />
        )}
      </View>
    </Screen>
  );
}

function DebtCard({
  label,
  minor,
  currency,
  color,
  onPress,
}: {
  label: string;
  minor: number;
  currency: string;
  color: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t.home.seeDetail}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1 })}
    >
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>{label}</Label>
          <Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </Row>
        <Money minor={minor} currency={currency} style={{ fontSize: 22, color }} />
      </Card>
    </Pressable>
  );
}
