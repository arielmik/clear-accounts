import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { radius, space, useTheme } from '../../components/theme';
import { Button, Chip, ChipRow, ErrorState, Input, Label, Loading, Row, Screen } from '../../components/ui';
import { t } from '../../i18n';
import { useUserId } from '../../lib/auth';
import { categoryEmoji, categoryIndex } from '../../lib/categories';
import { isoDate } from '../../lib/dates';
import { activeMembers, buildExpensePayload, initialFormState, type ExpenseFormState } from '../../lib/expense-form';
import { formatMoney, parseAmount } from '../../lib/money';
import { useCategories, useGroups, useSaveExpense } from '../../lib/queries';
import type { Group, SplitType } from '../../lib/types';

const SPLIT_TYPES: SplitType[] = ['equal', 'exact', 'percent', 'shares'];

export default function NewExpense() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const userId = useUserId();
  const groups = useGroups();
  const [groupId, setGroupId] = useState<string | undefined>(params.groupId);
  // Lo ya cargado sobrevive al cambio de grupo (el reparto sí se reinicia).
  const [carry, setCarry] = useState<Carry | null>(null);

  const all = groups.data ?? [];
  // Por defecto: el grupo desde donde se abrió o, si no, "Personal".
  const group = all.find((g) => g.id === groupId) ?? all.find((g) => g.kind === 'personal');

  if (groups.isLoading) return <Loading />;
  if (groups.error || !group) return <Screen edges={[]}><ErrorState error={groups.error ?? 'Sin grupos'} onRetry={() => groups.refetch()} /></Screen>;

  return (
    <ExpenseForm
      key={group.id}
      group={group}
      groups={all}
      userId={userId}
      carry={carry}
      onChangeGroup={(id, current) => {
        setCarry(current);
        setGroupId(id);
      }}
    />
  );
}

type Carry = Pick<ExpenseFormState, 'amountText' | 'description' | 'categoryId' | 'spentAt'>;

