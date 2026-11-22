import { simplifyDebts } from '@clear-accounts/core';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Money } from '../components/Money';
import { space, useTheme } from '../components/theme';
import { Button, Card, Chip, ChipRow, Empty, ErrorState, Input, Label, Loading, Row, Screen } from '../components/ui';
import { t } from '../i18n';
import { addGuestMember, createInvite, removeMember, renameMember } from '../lib/api';
import { useUserId } from '../lib/auth';
import { confirm } from '../lib/confirm';
import { shortDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { formatMoney } from '../lib/money';
import {
  useBalances,
  useCreateSettlement,
  useGroup,
  useGroupExpenses,
  useInvalidateGroups,
  useRefreshAll,
} from '../lib/queries';
import type { Member } from '../lib/types';

type Section = 'expenses' | 'balances' | 'members';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const userId = useUserId();
  const group = useGroup(id);
  const expenses = useGroupExpenses(id);
  const balances = useBalances(id);
  const settle = useCreateSettlement();
  const invalidateGroups = useInvalidateGroups();
  const refreshAll = useRefreshAll();
  const [section, setSection] = useState<Section>('expenses');
  const [guestName, setGuestName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  const allMembers = group.data?.group_members ?? [];
  const members = allMembers.filter((m) => m.left_at === null);
  const me = members.find((m) => m.user_id === userId);
  const nameOf = (memberId: string) => {
    const m = allMembers.find((x) => x.id === memberId);
    return m?.user_id === userId ? t.common.me : (m?.display_name ?? '?');
  };

  // Saldo por miembro (en todas las monedas del grupo).
  const balanceOf = useMemo(() => {
    const map = new Map<string, { currency: string; minor: number }[]>();
    for (const b of balances.data ?? []) {
      if (b.balance_minor === 0) continue;
      map.set(b.member_id, [...(map.get(b.member_id) ?? []), { currency: b.currency, minor: b.balance_minor }]);
    }
    return map;
  }, [balances.data]);

  const transfers = useMemo(() => {
    const byCurrency: Record<string, Record<string, number>> = {};
    for (const b of balances.data ?? []) (byCurrency[b.currency] ??= {})[b.member_id] = b.balance_minor;
    return Object.entries(byCurrency).flatMap(([currency, map]) =>
      simplifyDebts(map).map((tr) => ({ ...tr, currency })),
    );
  }, [balances.data]);

  if (group.isLoading) return <Loading />;
  if (group.error || !group.data)
    return (
      <Screen edges={[]}>
        <ErrorState error={group.error} onRetry={() => group.refetch()} />
      </Screen>
    );
  const g = group.data;

  async function invite() {
    const token = await createInvite(g.id, userId);
    const url = Linking.createURL(`join/${token}`);
    await Share.share({ message: t.groups.inviteMessage(g.name, url) });
  }

  async function runMemberAction(action: () => Promise<void>) {
    setMemberError(null);
    try {
      await action();
      await Promise.all([group.refetch(), invalidateGroups()]);
    } catch (e) {
      setMemberError(friendlyError(e));
    }
  }

  async function remove(m: Member) {
    if (!(await confirm(t.groups.confirmRemove(m.display_name), t.groups.remove, t.common.cancel))) return;
    await runMemberAction(() => removeMember(m.id));
  }

  async function markPaid(tr: (typeof transfers)[number]) {
    const ok = await confirm(
      t.groups.confirmSettle(nameOf(tr.fromMemberId), nameOf(tr.toMemberId), formatMoney(tr.amountMinor, tr.currency)),
      t.groups.markPaid,
      t.common.cancel,
    );
    if (!ok) return;
    settle.mutate({
      groupId: g.id,
      fromMemberId: tr.fromMemberId,
      toMemberId: tr.toMemberId,
      amountMinor: tr.amountMinor,
      currency: tr.currency,
      userId,
    });
  }

  return (
    <Screen edges={[]} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: g.name }} />
      <ChipRow>
        <Chip label={t.groups.expenses} selected={section === 'expenses'} onPress={() => setSection('expenses')} />
        <Chip label={t.groups.balances} selected={section === 'balances'} onPress={() => setSection('balances')} />
        <Chip label={t.groups.members} selected={section === 'members'} onPress={() => setSection('members')} />
      </ChipRow>

      {section === 'expenses' ? (
        <>
          <Button
            title={t.expense.new}
            onPress={() => router.push({ pathname: '/expense-form', params: { groupId: g.id } })}
          />
          {expenses.isLoading ? <Loading /> : null}
          {expenses.error ? <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} /> : null}
          {expenses.data?.length === 0 ? <Empty>{t.groups.noExpenses}</Empty> : null}
          {expenses.data?.map((e) => {
            const payer = e.expense_payers[0];
            const myShare = e.expense_shares.find((s) => s.member_id === me?.id)?.amount_minor ?? 0;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => router.push(`/groups/expense/${e.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Card>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>{e.description}</Text>
                      <Text style={{ color: theme.muted, fontSize: 13 }}>
                        {shortDate(e.spent_at)} · {t.expense.paidBy} {payer ? nameOf(payer.member_id) : '?'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Money minor={e.amount_minor} currency={e.currency} />
                      <Text style={{ color: theme.muted, fontSize: 12 }}>
                        {t.common.me}: {formatMoney(myShare, e.currency)}
                      </Text>
                    </View>
                  </Row>
                </Card>
              </Pressable>
            );
          })}
        </>
      ) : null}

      {section === 'balances' ? (
        <>
          <Card>
            {(balances.data ?? []).map((b) => (
              <Row key={`${b.member_id}-${b.currency}`} style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: theme.text, fontSize: 16 }}>{nameOf(b.member_id)}</Text>
                <Money minor={b.balance_minor} currency={b.currency} signed />
              </Row>
            ))}
          </Card>
          <Label>{t.groups.settleUp}</Label>
          {transfers.length === 0 ? <Empty>{t.groups.allSettled}</Empty> : null}
          {transfers.map((tr) => (
            <Card key={`${tr.fromMemberId}-${tr.toMemberId}-${tr.currency}`}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>
                {t.groups.transfer(
                  nameOf(tr.fromMemberId),
                  nameOf(tr.toMemberId),
                  tr.fromMemberId === me?.id,
                  tr.toMemberId === me?.id,
                )}
              </Text>
              <Money minor={tr.amountMinor} currency={tr.currency} style={{ fontSize: 22 }} />
              <Button
                title={t.groups.markPaid}
                variant="secondary"
                onPress={() => markPaid(tr)}
                loading={settle.isPending}
              />
            </Card>
          ))}
        </>
      ) : null}

      {section === 'members' ? (
        <>
          <Card>
            {members.map((m, i) => {
              const pending = balanceOf.get(m.id);
              const isMe = m.user_id === userId;
              const isGuest = m.user_id === null;
              const isEditing = editing?.id === m.id;
              return (
                <View
                  key={m.id}
                  style={{
                    gap: space.sm,
                    paddingVertical: space.sm,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: theme.border,
                  }}
                >
                  {isEditing ? (
                    <Row>
                      <Input
                        style={{ flex: 1 }}
                        value={editing.name}
                        onChangeText={(name) => setEditing({ id: m.id, name })}
                        autoFocus
                      />
                      <Button
                        title="✓"
                        onPress={() =>
                          runMemberAction(async () => {
                            await renameMember(m.id, editing.name.trim());
                            setEditing(null);
                          })
                        }
                        disabled={!editing.name.trim()}
                      />
                    </Row>
                  ) : (
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 16 }}>{nameOf(m.id)}</Text>
                        <Text style={{ color: theme.muted, fontSize: 13 }}>
                          {[isGuest ? t.groups.guest : null, m.role === 'owner' ? t.groups.owner : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      {pending?.map((p) => (
                        <Money key={p.currency} minor={p.minor} currency={p.currency} signed />
                      ))}
                    </Row>
                  )}
                  {!isMe && !isEditing ? (
                    <Row>
                      {isGuest ? (
                        <Chip label={t.groups.rename} onPress={() => setEditing({ id: m.id, name: m.display_name })} />
                      ) : null}
                      {pending ? (
                        <Text style={{ color: theme.muted, fontSize: 13 }}>{t.groups.pendingBalance}</Text>
                      ) : (
                        <Chip label={t.groups.remove} onPress={() => remove(m)} />
                      )}
                    </Row>
                  ) : null}
                </View>
              );
            })}
          </Card>
          {memberError ? <Text style={{ color: theme.negative }}>{memberError}</Text> : null}
          <Button title={t.groups.invite} onPress={invite} />
          <Label style={{ marginTop: space.md }}>{t.groups.addGuest}</Label>
          <Row>
            <Input style={{ flex: 1 }} value={guestName} onChangeText={setGuestName} placeholder={t.groups.guestName} />
            <Button
              title="+"
              variant="secondary"
              onPress={() =>
                runMemberAction(async () => {
                  await addGuestMember(g.id, guestName.trim());
                  setGuestName('');
                })
              }
              disabled={!guestName.trim()}
            />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}
