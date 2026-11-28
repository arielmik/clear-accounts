import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { SettingsRow, SettingsSection } from '../components/SettingsRow';
import { fonts, space, useTheme } from '../components/theme';
import { Button, Input, Loading, PasswordInput, Screen, Title } from '../components/ui';
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
/** Qué ajuste está abierto para editar (uno a la vez). */
type Open = 'name' | 'email' | 'password' | null;

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
  const [open, setOpen] = useState<Open>(null);
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

  const toggle = (key: Exclude<Open, null>) => setOpen((o) => (o === key ? null : key));

  return (
    <Screen onRefresh={refreshAll}>
      <Title>{t.tabs.profile}</Title>

      {/* Foto, nombre y email: tocando la foto se cambia. */}
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.profile.changePhoto} onPress={changePhoto} disabled={photoBusy}>
          <Avatar path={avatarPath} size={104} icon="person" />
          <View style={[styles.cameraBadge, { backgroundColor: theme.accent, borderColor: theme.bg }]}>
            <Ionicons name="camera" size={16} color={theme.accentText} />
          </View>
        </Pressable>
        <Text style={{ color: theme.text, fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.3, textAlign: 'center' }}>
          {profile.data?.display_name ?? ''}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 14 }}>{session?.user.email}</Text>
        {avatarPath ? (
          <Pressable accessibilityRole="button" onPress={removePhoto} disabled={photoBusy} hitSlop={8}>
            <Text style={{ color: theme.muted, fontSize: 13, textDecorationLine: 'underline' }}>{t.profile.removePhoto}</Text>
          </Pressable>
        ) : null}
        {photoBusy ? <Loading /> : null}
        {photoError ? <Text style={{ color: theme.negative, textAlign: 'center' }}>{photoError}</Text> : null}
      </View>

      <SettingsSection title={t.profile.account}>
        <SettingsRow
          first
          icon="person-outline"
          title={t.profile.name}
          value={profile.data?.display_name}
          expanded={open === 'name'}
          onPress={() => toggle('name')}
        >
          <Input value={name} onChangeText={setName} autoComplete="name" autoFocus />
          {statusText(nameStatus)}
          <Button
            title={t.profile.saveName}
            onPress={saveName}
            loading={savingName}
            disabled={!name.trim() || name.trim() === profile.data?.display_name}
          />
        </SettingsRow>
        <SettingsRow
          icon="mail-outline"
          title={t.profile.email}
          value={session?.user.email}
          expanded={open === 'email'}
          onPress={() => toggle('email')}
        >
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            autoFocus
          />
          {statusText(emailStatus)}
          <Button
            title={t.profile.changeEmail}
            onPress={saveEmail}
            loading={savingEmail}
            disabled={!email.trim() || email.trim() === session?.user.email}
          />
        </SettingsRow>
        <SettingsRow
          icon="lock-closed-outline"
          title={t.profile.password}
          value="••••••••"
          expanded={open === 'password'}
          onPress={() => toggle('password')}
        >
          <PasswordInput
            placeholder={t.profile.newPassword}
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            autoFocus
          />
          {statusText(passwordStatus)}
          <Button title={t.profile.changePassword} onPress={savePassword} loading={savingPassword} disabled={password.length < 6} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t.profile.preferences}>
        <SettingsRow
          first
          icon="pricetags-outline"
          title={t.profile.myCategories}
          value={t.profile.myCategoriesHint}
          onPress={() => router.push('/profile/categories')}
        />
        <SettingsRow
          icon="card-outline"
          title={t.profile.myPaymentMethods}
          value={t.profile.myPaymentMethodsHint}
          onPress={() => router.push('/profile/payment-methods')}
        />
        {pushEnabled !== null ? (
          <SettingsRow
            icon="notifications-outline"
            title={t.profile.notifications}
            value={t.profile.notifyExpenses}
            right={
              <Switch
                value={pushEnabled}
                onValueChange={togglePush}
                trackColor={{ true: theme.positive, false: theme.border }}
                thumbColor="#FFFFFF"
              />
            }
          />
        ) : null}
      </SettingsSection>
      {statusText(pushStatus)}

      <SettingsSection>
        <SettingsRow first danger icon="log-out-outline" title={t.auth.signOut} onPress={() => signOut()} />
      </SettingsSection>

      <Text style={{ color: theme.muted, textAlign: 'center', fontSize: 12 }}>
        {t.appName} v{Constants.expoConfig?.version ?? '?'} · {buildInfo()}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