function ExpenseForm({
  group,
  groups,
  userId,
  carry,
  onChangeGroup,
}: {
  group: Group;
  groups: Group[];
  userId: string;
  carry: Carry | null;
  onChangeGroup: (id: string, current: Carry) => void;
}) {
  const theme = useTheme();
  const categories = useCategories();
  const save = useSaveExpense();
  const members = activeMembers(group);
  const myMemberId = members.find((m) => m.user_id === userId)?.id ?? '';
  const [form, setForm] = useState<ExpenseFormState>(() => ({
    ...initialFormState(group, myMemberId, isoDate()),
    ...carry,
  }));
  const [error, setError] = useState<string | null>(null);
  const isPersonal = group.kind === 'personal';
  const index = useMemo(() => categoryIndex(categories.data ?? []), [categories.data]);
  const selectedRoot = index.rootOf(form.categoryId);

  const set = <K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => setError(null), [form]);

  const amount = parseAmount(form.amountText, group.currency) ?? 0;
  const nameOf = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m?.user_id === userId ? t.common.me : (m?.display_name ?? '?');
  };

  // Ayuda en vivo para repartos manuales: cuánto falta asignar.
  const pending = useMemo(() => {
    if (form.splitType !== 'exact' && form.splitType !== 'percent') return null;
    const values = members.map((m) => form.values[m.id] ?? '');
    if (form.splitType === 'exact') {
      const assigned = values.reduce((a, v) => a + (parseAmount(v, group.currency) ?? 0), 0);
      const diff = amount - assigned;
      return diff === 0 ? null : diff > 0 ? t.expense.remaining(formatMoney(diff, group.currency)) : t.expense.over(formatMoney(-diff, group.currency));
    }
    const pct = values.reduce((a, v) => a + (Number(v.replace(',', '.')) || 0), 0);
    const diff = Math.round((100 - pct) * 100) / 100;
    return diff === 0 ? null : diff > 0 ? t.expense.remaining(`${diff}%`) : t.expense.over(`${-diff}%`);
  }, [form, members, amount, group.currency]);

  async function submit() {
    const result = buildExpensePayload(form, group);
    if (!result.ok) return setError(result.error);
    try {
      await save.mutateAsync(result.payload);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        {/* 1. Monto: lo primero y lo más grande. */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: theme.muted, fontSize: 14, fontWeight: '600' }}>{group.currency}</Text>
          <TextInput
            accessibilityLabel={t.expense.amount}
            value={form.amountText}
            onChangeText={(v) => set('amountText', v)}
            placeholder="0"
            placeholderTextColor={theme.muted}
            keyboardType="decimal-pad"
            autoFocus
            style={{ color: theme.text, fontSize: 44, fontWeight: '700', alignSelf: 'stretch', textAlign: 'center' }}
          />
        </View>

        {/* 2. Descripción */}
        <Input
          value={form.description}
          onChangeText={(v) => set('description', v)}
          placeholder={t.expense.descriptionPlaceholder}
          returnKeyType="done"
        />

        {/* 3. Grupo (o Personal) */}
        <Label>{t.expense.group}</Label>
        <ChipRow>
          {groups.map((g) => (
            <Chip
              key={g.id}
              label={g.kind === 'personal' ? t.common.personal : g.name}
              selected={g.id === group.id}
              onPress={() =>
                onChangeGroup(g.id, {
                  amountText: form.amountText,
                  description: form.description,
                  categoryId: form.categoryId,
                  spentAt: form.spentAt,
                })
              }
            />
          ))}
        </ChipRow>

        {/* 4. Categoría: primer nivel y, opcionalmente, subcategoría */}
        <Label>{t.expense.category}</Label>
        <ChipRow>
          {index.roots.map((c) => (
            <Chip
              key={c.id}
              label={`${categoryEmoji(c)} ${c.name}`}
              selected={selectedRoot?.id === c.id}
              onPress={() => set('categoryId', selectedRoot?.id === c.id ? null : c.id)}
            />
          ))}
        </ChipRow>
        {selectedRoot && index.childrenOf(selectedRoot.id).length > 0 ? (
          <ChipRow>
            {index.childrenOf(selectedRoot.id).map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={form.categoryId === c.id}
                onPress={() => set('categoryId', form.categoryId === c.id ? selectedRoot.id : c.id)}
              />
            ))}
          </ChipRow>
        ) : null}

        {/* 5. Quién pagó y cómo se reparte (solo en grupos compartidos) */}
        {!isPersonal ? (
          <>
            <Label>{t.expense.paidBy}</Label>
            <ChipRow>
              {members.map((m) => (
                <Chip key={m.id} label={nameOf(m.id)} selected={form.payerMemberId === m.id} onPress={() => set('payerMemberId', m.id)} />
              ))}
            </ChipRow>

            <Label>{t.expense.split}</Label>
            <ChipRow>
              {SPLIT_TYPES.map((s) => (
                <Chip
                  key={s}
                  label={t.expense.splitTypes[s]}
                  selected={form.splitType === s}
                  onPress={() => setForm((f) => ({ ...f, splitType: s, values: {} }))}
                />
              ))}
            </ChipRow>
            <View style={{ gap: space.sm, backgroundColor: theme.card, borderRadius: radius.lg, padding: space.md }}>
              {members.map((m) =>
                form.splitType === 'equal' ? (
                  <Row key={m.id} style={{ justifyContent: 'space-between' }}>
                    <Chip
                      label={`${form.participants.includes(m.id) ? '✓ ' : ''}${nameOf(m.id)}`}
                      selected={form.participants.includes(m.id)}
                      onPress={() =>
                        set(
                          'participants',
                          form.participants.includes(m.id)
                            ? form.participants.filter((p) => p !== m.id)
                            : [...form.participants, m.id],
                        )
                      }
                    />
                    <Text style={{ color: theme.muted }}>
                      {form.participants.includes(m.id) && amount > 0
                        ? formatMoney(Math.round(amount / Math.max(1, form.participants.length)), group.currency)
                        : ''}
                    </Text>
                  </Row>
                ) : (
                  <Row key={m.id} style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{nameOf(m.id)}</Text>
                    <Input
                      style={{ width: 120, textAlign: 'right' }}
                      keyboardType="decimal-pad"
                      placeholder={form.splitType === 'percent' ? '%' : form.splitType === 'shares' ? '1' : '0'}
                      value={form.values[m.id] ?? ''}
                      onChangeText={(v) => set('values', { ...form.values, [m.id]: v })}
                    />
                  </Row>
                ),
              )}
              {pending ? <Text style={{ color: theme.muted, textAlign: 'right' }}>{pending}</Text> : null}
            </View>
          </>
        ) : null}

        {error ? <Text style={{ color: theme.negative }}>{error}</Text> : null}
        <Button title={t.common.save} onPress={submit} loading={save.isPending} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
