import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { space, useTheme } from '../components/theme';
import { Button, Card, Chip, ChipRow, ErrorState, Label, Loading, Row, Screen } from '../components/ui';
import { t } from '../i18n';
import { useUserId } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { formatMoney, minorToInput, parseAmount } from '../lib/money';
import { useBalances, useCreateSettlement, useGroup } from '../lib/queries';
import { balanceAfterPayment } from '../lib/settle';

/**
 * Registrar un pago entre dos miembros. El monto viene sugerido pero es editable:
 * si se paga menos sigue habiendo deuda; si se paga de más, el que pagó pasa a tener saldo a favor.
 */
export default function SettleFormScreen() {
  const params = useLocalSearchParams<{ groupId: string; from?: string; to?: string; amount?: string }>();
  const theme = useTheme();
  const userId = useUserId();
  const group = useGroup(params.groupId);
  const balances = useBalances(params.groupId);
  const settle = useCreateSettlement();

  const currency = group.data?.currency ?? 'ARS';
  const suggested = params.amount ? Number(params.amount) : 0;
  const [from, setFrom] = useState(params.from ?? '');
  const [to, setTo] = useState(params.to ?? '');
  const [amountText, setAmountText] = useState(suggested ? minorToInput(suggested, currency) : '');
  const [error, setError] = useState<string | null>(null);

  const members = (group.data?.group_members ?? []).filter((m) => m.left_at === null);
  const nameOf = (id: string) => {
    const m = members.find((x) => x.id === id);
    return m?.user_id === userId ? t.common.me : (m?.display_name ?? '?');
  };
  const amount = parseAmount(amountText, currency);

  const preview = useMemo(() => {
    if (!from || !to || !amount) return null;
    const map: Record<string, number> = {};
    for (const b of balances.data ?? []) if (b.currency === currency) map[b.member_id] = b.balance_minor;
    return balanceAfterPayment(map, from, to, amount);
  }, [balances.data, from, to, amount, currency]);

  const describe = (minor: number) =>
    minor === 0
      ? t.settle.settled
      : minor < 0
        ? t.settle.owes(formatMoney(-minor, currency))
        : t.settle.owed(formatMoney(minor, currency));

  if (group.isLoading) return <Loading />;
  if (group.error || !group.data)
    return (
      <Screen edges={[]}>
        <ErrorState error={group.error} />
      </Screen>
    );

  async function save() {
    if (!amount || amount <= 0) return setError(t.expense.invalidAmount);
    setError(null);
    try {
      await settle.mutateAsync({ groupId: params.groupId, fromMemberId: from, toMemberId: to, amountMinor: amount, currency, userId });
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <Screen edges={[]}>
      <Label>{t.settle.from}</Label>
      <ChipRow>
        {members.map((m) => (
          <Chip
            key={m.id}
            label={nameOf(m.id)}
            selected={from === m.id}
            onPress={() => {
              setFrom(m.id);
              if (to === m.id) setTo('');
            }}
          />
        ))}
      </ChipRow>
      <Label>{t.settle.to}</Label>
      <ChipRow>
        {members
          .filter((m) => m.id !== from)
          .map((m) => (
            <Chip key={m.id} label={nameOf(m.id)} selected={to === m.id} onPress={() => setTo(m.id)} />
          ))}
      </ChipRow>

      <View style={{ alignItems: 'center', marginTop: space.md }}>
        <Text style={{ color: theme.muted, fontSize: 14, fontWeight: '600' }}>{currency}</Text>
        <TextInput
          accessibilityLabel={t.settle.amount}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={theme.muted}
          style={{ color: theme.text, fontSize: 44, fontWeight: '700', alignSelf: 'stretch', textAlign: 'center' }}
        />
        {suggested ? (
          <Text style={{ color: theme.muted }}>{t.settle.suggested(formatMoney(suggested, currency))}</Text>
        ) : null}
      </View>

      {preview ? (
        <Card>
          <Label>{t.settle.after}</Label>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>{nameOf(from)}</Text>
            <Text style={{ color: preview.from < 0 ? theme.negative : preview.from > 0 ? theme.positive : theme.muted }}>
              {describe(preview.from)}
            </Text>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: theme.text, fontWeight: '600' }}>{nameOf(to)}</Text>
            <Text style={{ color: preview.to < 0 ? theme.negative : preview.to > 0 ? theme.positive : theme.muted }}>
              {describe(preview.to)}
            </Text>
          </Row>
        </Card>
      ) : null}

      {error ? <Text style={{ color: theme.negative }}>{error}</Text> : null}
      <Button title={t.settle.save} onPress={save} loading={settle.isPending} disabled={!from || !to || !amount} />
    </Screen>
  );
}
