import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AuthForm } from '../../components/AuthForm';
import { Body, Loading, Screen } from '../../components/ui';
import { t } from '../../i18n';
import { acceptInvite } from '../../lib/api';
import { useAuth } from '../../lib/auth';

/** Deep link clearaccounts://join/<token>. Si no hay sesión, primero pide ingresar. */
export default function Join() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !token) return;
    acceptInvite(token)
      .then(async (groupId) => {
        await qc.invalidateQueries({ queryKey: ['groups'] });
        router.replace(`/groups/${groupId}`);
      })
      .catch(() => setError(t.join.invalid));
  }, [session, token, qc]);

  if (!session) {
    return (
      <Screen edges={[]}>
        <Body>{t.join.loginFirst}</Body>
        <AuthForm />
      </Screen>
    );
  }
  return (
    <Screen edges={[]}>
      {error ? <Body>{error}</Body> : <><Body>{t.join.joining}</Body><Loading /></>}
    </Screen>
  );
}
