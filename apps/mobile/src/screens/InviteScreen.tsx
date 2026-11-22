import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { QrCode } from '../components/QrCode';
import { space, useTheme } from '../components/theme';
import { Body, Button, Card, ErrorState, Loading, Screen } from '../components/ui';
import { t } from '../i18n';
import { createInvite } from '../lib/api';
import { useUserId } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { inviteLink } from '../lib/invite';
import { useGroup } from '../lib/queries';

/** Invitar a un grupo: QR para escanear en persona y link https para compartir. */
export default function InviteScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const theme = useTheme();
  const userId = useUserId();
  const group = useGroup(groupId);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setError(null);
    setLink(null);
    try {
      setLink(inviteLink(await createInvite(groupId, userId)));
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [groupId, userId]);

  useEffect(() => {
    void generate();
  }, [generate]);

  const name = group.data?.name ?? '';

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: t.invite.title }} />
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar path={group.data?.image_path} size={64} name={name} />
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>{name}</Text>
      </View>

      {error ? <ErrorState error={error} onRetry={generate} /> : null}
      {!link && !error ? <Loading /> : null}

      {link ? (
        <>
          <Card style={{ alignItems: 'center', gap: space.md }}>
            <Body style={{ textAlign: 'center' }}>{t.invite.scan}</Body>
            <QrCode value={link} size={248} />
            <Text selectable style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>
              {link}
            </Text>
          </Card>
          <Button
            title={t.invite.share}
            onPress={() => void Share.share({ message: t.groups.inviteMessage(name, link) })}
          />
          <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center' }}>{t.invite.expires}</Text>
        </>
      ) : null}
    </Screen>
  );
}
