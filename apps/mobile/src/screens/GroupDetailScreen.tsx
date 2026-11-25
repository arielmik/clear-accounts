import { simplifyDebts } from '@clear-accounts/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Money } from '../components/Money';
import { fonts, radius, space, useTheme } from '../components/theme';
import { Button, Card, Chip, Empty, ErrorState, Input, Label, Loading, Row, Screen, Segmented } from '../components/ui';
import { categoryEmoji, categoryIndex } from '../lib/categories';
import { t } from '../i18n';
import { groupActivity } from '../lib/activity';
import { addGuestMember, deleteGroup, removeMember, renameMember, setGroupColor, setGroupImage } from '../lib/api';
import { GroupColorPicker } from '../components/GroupColorPicker';
import { groupColorKey, groupColorValue, type GroupColor } from '../lib/group-colors';
import { useUserId } from '../lib/auth';
import { confirm } from '../lib/confirm';
import { shortDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import { removeStoredImage, replaceImage } from '../lib/images';
import { formatMoney } from '../lib/money';
import {
  useBalances,
  useCategories,
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
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const group = useGroup(id);
  const categories = useCategories();
  const catIndex = useMemo(() => categoryIndex(categories.data ?? []), [categories.data]);
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

  async function changeColor(color: GroupColor) {
    setImageError(null);
    try {
      await setGroupColor(g.id, color);
      await Promise.all([group.refetch(), invalidateGroups()]);
    } catch (e) {
      setImageError(friendlyError(e));
    }
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

  const groupBg = groupColorValue(groupColorKey(g), theme);
  const balanceLabel = (memberId: string) => {
    const list = balanceOf.get(memberId) ?? [];
    const b = list.find((x) => x.currency === g.currency) ?? list[0];
    return b ? { minor: b.minor, text: `${b.minor > 0 ? '+' : '−'}${formatMoney(Math.abs(b.minor), b.currency)}` } : null;
  };

  const header = (
    <View style={[styles.header, { backgroundColor: groupBg, paddingTop: insets.top + space.sm }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.common.back} onPress={() => router.back()} style={styles.circle}>
          <Ionicons name="chevron-back" size={22} color={theme.onGroup} />
        </Pressable>
        {g.kind !== 'personal' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t.groups.invite} onPress={invite} style={styles.circle}>
            <Ionicons name="person-add-outline" size={20} color={theme.onGroup} />
          </Pressable>
        ) : null}
      </Row>
      <Row style={{ gap: space.md }}>
        {g.image_path ? <Avatar path={g.image_path} size={44} name={g.name} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.onGroup, fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.5 }} numberOfLines={2}>
            {g.name}
          </Text>
          <Text style={{ color: theme.onGroup, opacity: 0.7, fontSize: 13, fontWeight: '600' }}>
            {t.groups.kinds[g.kind as keyof typeof t.groups.kinds] ?? t.common.personal} · {t.groups.membersCount(members.length)}
          </Text>
        </View>
      </Row>
      {g.kind !== 'personal' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.md }}>
          {members.map((m) => {
            const b = balanceLabel(m.id);
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={nameOf(m.id)}
                onPress={() => setSection('balances')}
                style={{ alignItems: 'center', gap: 4, width: 64 }}
              >
                <View style={{ borderRadius: 30, borderWidth: 3, borderColor: m.user_id === userId ? theme.onGroup : '#FFFFFF' }}>
                  <Avatar path={null} size={44} name={m.display_name} />
                </View>
                <Text style={{ color: theme.onGroup, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                  {nameOf(m.id)}
                </Text>
                <View style={styles.balancePill}>
                  <Text
                    style={{ fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'], color: !b ? '#6F6A7D' : b.minor > 0 ? '#139463' : '#C9361C' }}
                    numberOfLines={1}
                  >
                    {b ? b.text : '0'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {g.kind !== 'personal' ? (
        transfers.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSection('balances')}
            style={({ pressed }) => [styles.settleButton, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>{t.groups.settleIn(transfers.length)}</Text>
          </Pressable>
        ) : (
          <Text style={{ color: theme.onGroup, fontWeight: '700' }}>{t.groups.allSettled}</Text>
        )
      ) : null}
    </View>
  );

  return (
    <Screen edges={[]} onRefresh={refreshAll} header={header} background={groupBg}>
      <Stack.Screen options={{ headerShown: false }} />
      <Segmented
        options={[
          { key: 'expenses', label: t.groups.expenses },
          { key: 'balances', label: t.groups.balances },
          { key: 'members', label: t.groups.members },
        ]}
        value={section}
        onChange={setSection}
      />

      {section === 'expenses' ? (
        <>
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
                  <Card style={{ backgroundColor: theme.positiveSoft, paddingVertical: space.md }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
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
            const iPaid = !!me && payer?.member_id === me.id;
            const lent = iPaid ? e.amount_minor - myShare : 0;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => router.push(`/groups/expense/${e.id}`)}
                style={({ pressed }) => [styles.row, { backgroundColor: theme.card, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 24 }}>{categoryEmoji(catIndex.rootOf(e.category_id))}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                    {e.description}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
                    {iPaid ? t.groups.youPaid : t.groups.paidByName(payer ? nameOf(payer.member_id) : '?')} · {shortDate(e.spent_at)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] }}>
                    {formatMoney(e.amount_minor, e.currency)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: lent > 0 ? theme.positive : !iPaid && myShare > 0 ? theme.negative : theme.muted,
                    }}
                  >
                    {lent > 0
                      ? t.groups.lent(formatMoney(lent, e.currency))
                      : !iPaid && myShare > 0
                        ? t.groups.borrowed(formatMoney(myShare, e.currency))
                        : t.groups.notInvolved}
                  </Text>
                </View>
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
              <Button title={t.groups.markPaid} onPress={() => openSettle(tr)} />
            </Card>
          ))}
          <Button title={t.groups.registerPayment} variant="secondary" onPress={() => openSettle()} />
        </>
      ) : null}

      {section === 'members' ? (
        <>
          <View style={{ gap: space.sm }}>
            <Label>{t.groups.image}</Label>
            <Row style={{ gap: space.md }}>
              <Pressable accessibilityRole="button" accessibilityLabel={t.groups.changeImage} onPress={changeImage} disabled={imageBusy}>
                <Avatar path={g.image_path} size={56} name={g.name} />
              </Pressable>
              <Chip label={g.image_path ? t.groups.changeImage : t.groups.addImage} onPress={changeImage} />
              {g.image_path ? <Chip label={t.groups.removeImage} onPress={removeImage} /> : null}
            </Row>
            {imageBusy ? <Loading /> : null}
            {imageError ? <Text style={{ color: theme.negative }}>{imageError}</Text> : null}
          </View>
          {g.kind !== 'personal' ? (
            <View style={{ gap: space.sm }}>
              <Label>{t.groups.color}</Label>
              <GroupColorPicker value={groupColorKey(g) as GroupColor} onChange={changeColor} />
              <Text style={{ color: theme.muted, fontSize: 13 }}>{t.groups.colorHint}</Text>
            </View>
          ) : null}
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

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg + 2,
    gap: space.md,
    borderBottomLeftRadius: radius.xl + 4,
    borderBottomRightRadius: radius.xl + 4,
    marginBottom: space.xs,
  },
  circle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balancePill: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 76 },
  settleButton: {
    backgroundColor: '#16131F',
    borderRadius: radius.lg,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.md },
});
