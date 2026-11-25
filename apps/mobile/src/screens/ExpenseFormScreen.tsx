import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MemberAvatar } from '../components/Avatar';
import { CategoryPicker } from '../components/CategoryPicker';
import { DateField } from '../components/DateField';
import { fonts, radius, space, useTheme } from '../components/theme';
import { Button, Chip, ChipRow, ErrorState, Input, Label, Loading, Row, Screen, Segmented } from '../components/ui';
import { ReceiptThumb } from '../components/Receipt';
import { t } from '../i18n';
import { useUserId } from '../lib/auth';
import { isoDate } from '../lib/dates';
import { friendlyError } from '../lib/errors';
import {
  activeMembers,
  buildExpensePayload,
  fillRemaining,
  formStateFromExpense,
  splitPreview,
  initialFormState,
  type ExpenseFormState,
} from '../lib/expense-form';
import { setExpenseReceipt } from '../lib/api';
import { groupColorKey, groupColorValue } from '../lib/group-colors';
import { pickReceipt, removeStoredImage, uploadReceipt } from '../lib/images';
import { formatAmountTyping, formatMoney, parseAmount } from '../lib/money';
import { useCategories, useExpense, useGroups, useSaveExpense } from '../lib/queries';
import type { ExpenseRow, Group, Member, SplitType } from '../lib/types';

const SPLIT_TYPES: SplitType[] = ['equal', 'exact', 'percent', 'shares'];

export default function ExpenseFormScreen() {
  const params = useLocalSearchParams<{ groupId?: string; id?: string }>();
  return params.id ? <EditExpense id={params.id} /> : <NewExpense groupId={params.groupId} />;
}

/** Edición: el grupo no se puede cambiar (el gasto pertenece a ese grupo). */
function EditExpense({ id }: { id: string }) {
  const userId = useUserId();
  const groups = useGroups();
  const expense = useExpense(id);
  const group = groups.data?.find((g) => g.id === expense.data?.group_id);

  if (groups.isLoading || expense.isLoading) return <Loading />;
  if (expense.error || groups.error || !group || !expense.data)
    return (
      <Screen edges={[]}>
        <ErrorState error={friendlyError(expense.error ?? groups.error ?? t.expense.notFound)} />
      </Screen>
    );
  return <ExpenseForm group={group} groups={[group]} userId={userId} carry={null} expense={expense.data} onChangeGroup={() => {}} />;
}

function NewExpense({ groupId: initialGroupId }: { groupId?: string | undefined }) {
  const userId = useUserId();
  const groups = useGroups();
  const [groupId, setGroupId] = useState<string | undefined>(initialGroupId);
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
      expense={null}
      onChangeGroup={(id, current) => {
        setCarry(current);
        setGroupId(id);
      }}
    />
  );
}

/** Ticket elegido en el formulario: el ya guardado o uno nuevo (uri local, se sube al guardar). */
type ReceiptState = { path: string } | { uri: string } | null;

type Carry = Pick<ExpenseFormState, 'amountText' | 'description' | 'categoryId' | 'spentAt'> & { receipt?: ReceiptState };

