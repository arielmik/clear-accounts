import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useTheme } from '../components/theme';
import { Button, Card, Input, Label, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { updateMyEmail, updateMyName } from '../lib/api';
import { useAuth, useUserId } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { useInvalidateGroups, useProfile, useRefreshAll } from '../lib/queries';
import { supabase } from '../lib/supabase';

type Status = { kind: 'ok' | 'error'; text: string } | null;

export default function ProfileScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const { session } = useAuth();
  const profile = useProfile(userId);
  const invalidateGroups = useInvalidateGroups();
  const refreshAll = useRefreshAll();

  const [name, setName] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [nameStatus, setNameStatus] = useState<Status>(null);
  const [emailStatus, setEmailStatus] = useState<Status>(null);

  useEffect(() => {
    if (profile.data) setName(profile.data.display_name);
  }, [profile.data]);

  async function saveName() {
    setSavingName(true);
    setNameStatus(null);
    try {
      await updateMyName(name.trim());
      await Promise.all([profile.refetch(), invalidateGroups()]);
      setNameStatus({ kind: 'ok', text: t.profile.nameSaved });
    } catch (e) {
      setNameStatus({ kind: 'error', text: friendlyError(e) });
    } finally {
      setSavingName(false);
    }
  }

  async function saveEmail() {
    setSavingEmail(true);
    setEmailStatus(null);
    try {
      await updateMyEmail(email.trim());
      setEmailStatus({ kind: 'ok', text: t.profile.emailSent });
    } catch (e) {
      setEmailStatus({ kind: 'error', text: friendlyError(e) });
    } finally {
      setSavingEmail(false);
    }
  }

  const statusText = (s: Status) =>
    s ? <Text style={{ color: s.kind === 'error' ? theme.negative : theme.positive }}>{s.text}</Text> : null;

  return (
    <Screen onRefresh={refreshAll}>
      <Title>{t.tabs.profile}</Title>
      <Card>
        <Label>{t.profile.name}</Label>
        <Input value={name} onChangeText={setName} autoComplete="name" />
        {statusText(nameStatus)}
        <Button
          title={t.profile.saveName}
          onPress={saveName}
          loading={savingName}
          disabled={!name.trim() || name.trim() === profile.data?.display_name}
        />
      </Card>
      <Card>
        <Label>{t.profile.email}</Label>
        <Input
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        {statusText(emailStatus)}
        <Button
          title={t.profile.changeEmail}
          variant="secondary"
          onPress={saveEmail}
          loading={savingEmail}
          disabled={!email.trim() || email.trim() === session?.user.email}
        />
      </Card>
      <Button title={t.auth.signOut} variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
