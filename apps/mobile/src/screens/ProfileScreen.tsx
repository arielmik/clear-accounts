import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { space, useTheme } from '../components/theme';
import { Button, Card, Chip, Input, Label, Loading, PasswordInput, Row, Screen, Title } from '../components/ui';
import { t } from '../i18n';
import { setMyAvatar, updateMyEmail, updateMyName } from '../lib/api';
import { removeStoredImage, replaceImage } from '../lib/images';
import { useAuth, useUserId } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { useAvatars, useInvalidateGroups, useProfile, useRefreshAll } from '../lib/queries';
import { disablePush, enablePush, signOut, usePushEnabled } from '../lib/push';
import { supabase } from '../lib/supabase';
import { buildInfo } from '../lib/updates';

type Status = { kind: 'ok' | 'error'; text: string } | null;

export default function ProfileScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const { session } = useAuth();
  const profile = useProfile(userId);
  const avatars = useAvatars();
  const invalidateGroups = useInvalidateGroups();
  const refreshAll = useRefreshAll();

  const [name, setName] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [nameStatus, setNameStatus] = useState<Status>(null);
  const [emailStatus, setEmailStatus] = useState<Status>(null);
  const [password, setPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [pushEnabled, setPushEnabled] = usePushEnabled();
  const [pushStatus, setPushStatus] = useState<Status>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const avatarPath = profile.data?.avatar_path ?? null;

  async function changePhoto() {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const changed = await replaceImage({ kind: 'users', ownerId: userId, currentPath: avatarPath, assign: setMyAvatar });
      if (changed) await Promise.all([profile.refetch(), avatars.refetch()]);
    } catch (e) {
      setPhotoError(friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!avatarPath) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await setMyAvatar(null);
      await removeStoredImage(avatarPath);
      await Promise.all([profile.refetch(), avatars.refetch()]);
    } catch (e) {
      setPhotoError(friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

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

  async function savePassword() {
    setSavingPassword(true);
    setPasswordStatus(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) return setPasswordStatus({ kind: 'error', text: friendlyError(error) });
    setPassword('');
    setPasswordStatus({ kind: 'ok', text: t.profile.passwordSaved });
  }

  async function togglePush(value: boolean) {
    setPushStatus(null);
    setPushEnabled(value);
    try {
      if (!value) return await disablePush();
      const granted = await enablePush();
      if (!granted) {
        setPushEnabled(false);
        setPushStatus({ kind: 'error', text: t.profile.notificationsDenied });
      }
    } catch (e) {
      setPushEnabled(!value);
      setPushStatus({ kind: 'error', text: friendlyError(e) });
    }
  }

  const statusText = (s: Status) =>
    s ? <Text style={{ color: s.kind === 'error' ? theme.negative : theme.positive }}>{s.text}</Text> : null;

  return (
    <Screen onRefresh={refreshAll}>
      <Title>{t.tabs.profile}</Title>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.profile.changePhoto} onPress={changePhoto} disabled={photoBusy}>
          <Avatar path={avatarPath} size={112} icon="person" />
        </Pressable>
        <Row>
          <Chip label={avatarPath ? t.profile.changePhoto : t.profile.addPhoto} onPress={changePhoto} />
          {avatarPath ? <Chip label={t.profile.removePhoto} onPress={removePhoto} /> : null}
        </Row>
        {photoBusy ? <Loading /> : null}
        {photoError ? <Text style={{ color: theme.negative }}>{photoError}</Text> : null}
      </View>
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
      <Card>
        <Label>{t.profile.password}</Label>
        <PasswordInput
          placeholder={t.profile.newPassword}
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {statusText(passwordStatus)}
        <Button
          title={t.profile.changePassword}
          variant="secondary"
          onPress={savePassword}
          loading={savingPassword}
          disabled={password.length < 6}
        />
      </Card>
      {pushEnabled !== null ? (
        <Card>
          <Label>{t.profile.notifications}</Label>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>{t.profile.notifyExpenses}</Text>
            <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{ true: theme.primary, false: theme.border }}
              thumbColor={theme.card}
            />
          </Row>
          {statusText(pushStatus)}
        </Card>
      ) : null}
      <Button title={`🏷️ ${t.profile.myCategories}`} variant="secondary" onPress={() => router.push('/profile/categories')} />
      <Button title={t.auth.signOut} variant="secondary" onPress={() => signOut()} />
      <Text style={{ color: theme.muted, textAlign: 'center', fontSize: 12 }}>
        {t.appName} v{Constants.expoConfig?.version ?? '?'} · {buildInfo()}
      </Text>
    </Screen>
  );
}
