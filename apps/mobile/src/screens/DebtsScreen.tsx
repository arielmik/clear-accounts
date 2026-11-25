import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MemberAvatar } from '../components/Avatar';
import { Money } from '../components/Money';
import { space, useTheme } from '../components/theme';
import { Card, Empty, ErrorState, Label, Loading, Row, Screen } from '../components/ui';
import { t } from '../i18n';
import { useUserId } from '../lib/auth';
import { myDebts, totalsByCurrency } from '../lib/debts';
import { useBalances, useGroups, useRefreshAll } from '../lib/queries';

/** Detalle de "Te deben" (mode=owed) o "Debés" (mode=owe), persona por persona. */
export default function DebtsScreen() {
  const { mode } = useLocalSearchParams<{ mode: 'owed' | 'owe' }>();
  const owedMode = mode !== 'owe';
  const theme = useTheme();
  const userId = useUserId();
  const refreshAll = useRefreshAll();
  const groups = useGroups();
  const balances = useBalances();
  const debts = useMemo(
    () => myDebts(groups.data ?? [], balances.data ?? [], userId),
    [groups.data, balances.data, userId],
  );
  const items = owedMode ? debts.owed : debts.owe;
  const totals = totalsByCurrency(items);

  return (
    <Screen edges={[]} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: owedMode ? t.debts.owedTitle : t.debts.oweTitle }} />
      {groups.isLoading || balances.isLoading ? <Loading /> : null}
      {groups.error || balances.error ? <ErrorState error={groups.error ?? balances.error} onRetry={refreshAll} /> : null}

      {Object.entries(totals).map(([currency, total]) => (
        <Card key={currency}>
          <Label>{owedMode ? t.debts.owedTitle : t.debts.oweTitle}</Label>
          <Money
            minor={total}
            currency={currency}
            style={{ fontSize: 30, color: owedMode ? theme.positive : theme.negative }}
          />
        </Card>
      ))}

      {groups.data && balances.data && items.length === 0 ? (
        <Empty>{owedMode ? t.debts.owedEmpty : t.debts.oweEmpty}</Empty>
      ) : null}

      {items.map((d) => (
        <Pressable
          key={`${d.groupId}-${d.memberId}-${d.currency}`}
          accessibilityRole="button"
          onPress={() => router.push(`/groups/${d.groupId}`)}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Card>
            <Row style={{ justifyContent: 'space-between', gap: space.md }}>
              <MemberAvatar
                member={groups.data?.find((g) => g.id === d.groupId)?.group_members.find((m) => m.id === d.memberId)}
                size={44}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>{d.name}</Text>
                <Text style={{ color: theme.muted }}>{t.debts.inGroup(d.groupName)}</Text>
              </View>
              <Money minor={d.amountMinor} currency={d.currency} style={{ fontSize: 18 }} />
              <Ionicons name="chevron-forward" size={18} color={theme.muted} style={{ marginLeft: space.xs }} />
            </Row>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
