import { simplifyDebts } from '@clear-accounts/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Money } from '../components/Money';
import { space, useTheme } from '../components/theme';
import { Button, Card, Chip, ChipRow, Empty, ErrorState, Input, Label, Loading, Row, Screen } from '../components/ui';
import { t } from '../i18n';
import { groupActivity } from '../lib/activity';
import { addGuestMember, deleteGroup, removeMember, renameMember, setGroupImage } from '../lib/api';
import { useUserId } from '../lib/auth';
import { confirm } from '../lib/confirm';
import { shortDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { removeStoredImage, replaceImage } from '../lib/images';
import { formatMoney } from '../lib/money';
import {
  useBalances,
  useDeleteSettlement,
  useGroup,
  useGroupExpenses,
  useInvalidateGroups,
  useRefreshAll,
  useSettlements,
} from '../lib/queries';
import type { Member, SettlementRow } from '../lib/types';

type Section = 'expenses' | 'balances' | 'members';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const userId = useUserId();
  const group = useGroup(id);
  const expenses = useGroupExpenses(id);
  const balances = useBalances(id);
  const settlements = useSettlements(id);
  const deletePayment = useDeleteSettlement();
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
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

  // Gastos y pagos intercalados según cuándo ocurrieron.
  const activity = useMemo(
    () => groupActivity(expenses.data ?? [], settlements.data ?? []),
    [expenses.data, settlements.data],
  );

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

  function invite() {
    router.push({ pathname: '/invite', params: { groupId: g.id } });
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

  function openSettle(tr?: (typeof transfers)[number]) {
    router.push({
      pathname: '/settle-form',
      params: tr
        ? { groupId: g.id, from: tr.fromMemberId, to: tr.toMemberId, amount: String(tr.amountMinor) }
        : { groupId: g.id, from: me?.id ?? '' },
    });
  }

  async function removePayment(p: SettlementRow) {
    const text = t.groups.paymentRow(nameOf(p.from_member_id), nameOf(p.to_member_id), p.from_member_id === me?.id, p.to_member_id === me?.id);
    if (!(await confirm(t.groups.confirmDeletePayment(text, formatMoney(p.amount_minor, p.currency)), t.expense.delete, t.common.cancel))) return;
    deletePayment.mutate(p.id);
  }

  async function changeImage() {
    setImageBusy(true);
    setImageError(null);
    try {
      const changed = await replaceImage({
        kind: 'groups',
        ownerId: g.id,
        currentPath: g.image_path,
        assign: (path) => setGroupImage(g.id, path),
      });
      if (changed) await Promise.all([group.refetch(), invalidateGroups()]);
    } catch (e) {
      setImageError(friendlyError(e));
    } finally {
      setImageBusy(false);
    }
  }

  const allSettled = (balances.data ?? []).every((b) => b.balance_minor === 0);

  async function removeGroup() {
    if (!(await confirm(t.groups.confirmDeleteGroup(g.name), t.groups.deleteGroup, t.common.cancel))) return;
    await runMemberAction(async () => {
      await deleteGroup(g.id);
      router.back();
    });
  }

  async function removeImage() {
    if (!g.image_path) return;
    setImageBusy(true);
    try {
      await setGroupImage(g.id, null);
      await removeStoredImage(g.image_path);
      await Promise.all([group.refetch(), invalidateGroups()]);
    } catch (e) {
      setImageError(friendlyError(e));
    } finally {
      setImageBusy(false);
    }
  }

  return (
    <Screen edges={[]} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: g.name }} />
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.groups.changeImage} onPress={changeImage} disabled={imageBusy}>
          <Avatar path={g.image_path} size={96} name={g.name} />
        </Pressable>
        <Row>
          <Chip label={g.image_path ? t.groups.changeImage : t.groups.addImage} onPress={changeImage} />
          {g.image_path ? <Chip label={t.groups.removeImage} onPress={removeImage} /> : null}
        </Row>
        {imageBusy ? <Loading /> : null}
        {imageError ? <Text style={{ color: theme.negative }}>{imageError}</Text> : null}
      </View>
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
          {expenses.data?.length === 0 && settlements.data?.length === 0 ? <Empty>{t.groups.noExpenses}</Empty> : null}
          {activity.map((item) => {
            if (item.kind === 'payment') {
              const p = item.p;
              return (
                <Pressable
                  key={`p-${p.id}`}
                  accessibilityRole="button"
                  onPress={() => removePayment(p)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Card style={{ backgroundColor: theme.chip }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 15 }}>
                          💸 {t.groups.paymentRow(nameOf(p.from_member_id), nameOf(p.to_member_id), p.from_member_id === me?.id, p.to_member_id === me?.id)}
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 13 }}>{shortDate(p.paid_at)}</Text>
                      </View>
                      <Money minor={p.amount_minor} currency={p.currency} />
                    </Row>
                  </Card>
                </Pressable>
              );
            }
            const e = item.e;
            const payer = e.expense_payers[0];
            const myShare = e.expense_shares.find((sh) => sh.member_id === me?.id)?.amount_minor ?? 0;
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
              <Button title={t.groups.markPaid} variant="secondary" onPress={() => openSettle(tr)} />
            </Card>
          ))}
          <Button title={t.groups.registerPayment} variant="secondary" onPress={() => openSettle()} />
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
          <View style={{ marginTop: space.xl, gap: space.xs }}>
            <Button title={t.groups.deleteGroup} variant="secondary" onPress={removeGroup} disabled={!allSettled} />
            {!allSettled ? (
              <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center' }}>{t.groups.deleteGroupHint}</Text>
            ) : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
