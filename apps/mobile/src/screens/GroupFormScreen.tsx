import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { GroupColorPicker } from '../components/GroupColorPicker';
import { Text } from 'react-native';
import { useTheme } from '../components/theme';
import { Button, Chip, ChipRow, Input, Label, Screen } from '../components/ui';
import { t } from '../i18n';
import { createGroup, setGroupColor } from '../lib/api';
import { freeGroupColor, groupColorKey, type GroupColor } from '../lib/group-colors';
import { useGroups, useInvalidateGroups } from '../lib/queries';

const KINDS = ['home', 'trip', 'couple', 'other'] as const;
const CURRENCIES = ['ARS', 'USD', 'EUR', 'BRL', 'UYU', 'CLP'];

export default function NewGroup() {
  const theme = useTheme();
  const invalidate = useInvalidateGroups();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]>('home');
  const [currency, setCurrency] = useState('ARS');
  const groups = useGroups();
  // Se propone un color que el usuario todavía no use, para distinguir el grupo de un vistazo.
  const suggested = useMemo(
    () => freeGroupColor((groups.data ?? []).filter((g) => g.kind !== 'personal').map(groupColorKey)),
    [groups.data],
  );
  const [picked, setPicked] = useState<GroupColor | null>(null);
  const color = picked ?? suggested;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const id = await createGroup(name.trim(), kind, currency);
      await setGroupColor(id, color);
      await invalidate();
      router.back();
      router.push(`/groups/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <Screen edges={[]}>
      <Label>{t.groups.name}</Label>
      <Input value={name} onChangeText={setName} placeholder="Casa, Viaje a Bariloche…" autoFocus />
      <Label>{t.groups.kind}</Label>
      <ChipRow>
        {KINDS.map((k) => (
          <Chip key={k} label={t.groups.kinds[k]} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </ChipRow>
      <Label>{t.groups.currency}</Label>
      <ChipRow>
        {CURRENCIES.map((c) => (
          <Chip key={c} label={c} selected={currency === c} onPress={() => setCurrency(c)} />
        ))}
      </ChipRow>
      <Label>{t.groups.color}</Label>
      <GroupColorPicker value={color} onChange={setPicked} />
      {error ? <Text style={{ color: theme.negative }}>{error}</Text> : null}
      <Button title={t.common.save} onPress={save} loading={saving} disabled={!name.trim()} />
    </Screen>
  );
}
