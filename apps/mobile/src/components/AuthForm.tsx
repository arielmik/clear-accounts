import { useState } from 'react';
import { Text, View } from 'react-native';
import { t } from '../i18n';
import { supabase } from '../lib/supabase';
import { space, useTheme } from './theme';
import { Body, Button, Input, PasswordInput } from './ui';

type Mode = 'signIn' | 'signUp' | 'forgot' | 'reset';

export function AuthForm() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  function go(next: Mode) {
    setMode(next);
    setMessage(null);
    if (next === 'reset') {
      setCode('');
      setPassword('');
    }
  }

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

  /** Paso 1: Supabase manda un email con un código de recuperación. */
  async function sendCode() {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) return setMessage({ kind: 'error', text: error.message });
    go('reset');
    setMessage({ kind: 'info', text: t.auth.codeSent(email.trim()) });
  }

  /** Paso 2: el código abre una sesión de recuperación y con ella se fija la contraseña nueva. */
  async function resetPassword() {
    setLoading(true);
    setMessage(null);
    const verified = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (verified.error) {
      setLoading(false);
      return setMessage({ kind: 'error', text: verified.error.message });
    }
    // Al verificar ya hay sesión, así que la app pasa sola a la pantalla principal.
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setMessage({ kind: 'error', text: error.message });
  }

  const emailInput = (
    <Input
      placeholder={t.auth.email}
      value={email}
      onChangeText={setEmail}
      autoCapitalize="none"
      autoComplete="email"
      keyboardType="email-address"
    />
  );
  const feedback = message ? (
    <Text style={{ color: message.kind === 'error' ? theme.negative : theme.muted }}>{message.text}</Text>
  ) : null;

  if (mode === 'forgot') {
    return (
      <View style={{ gap: space.md }}>
        <Body style={{ fontWeight: '700', fontSize: 18 }}>{t.auth.forgotTitle}</Body>
        <Body style={{ color: theme.muted }}>{t.auth.forgotHint}</Body>
        {emailInput}
        {feedback}
        <Button title={t.auth.sendCode} onPress={sendCode} loading={loading} disabled={!email.trim()} />
        <Button title={t.auth.backToSignIn} variant="secondary" onPress={() => go('signIn')} />
      </View>
    );
  }

  if (mode === 'reset') {
    return (
      <View style={{ gap: space.md }}>
        <Body style={{ fontWeight: '700', fontSize: 18 }}>{t.auth.forgotTitle}</Body>
        <Input
          placeholder={t.auth.code}
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={10}
        />
        <PasswordInput
          placeholder={t.auth.newPassword}
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {feedback}
        <Button
          title={t.auth.resetPassword}
          onPress={resetPassword}
          loading={loading}
          disabled={code.length < 6 || password.length < 6}
        />
        <Button title={t.auth.resendCode} variant="secondary" onPress={sendCode} disabled={loading} />
        <Button title={t.auth.backToSignIn} variant="secondary" onPress={() => go('signIn')} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {mode === 'signUp' ? <Input placeholder={t.auth.name} value={name} onChangeText={setName} autoComplete="name" /> : null}
      {emailInput}
      <PasswordInput
        placeholder={t.auth.password}
        value={password}
        onChangeText={setPassword}
        autoComplete={mode === 'signUp' ? 'new-password' : 'password'}
      />
      {feedback}
      <Button
        title={mode === 'signIn' ? t.auth.signIn : t.auth.signUp}
        onPress={submit}
        loading={loading}
        disabled={!email || password.length < 6 || (mode === 'signUp' && !name.trim())}
      />
      {mode === 'signIn' ? (
        <Text
          accessibilityRole="link"
          onPress={() => go('forgot')}
          style={{ color: theme.primary, fontWeight: '600', textAlign: 'center', paddingVertical: space.xs }}
        >
          {t.auth.forgot}
        </Text>
      ) : null}
      <Button
        title={mode === 'signIn' ? t.auth.toSignUp : t.auth.toSignIn}
        variant="secondary"
        onPress={() => go(mode === 'signIn' ? 'signUp' : 'signIn')}
      />
    </View>
  );
}
