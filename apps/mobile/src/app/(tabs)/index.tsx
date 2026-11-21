import { cashflowSummary } from '@clear-accounts/core';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { LedgerList } from '../../components/LedgerList';
import { Money } from '../../components/Money';
import { space, useTheme } from '../../components/theme';
import { Card, Empty, ErrorState, Label, Loading, Row, Screen, Title } from '../../components/ui';
import { t } from '../../i18n';
import { useUserId } from '../../lib/auth';
import { monthRange } from '../../lib/dates';
import { toLedgerEntries } from '../../lib/ledger';
import { useBalances, useGroups, useLedger } from '../../lib/queries';

export default function Home() {
  const theme = useTheme();
  const userId = useUserId();
  const now = new Date();
  const { from, to } = monthRange(now.getFullYear(), now.getMonth());
  const ledger = useLedger(from, to);
  const groups = useGroups();
  const balances = useBalances();

  // Lo que te deben / debés, sumando todos tus grupos compartidos, por moneda.
  const debts = useMemo(() => {
    const mine = new Set(
      (groups.data ?? [])
        .filter((g) => g.kind !== 'personal')
        .flatMap((g) => g.group_members.filter((m) => m.user_id === userId).map((m) => m.id)),
    );
    const out: Record<string, { owed: number; owe: number }> = {};
    for (const b of balances.data ?? []) {
      if (!mine.has(b.member_id)) continue;
      const c = (out[b.currency] ??= { owed: 0, owe: 0 });
      if (b.balance_minor > 0) c.owed += b.balance_minor;
      else c.owe -= b.balance_minor;
    }
    return out;
  }, [groups.data, balances.data, userId]);

  const consumed = useMemo(() => cashflowSummary(toLedgerEntries(ledger.data ?? [])), [ledger.data]);

  return (
    <Screen>
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

      {Object.entries(debts).map(([currency, d]) => (
        <Row key={currency} style={{ gap: space.md }}>
          <Card style={{ flex: 1 }}>
            <Label>{t.home.owedToYou}</Label>
            <Money minor={d.owed} currency={currency} style={{ fontSize: 22, color: theme.positive }} />
          </Card>
          <Card style={{ flex: 1 }}>
            <Label>{t.home.youOwe}</Label>
            <Money minor={d.owe} currency={currency} style={{ fontSize: 22, color: d.owe ? theme.negative : theme.text }} />
          </Card>
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
      <Text style={{ height: space.xl }} />
    </Screen>
  );
}
