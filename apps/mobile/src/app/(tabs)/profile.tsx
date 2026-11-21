import { Text } from 'react-native';
import { useTheme } from '../../components/theme';
import { Button, Card, Screen, Title } from '../../components/ui';
import { t } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

export default function Profile() {
  const theme = useTheme();
  const { session } = useAuth();
  const user = session?.user;
  return (
    <Screen>
      <Title>{t.tabs.profile}</Title>
      <Card>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '600' }}>
          {(user?.user_metadata?.display_name as string | undefined) ?? ''}
        </Text>
        <Text style={{ color: theme.muted }}>{user?.email}</Text>
      </Card>
      <Button title={t.auth.signOut} variant="secondary" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