function ExpenseForm({
  group,
  groups,
  userId,
  carry,
  expense,
  onChangeGroup,
}: {
  group: Group;
  groups: Group[];
  userId: string;
  carry: Carry | null;
  expense: ExpenseRow | null;
  onChangeGroup: (id: string, current: Carry) => void;
}) {
  const theme = useTheme();
  const save = useSaveExpense();
  const members = activeMembers(group);
  const myMemberId = members.find((m) => m.user_id === userId)?.id ?? '';
  const [form, setForm] = useState<ExpenseFormState>(() =>
    expense
      ? formStateFromExpense(expense, group)
      : { ...initialFormState(group, myMemberId, isoDate()), ...carry },
  );
  const [error, setError] = useState<string | null>(null);
  const [pickingGroup, setPickingGroup] = useState(false);
  const savedReceiptPath = expense?.expense_receipts?.path ?? null;
  const [receipt, setReceipt] = useState<ReceiptState>(savedReceiptPath ? { path: savedReceiptPath } : (carry?.receipt ?? null));
  const [savingReceipt, setSavingReceipt] = useState(false);
  const qc = useQueryClient();

  async function chooseReceipt(source: 'camera' | 'library') {
    setError(null);
    try {
      const uri = await pickReceipt(source);
      if (uri) setReceipt({ uri });
    } catch (e) {
      setError(e instanceof Error && e.message === 'CAMERA_DENIED' ? t.expense.cameraDenied : friendlyError(e));
    }
  }

  /** Sube el ticket nuevo o quita el anterior. Si falla, el gasto ya quedó guardado: solo se avisa. */
  async function syncReceipt(expenseId: string) {
    const changedToNew = receipt && 'uri' in receipt;
    const removed = !receipt && savedReceiptPath;
    if (!changedToNew && !removed) return;
    try {
      const path = changedToNew ? await uploadReceipt(group.id, receipt.uri) : null;
      const old = await setExpenseReceipt(expenseId, path);
      if (old && old !== path) await removeStoredImage(old);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['expense'] }),
        qc.invalidateQueries({ queryKey: ['expenses'] }),
      ]);
    } catch {
      Alert.alert(t.expense.receiptFailedTitle, t.expense.receiptFailed);
    }
  }
  const isPersonal = group.kind === 'personal';

  const set = <K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => setError(null), [form]);

  // Una categoría propia no puede quedar en un gasto de grupo (los demás no la verían).
  const categories = useCategories();
  useEffect(() => {
    if (isPersonal || !form.categoryId || !categories.data) return;
    const c = categories.data.find((x) => x.id === form.categoryId);
    if (c?.owner_id) setForm((f) => ({ ...f, categoryId: null }));
  }, [isPersonal, form.categoryId, categories.data]);

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
      const id = await save.mutateAsync(result.payload);
      setSavingReceipt(true);
      await syncReceipt(id);
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSavingReceipt(false);
    }
  }

  const preview = splitPreview(form, group, amount);
  const isEdit = !!expense;
  const groupBg = groupColorValue(groupColorKey(group), theme);
  const groupLabel = (g: Group) => (g.kind === 'personal' ? `👤 ${t.common.personal}` : g.name);
  const firstEmpty = members.find((m) => !form.values[m.id]?.trim());
  const toggleParticipant = (id: string) =>
    set('participants', form.participants.includes(id) ? form.participants.filter((p) => p !== id) : [...form.participants, id]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: groupBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          {/* Encabezado: cerrar + grupo (tocando se elige otro). */}
          <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t.common.cancel} onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={26} color={theme.onGroup} />
            </Pressable>
            {isEdit ? (
              <Text style={{ color: theme.onGroup, fontFamily: fonts.displayBold, fontSize: 16 }}>{t.expense.edit}</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.expense.group}
                onPress={() => setPickingGroup((v) => !v)}
                style={styles.groupPill}
              >
                <Text style={{ color: theme.onGroup, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                  {groupLabel(group)}
                </Text>
                <Ionicons name={pickingGroup ? 'chevron-up' : 'chevron-down'} size={16} color={theme.onGroup} />
              </Pressable>
            )}
            <View style={{ width: 26 }} />
          </Row>

          {pickingGroup ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.sm, padding: space.lg, paddingBottom: 0 }}>
              {groups.map((g) => {
                const on = g.id === group.id;
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      setPickingGroup(false);
                      if (!on)
                        onChangeGroup(g.id, {
                          amountText: form.amountText,
                          description: form.description,
                          categoryId: form.categoryId,
                          spentAt: form.spentAt,
                          receipt,
                        });
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: radius.pill,
                      backgroundColor: groupColorValue(groupColorKey(g), theme),
                      borderWidth: 2,
                      borderColor: on ? theme.onGroup : 'rgba(255,255,255,0.8)',
                    }}
                  >
                    <Text style={{ color: theme.onGroup, fontWeight: '700' }}>{groupLabel(g)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* 1. Monto: lo primero y lo más grande. */}
          <View style={{ alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.lg }}>
            <Row style={{ gap: 6, maxWidth: '100%' }}>
              <Text style={{ color: theme.onGroup, opacity: 0.55, fontFamily: fonts.display, fontSize: Math.round(amountFontSize(form.amountText) * 0.58) }}>
                $
              </Text>
              <TextInput
                accessibilityLabel={t.expense.amount}
                value={form.amountText}
                onChangeText={(v) => set('amountText', formatAmountTyping(form.amountText, v, group.currency))}
                placeholder="0"
                placeholderTextColor="rgba(22,19,31,0.35)"
                keyboardType="decimal-pad"
                autoFocus={!expense}
                style={[
                  { color: theme.onGroup, fontFamily: fonts.display, fontSize: amountFontSize(form.amountText), minWidth: 80, flexShrink: 1, textAlign: 'center', padding: 0 },
                  noOutline,
                ]}
              />
            </Row>
            <Text style={{ color: theme.onGroup, opacity: 0.6, fontSize: 12, fontWeight: '700' }}>{group.currency}</Text>
            {/* 2. Descripción */}
            <TextInput
              accessibilityLabel={t.expense.description}
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder={t.expense.descriptionPlaceholder}
              placeholderTextColor="rgba(22,19,31,0.45)"
              returnKeyType="done"
              style={[{ color: theme.onGroup, fontSize: 18, fontWeight: '600', textAlign: 'center', alignSelf: 'stretch', paddingVertical: space.sm }, noOutline]}
            />
          </View>

          {/* 3. Categoría (en grupos, solo las del sistema: las propias no las verían los demás) */}
          <View style={{ gap: space.sm, paddingBottom: space.lg }}>
            <CategoryPicker value={form.categoryId} onChange={(id) => set('categoryId', id)} systemOnly={!isPersonal} variant="tiles" />
          </View>

          {/* Panel inferior: quién, cómo y cuándo. */}
          <View style={[styles.panel, { backgroundColor: theme.bg }]}>
            {!isPersonal ? (
              <>
                <Label>{t.expense.paidBy}</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.md }}>
                  {members.map((m) => (
                    <PersonToggle
                      key={m.id}
                      member={m}
                      name={nameOf(m.id)}
                      selected={form.payerMemberId === m.id}
                      onPress={() => set('payerMemberId', m.id)}
                    />
                  ))}
                </ScrollView>

                <Label>{t.expense.split}</Label>
                <Segmented
                  options={SPLIT_TYPES.map((k) => ({ key: k, label: t.expense.splitTypes[k] }))}
                  value={form.splitType}
                  onChange={(k) => setForm((f) => ({ ...f, splitType: k, values: {} }))}
                />

                {form.splitType === 'equal' ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.md }}>
                    {members.map((m) => {
                      const on = form.participants.includes(m.id);
                      const share = preview.perMember[m.id];
                      return (
                        <PersonToggle
                          key={m.id}
                          member={m}
                          name={nameOf(m.id)}
                          selected={on}
                          dimmed={!on}
                          caption={on && amount > 0 && share !== undefined ? formatMoney(share, group.currency) : on ? '' : '—'}
                          onPress={() => toggleParticipant(m.id)}
                        />
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={{ gap: space.sm }}>
                    {members.map((m) => {
                      const share = preview.perMember[m.id];
                      return (
                        <Row key={m.id} style={{ gap: space.md }}>
                          <MemberAvatar member={m} size={36} />
                          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                            {nameOf(m.id)}
                          </Text>
                          <Input
                            style={{ width: 92, textAlign: 'right', paddingVertical: 8 }}
                            keyboardType="decimal-pad"
                            accessibilityLabel={nameOf(m.id)}
                            placeholder={form.splitType === 'percent' ? '0 %' : form.splitType === 'shares' ? '1' : '0'}
                            value={form.values[m.id] ?? ''}
                            onChangeText={(v) =>
                              set('values', {
                                ...form.values,
                                [m.id]: form.splitType === 'exact' ? formatAmountTyping(form.values[m.id] ?? '', v, group.currency) : v,
                              })
                            }
                          />
                          {form.splitType !== 'exact' ? (
                            <Text style={{ color: theme.muted, fontSize: 13, width: 84, textAlign: 'right', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                              {share !== undefined ? formatMoney(share, group.currency) : ''}
                            </Text>
                          ) : null}
                        </Row>
                      );
                    })}
                    {preview.assignedRatio !== null && amount > 0 ? (
                      <View style={{ height: 8, borderRadius: 5, backgroundColor: theme.chip, overflow: 'hidden' }}>
                        <View
                          style={{
                            height: '100%',
                            width: `${Math.min(100, Math.round(preview.assignedRatio * 100))}%`,
                            backgroundColor: preview.remaining === 0 ? theme.positive : theme.accent,
                            borderRadius: 5,
                          }}
                        />
                      </View>
                    ) : null}
                    {pending ? (
                      <Text style={{ color: preview.remaining !== null && preview.remaining < 0 ? theme.negative : theme.accent, fontWeight: '700' }}>
                        {pending}
                      </Text>
                    ) : null}
                    {pending && preview.remaining !== null && preview.remaining > 0 && firstEmpty && amount > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => set('values', fillRemaining(form, group, amount, firstEmpty.id))}
                        style={[styles.fill, { borderColor: theme.border }]}
                      >
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{t.expense.fillRest(nameOf(firstEmpty.id))}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </>
            ) : (
              <Text style={{ color: theme.muted, fontSize: 13, backgroundColor: theme.card, borderRadius: radius.md, padding: space.md }}>
                {t.expense.personalHint}
              </Text>
            )}

            {/* Fecha: hoy por defecto */}
            <Label>{t.expense.when}</Label>
            <DateField value={form.spentAt} onChange={(v) => set('spentAt', v)} />

            {/* Ticket: foto opcional, con la cámara o de la galería. */}
            <Label>{t.expense.receipt}</Label>
            {receipt ? (
              <Row style={{ gap: space.md }}>
                <ReceiptThumb source={receipt} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: theme.text, fontWeight: '700' }}>{t.expense.receiptAttached}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{t.expense.receiptTapToOpen}</Text>
                </View>
                <Chip label={t.expense.change} onPress={() => chooseReceipt(Platform.OS === 'web' ? 'library' : 'camera')} />
                <Chip label={t.expense.removeReceipt} onPress={() => setReceipt(null)} />
              </Row>
            ) : (
              <ChipRow>
                {Platform.OS !== 'web' ? <Chip label={t.expense.takePhoto} onPress={() => chooseReceipt('camera')} /> : null}
                <Chip label={t.expense.fromGallery} onPress={() => chooseReceipt('library')} />
              </ChipRow>
            )}

            {error ? <Text style={{ color: theme.negative }}>{error}</Text> : null}
            <View style={{ marginTop: 'auto', paddingTop: space.sm }}>
              <Button title={t.common.save} onPress={submit} loading={save.isPending || savingReceipt} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/** Persona elegible tocando su cara (quién pagó, entre quiénes se divide). */
function PersonToggle({
  member,
  name,
  selected,
  dimmed,
  caption,
  onPress,
}: {
  member: Member;
  name: string;
  selected: boolean;
  dimmed?: boolean;
  caption?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{ alignItems: 'center', gap: 4, width: 58, opacity: dimmed ? 0.4 : 1 }}
    >
      <View style={{ borderRadius: 30, borderWidth: 3, borderColor: selected ? theme.text : 'transparent', padding: 1 }}>
        <MemberAvatar member={member} size={42} />
      </View>
      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
        {name}
      </Text>
      {caption !== undefined ? (
        <Text style={{ color: theme.muted, fontSize: 11, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** El monto se achica a medida que crece, para que entre siempre en el ancho de la pantalla. */
function amountFontSize(text: string): number {
  if (text.length <= 7) return 52;
  if (text.length <= 10) return 40;
  return 30;
}

/** En web, sin el recuadro de foco del navegador (los campos ya son el centro de la pantalla). */
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as object;

const styles = StyleSheet.create({
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  panel: {
    flexGrow: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: space.lg,
    paddingBottom: space.xl,
    gap: space.md,
  },
  fill: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 13, paddingVertical: 10, alignItems: 'center' },
});
