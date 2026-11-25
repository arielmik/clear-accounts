import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { MemberAvatar } from '../components/Avatar';
import { CategoryPicker } from '../components/CategoryPicker';
import { Money } from '../components/Money';
import { space, useTheme } from '../components/theme';
import { Button, Card, Chip, ErrorState, Label, Loading, Row, Screen } from '../components/ui';
import { t } from '../i18n';
import { useUserId } from '../lib/auth';
import { categoryEmoji, categoryIndex } from '../lib/categories';
import { confirm } from '../lib/confirm';
import { setMyCategoryOverride } from '../lib/api';
import { friendlyError } from '../lib/errors';
import {
  useCategories,
  useDeleteExpense,
  useExpense,
  useGroup,
  useInvalidateCategories,
  useMyCategoryOverride,
  useRefreshAll,
} from '../lib/queries';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const userId = useUserId();
  const expense = useExpense(id);
  const group = useGroup(expense.data?.group_id ?? '');
  const categories = useCategories();
  const del = useDeleteExpense();
  const refreshAll = useRefreshAll();
  const override = useMyCategoryOverride(id, userId);
  const invalidateCategories = useInvalidateCategories();
  const [picking, setPicking] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  async function chooseMyCategory(categoryId: string | null) {
    setOverrideError(null);
    try {
      await setMyCategoryOverride(id, userId, categoryId);
      await invalidateCategories();
      setPicking(false);
    } catch (err) {
      setOverrideError(friendlyError(err));
    }
  }

  if (expense.isLoading) return <Loading />;
  if (expense.error || !expense.data)
    return (
      <Screen edges={[]}>
        <ErrorState error={expense.error ? friendlyError(expense.error) : t.expense.notFound} onRetry={() => expense.refetch()} />
      </Screen>
    );

  const e = expense.data;
  const g = group.data;
  const members = g?.group_members ?? [];
  const nameOf = (memberId: string) => {
    const m = members.find((x) => x.id === memberId);
    return m?.user_id === userId ? t.common.me : (m?.display_name ?? '…');
  };
  const myMemberId = members.find((m) => m.user_id === userId)?.id;
  const myShare = e.expense_shares.find((s) => s.member_id === myMemberId)?.amount_minor ?? 0;
  const index = categoryIndex(categories.data ?? []);
  const category = e.category_id ? index.byId.get(e.category_id) : undefined;
  const isPersonal = g?.kind === 'personal';
  const [y, mo, d] = e.spent_at.split('-').map(Number);
  const date = new Date(y!, mo! - 1, d!).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  async function remove() {
    if (!(await confirm(t.expense.confirmDelete, t.expense.delete, t.common.cancel))) return;
    await del.mutateAsync(e.id);
    router.back();
  }

  return (
    <Screen edges={[]} onRefresh={refreshAll}>
      <Stack.Screen options={{ title: t.expense.detail }} />
      <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
        <Text style={{ fontSize: 36 }}>{categoryEmoji(index.rootOf(e.category_id))}</Text>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '600', textAlign: 'center' }}>{e.description}</Text>
        <Money minor={e.amount_minor} currency={e.currency} style={{ fontSize: 34 }} />
        {!isPersonal ? (
          <Text style={{ color: theme.muted }}>
            {t.expense.yourShare}: <Money minor={myShare} currency={e.currency} style={{ color: theme.muted }} />
          </Text>
        ) : null}
      </Card>

      <Card>
        <DetailRow label={t.expense.date} value={date} />
        <DetailRow label={t.expense.category} value={category?.name ?? t.ledger.uncategorized} />
        <DetailRow label={t.expense.group} value={isPersonal ? t.common.personal : (g?.name ?? '…')} />
        {!isPersonal ? (
          <DetailRow
            label={t.expense.paidBy}
            value={e.expense_payers.map((p) => nameOf(p.member_id)).join(', ')}
          />
        ) : null}
      </Card>

      {!isPersonal && myShare > 0 ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>{t.expense.myCategory}</Label>
            <Chip label={picking ? t.common.cancel : t.expense.change} onPress={() => setPicking(!picking)} />
          </Row>
          <Text style={{ color: theme.text, fontSize: 16 }}>
            {(() => {
              const mine = override.data ? index.byId.get(override.data) : category;
              return `${categoryEmoji(index.rootOf(mine?.id ?? null))} ${mine?.name ?? t.ledger.uncategorized}`;
            })()}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>{t.expense.myCategoryHint}</Text>
          {picking ? (
            <View style={{ gap: space.sm }}>
              <CategoryPicker value={override.data ?? null} onChange={(c) => c && void chooseMyCategory(c)} />
              {override.data ? (
                <Chip label={t.expense.useGroupCategory} onPress={() => void chooseMyCategory(null)} />
              ) : null}
            </View>
          ) : null}
          {overrideError ? <Text style={{ color: theme.negative }}>{overrideError}</Text> : null}
        </Card>
      ) : null}

      {!isPersonal ? (
        <>
          <Label>{t.expense.splitAmong}</Label>
          <Card>
            {e.expense_shares.map((s) => (
              <Row key={s.member_id} style={{ gap: space.md }}>
                <MemberAvatar member={members.find((x) => x.id === s.member_id)} size={32} />
                <Text
                  style={{
                    flex: 1,
                    color: theme.text,
                    fontSize: 16,
                    fontWeight: s.member_id === myMemberId ? '700' : '400',
                  }}
                >
                  {nameOf(s.member_id)}
                </Text>
                <Money minor={s.amount_minor} currency={e.currency} />
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Button title={t.expense.edit} onPress={() => router.push({ pathname: '/expense-form', params: { id: e.id } })} />
        <Button title={t.expense.delete} variant="secondary" onPress={remove} loading={del.isPending} />
        {del.error ? <Text style={{ color: theme.negative }}>{friendlyError(del.error)}</Text> : null}
      </View>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <Text style={{ color: theme.muted, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 15, flex: 1, textAlign: 'right' }}>{value}</Text>
    </Row>
  );
}
