import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { LedgerList } from '../components/LedgerList';
import { fonts, radius, space, useTheme, type Theme } from '../components/theme';
import { Button, Card, Empty, ErrorState, Label, Loading, Row, Screen } from '../components/ui';
import { locale, t } from '../i18n';
import { useUserId } from '../lib/auth';
import { monthRange } from '../lib/dates';
import { myDebts, totalsByCurrency } from '../lib/debts';
import { groupColorKey, groupColorValue } from '../lib/group-colors';
import { monthSummary, myGroupBalances, type MonthSummary } from '../lib/home';
import { formatMoney } from '../lib/money';
import { useBalances, useCategories, useGroups, useLedger, useProfile, useRefreshAll } from '../lib/queries';
import type { Category, Group } from '../lib/types';

/** Colores de los tramos de la barra de categorías (el último, gris, es "Otros"). */
const SLICE_COLORS = ['#FF6A4D', '#FFC83D', '#6F86FF', '#2BC48A'];
const OTHER_COLOR = '#8B8597';

const monthName = (d: Date) => d.toLocaleDateString(locale, { month: 'long' });

export default function HomeScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const refreshAll = useRefreshAll();
  const profile = useProfile(userId);

  const now = new Date();
  const { from, to } = monthRange(now.getFullYear(), now.getMonth());
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = monthRange(prevDate.getFullYear(), prevDate.getMonth());
  const ledger = useLedger(from, to);
  const previous = useLedger(prev.from, prev.to);
  const categories = useCategories();
  const groups = useGroups();
  const balances = useBalances();

  const byId = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);
  const summaries = useMemo(
    () => monthSummary(ledger.data ?? [], previous.data ?? [], now.getDate(), byId),
    [ledger.data, previous.data, byId],
  );

  const debts = useMemo(
    () => myDebts(groups.data ?? [], balances.data ?? [], userId),
    [groups.data, balances.data, userId],
  );
  const owed = totalsByCurrency(debts.owed);
  const owe = totalsByCurrency(debts.owe);
  const shared = (groups.data ?? []).filter((g) => g.kind !== 'personal');
  const debtCurrencies = [...new Set([...Object.keys(owed), ...Object.keys(owe)])];
  const pillCurrencies = debtCurrencies.length ? debtCurrencies : shared.length ? [shared[0]!.currency] : [];

  const groupBalance = useMemo(
    () => myGroupBalances(groups.data ?? [], balances.data ?? [], userId),
    [groups.data, balances.data, userId],
  );
  const pending = shared.filter((g) => (groupBalance.get(g.id) ?? 0) !== 0);

  const firstName = (profile.data?.display_name ?? '').trim().split(/\s+/)[0] ?? '';
  const defaultCurrency = profile.data?.default_currency ?? 'ARS';

  return (
    <Screen onRefresh={refreshAll}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: theme.text, fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.5 }}>
          {t.home.hello(firstName)}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t.tabs.profile} onPress={() => router.push('/profile')}>
          <Avatar path={profile.data?.avatar_path} size={40} name={profile.data?.display_name} />
        </Pressable>
      </Row>

      <MonthCard
        loading={ledger.isLoading}
        summaries={summaries}
        defaultCurrency={defaultCurrency}
        now={now}
        prevMonth={monthName(prevDate)}
        byId={byId}
      />

      {pillCurrencies.map((currency) => (
        <Row key={currency} style={{ gap: space.sm }}>
          <DebtPill
            label={t.home.owedToYou}
            minor={owed[currency] ?? 0}
            currency={currency}
            bg={theme.positiveSoft}
            color={theme.positive}
            onPress={() => router.push('/debts/owed')}
          />
          <DebtPill
            label={t.home.youOwe}
            minor={owe[currency] ?? 0}
            currency={currency}
            bg={theme.negativeSoft}
            color={owe[currency] ? theme.negative : theme.text}
            onPress={() => router.push('/debts/owe')}
          />
        </Row>
      ))}

      {groups.data && shared.length === 0 ? (
        <Card>
          <Text style={{ color: theme.text, fontSize: 15 }}>{t.home.noGroups}</Text>
          <Button title={t.groups.new} variant="secondary" onPress={() => router.push('/group-form')} />
        </Card>
      ) : shared.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: theme.text, fontFamily: fonts.displayBold, fontSize: 17 }}>{t.home.pending}</Text>
            <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600' }}>
              {t.home.pendingCount(pending.length, shared.length)}
            </Text>
          </Row>
          {pending.length === 0 ? (
            <Text style={{ color: theme.muted }}>{t.home.allSettled}</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {pending.map((g) => (
                <GroupTile key={g.id} group={g} balance={groupBalance.get(g.id) ?? 0} theme={theme} />
              ))}
            </View>
          )}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Label>{t.home.recent}</Label>
        {ledger.error ? (
          <ErrorState error={ledger.error} onRetry={() => ledger.refetch()} />
        ) : ledger.data && ledger.data.length === 0 ? (
          <Empty>{t.home.empty}</Empty>
        ) : (
          <LedgerList rows={(ledger.data ?? []).slice(0, 5)} />
        )}
      </View>
    </Screen>
  );
}

