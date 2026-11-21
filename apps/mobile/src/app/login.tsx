import { View } from 'react-native';
import { AuthForm } from '../components/AuthForm';
import { space, useTheme } from '../components/theme';
import { Body, Screen, Title } from '../components/ui';
import { t } from '../i18n';

export default function Login() {
  const theme = useTheme();
  return (
    <Screen>
      <View style={{ marginTop: 64, marginBottom: space.lg, gap: space.sm }}>
        <Title>{t.appName}</Title>
        <Body style={{ color: theme.muted, fontSize: 18 }}>{t.auth.subtitle}</Body>
      </View>
      <AuthForm />
    </Screen>
  );
}
