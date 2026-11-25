import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Money } from '../components/Money';
import { fonts, space, useTheme } from '../components/theme';
import { groupColorKey, groupColorValue } from '../lib/group-colors';
import { Button, Card, Empty, ErrorState, Loading, Row, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { useUserId } from '../lib/auth';
import { useBalances, useGroups, useRefreshAll } from '../lib/queries';

export default function Groups() {
  const theme = useTheme();
  const userId = useUserId();
  const groups = useGroups();
  const balances = useBalances();
  const refreshAll = useRefreshAll();
  const shared = (groups.data ?? []).filter((g) => g.kind !== 'personal');

  const myBalance = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of shared) {
      const me = g.group_members.find((m) => m.user_id === userId);
      const total = (balances.data ?? [])
        .filter((b) => b.member_id === me?.id && b.currency === g.currency)
        .reduce((a, b) => a + b.balance_minor, 0);
      map.set(g.id, total);
    }
    return map;
  }, [shared, balances.data, userId]);

  return (
    <Screen onRefresh={refreshAll}>
      <Title>{t.groups.title}</Title>
      {groups.isLoading ? <Loading /> : null}
      {groups.error ? <ErrorState error={groups.error} onRetry={() => groups.refetch()} /> : null}
      {groups.data && shared.length === 0 ? <Empty>{t.groups.empty}</Empty> : null}
      {shared.map((g) => {
        const balance = myBalance.get(g.id) ?? 0;
        return (
          <Pressable key={g.id} onPress={() => router.push(`/groups/${g.id}`)}>
            <Card style={{ backgroundColor: groupColorValue(groupColorKey(g), theme) }}>
              <Row style={{ justifyContent: 'space-between', gap: space.md }}>
                <Avatar path={g.image_path} size={48} name={g.name} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.onGroup, fontSize: 18, fontFamily: fonts.displayBold }}>{g.name}</Text>
                  <Text style={{ color: theme.onGroup, opacity: 0.7 }}>
                    {t.groups.kinds[g.kind as keyof typeof t.groups.kinds]} · {g.group_members.length} {t.groups.members.toLowerCase()}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.onGroup, opacity: 0.7, fontSize: 12 }}>
                    {balance > 0 ? t.home.owedToYou : balance < 0 ? t.home.youOwe : ''}
                  </Text>
                  <Money minor={balance} currency={g.currency} style={{ color: theme.onGroup, fontWeight: '800' }} />
                </View>
              </Row>
            </Card>
          </Pressable>
        );
      })}
      <View style={{ marginTop: space.sm }}>
        <Button title={t.groups.new} variant="secondary" onPress={() => router.push('/group-form')} />
      </View>
    </Screen>
  );
}