function MonthCard({
  loading,
  summaries,
  defaultCurrency,
  now,
  prevMonth,
  byId,
}: {
  loading: boolean;
  summaries: MonthSummary[];
  defaultCurrency: string;
  now: Date;
  prevMonth: string;
  byId: ReadonlyMap<string, Category>;
}) {
  const theme = useTheme();
  const main = summaries[0];
  const extra = summaries.slice(1);
  const sliceName = (key: string) =>
    key === 'other' ? t.home.otherCategories : key === 'none' ? t.ledger.uncategorized : (byId.get(key)?.name ?? '?');
  const change = main?.changePct;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t.home.seeLedger}
      onPress={() => router.push('/ledger')}
      style={({ pressed }) => ({
        backgroundColor: theme.hero,
        borderRadius: radius.xl,
        padding: space.lg,
        gap: space.sm + 2,
        opacity: pressed ? 0.92 : 1,
      })}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: theme.heroMuted, fontSize: 13 }}>{t.home.spentIn(monthName(now))}</Text>
        <Text style={{ color: theme.heroMuted, fontSize: 13 }}>{t.home.asOfDay(now.getDate())}</Text>
      </Row>

      {loading ? (
        <Loading />
      ) : (
        <>
          <Text
            style={{ color: theme.heroText, fontFamily: fonts.display, fontSize: 42, letterSpacing: -1, fontVariant: ['tabular-nums'] }}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {formatMoney(main?.totalMinor ?? 0, main?.currency ?? defaultCurrency)}
          </Text>
          {extra.map((s) => (
            <Text key={s.currency} style={{ color: theme.heroText, fontFamily: fonts.displayBold, fontSize: 18 }}>
              + {formatMoney(s.totalMinor, s.currency)}
            </Text>
          ))}

          {change !== null && change !== undefined ? (
            <View
              style={{
                alignSelf: 'flex-start',
                borderRadius: radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 3,
                backgroundColor: change <= 0 ? 'rgba(43,196,138,0.2)' : 'rgba(255,106,77,0.22)',
              }}
            >
              <Text style={{ color: change <= 0 ? '#5FE0AE' : '#FF9C86', fontSize: 12, fontWeight: '700' }}>
                {change < 0 ? t.home.less(-change, prevMonth) : change > 0 ? t.home.more(change, prevMonth) : t.home.same(prevMonth)}
              </Text>
            </View>
          ) : null}

          {main && main.slices.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
                {main.slices.map((s, i) => (
                  <View
                    key={s.key}
                    style={{ flex: s.amountMinor, backgroundColor: s.key === 'other' ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length] }}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 4 }}>
                {main.slices.map((s, i) => (
                  <Row key={s.key} style={{ gap: 5 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 3,
                        backgroundColor: s.key === 'other' ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length],
                      }}
                    />
                    <Text style={{ color: theme.heroMuted, fontSize: 12 }}>
                      {sliceName(s.key)} {s.pct}%
                    </Text>
                  </Row>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}

      <Row style={{ gap: 2 }}>
        <Text style={{ color: theme.heroText, fontSize: 13, fontWeight: '700' }}>{t.home.seeLedger}</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.heroText} />
      </Row>
    </Pressable>
  );
}

function DebtPill({
  label,
  minor,
  currency,
  bg,
  color,
  onPress,
}: {
  label: string;
  minor: number;
  currency: string;
  bg: string;
  color: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t.home.seeDetail}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: bg,
        borderRadius: radius.lg,
        paddingVertical: space.md,
        paddingHorizontal: space.md + 2,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Ionicons name="chevron-forward" size={14} color={theme.muted} />
      </Row>
      {/* El color va también en el fondo: con "Texto de alto contraste" de Android el
          sistema pinta el texto en blanco/negro y el monto pierde el verde/rojo. */}
      <Text
        style={{ color, fontFamily: fonts.display, fontSize: 21, fontVariant: ['tabular-nums'] }}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {formatMoney(minor, currency)}
      </Text>
    </Pressable>
  );
}

function GroupTile({ group, balance, theme }: { group: Group; balance: number; theme: Theme }) {
  const bg = groupColorValue(groupColorKey(group), theme);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/groups/${group.id}`)}
      style={({ pressed }) => ({
        width: '48.5%',
        flexGrow: 1,
        backgroundColor: bg,
        borderRadius: radius.lg,
        padding: space.md,
        gap: 2,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Row style={{ gap: 6 }}>
        {group.image_path ? <Avatar path={group.image_path} size={22} name={group.name} /> : null}
        <Text style={{ color: theme.onGroup, fontFamily: fonts.displayBold, fontSize: 16, flexShrink: 1 }} numberOfLines={1}>
          {group.name}
        </Text>
      </Row>
      <Text style={{ color: theme.onGroup, opacity: 0.7, fontSize: 12, fontWeight: '600' }}>
        {balance > 0 ? t.home.owedToYou : t.home.youOwe}
      </Text>
      <Text style={{ color: theme.onGroup, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] }}>
        {formatMoney(Math.abs(balance), group.currency)}
      </Text>
    </Pressable>
  );
}
