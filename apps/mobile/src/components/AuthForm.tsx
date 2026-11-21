import { useState } from 'react';
import { Text, View } from 'react-native';
import { t } from '../i18n';
import { supabase } from '../lib/supabase';
import { space, useTheme } from './theme';
import { Button, Input } from './ui';

export function AuthForm() {
  const theme = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit() {
    setLoading(true);
    setMessage(null);
    const { data, error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { data: { display_name: name.trim() } },
          });
    setLoading(false);
    if (error) setMessage({ kind: 'error', text: error.message });
    else if (mode === 'signUp' && !data.session) setMessage({ kind: 'info', text: t.auth.checkEmail });
  }

  return (
    <View style={{ gap: space.md }}>
      {mode === 'signUp' ? <Input placeholder={t.auth.name} value={name} onChangeText={setName} autoComplete="name" /> : null}
      <Input
        placeholder={t.auth.email}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <Input placeholder={t.auth.password} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      {message ? (
        <Text style={{ color: message.kind === 'error' ? theme.negative : theme.muted }}>{message.text}</Text>
      ) : null}
      <Button
        title={mode === 'signIn' ? t.auth.signIn : t.auth.signUp}
        onPress={submit}
        loading={loading}
        disabled={!email || password.length < 6 || (mode === 'signUp' && !name.trim())}
      />
      <Button
        title={mode === 'signIn' ? t.auth.toSignUp : t.auth.toSignIn}
        variant="secondary"
        onPress={() => {
          setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          setMessage(null);
        }}
      />
    </View>
  );
}
