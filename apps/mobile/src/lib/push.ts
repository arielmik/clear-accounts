import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Notificaciones push ("Ana agregó un gasto en Casa").
// El token del dispositivo se guarda en Supabase (register_push_token) y la Edge Function
// notify-expense lo usa cuando otro miembro carga un gasto. En web no hay push.

const supported = Platform.OS !== 'web';
const PREF_KEY = 'push-enabled';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function readPref(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREF_KEY)) !== 'false';
  } catch {
    return true;
  }
}

async function writePref(enabled: boolean) {
  try {
    await AsyncStorage.setItem(PREF_KEY, String(enabled));
  } catch {
    // Sin storage: la preferencia no se recuerda, pero el registro igual se hizo.
  }
}

/** Token de Expo del dispositivo, pidiendo permiso si hace falta. null si no hay permiso. */
async function deviceToken(askPermission: boolean): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('expenses', {
      name: 'Gastos del grupo',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && askPermission) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** Activa las push en este dispositivo. Devuelve false si el usuario no dio permiso. */
export async function enablePush(): Promise<boolean> {
  if (!supported) return false;
  const token = await deviceToken(true);
  if (!token) return false;
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) throw new Error(error.message);
  await writePref(true);
  return true;
}

/** Desactiva las push en este dispositivo (para la cuenta actual). */
export async function disablePush(): Promise<void> {
  if (!supported) return;
  await writePref(false);
  const token = await deviceToken(false).catch(() => null);
  if (token) await supabase.rpc('unregister_push_token', { p_token: token });
}

/** Cierra sesión sin dejar el dispositivo recibiendo avisos de esa cuenta. */
export async function signOut(): Promise<void> {
  if (supported) {
    const token = await deviceToken(false).catch(() => null);
    if (token) await supabase.rpc('unregister_push_token', { p_token: token });
  }
  await supabase.auth.signOut();
}

export function usePushEnabled(): [boolean | null, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!supported) return;
    Promise.all([readPref(), Notifications.getPermissionsAsync()]).then(([pref, perm]) =>
      setEnabled(pref && perm.status === 'granted'),
    );
  }, []);
  return [supported ? enabled : null, setEnabled];
}

/**
 * Con sesión: registra el dispositivo (la primera vez pide permiso) y abre el gasto
 * al tocar una notificación.
 */
export function usePushSetup(signedIn: boolean) {
  const response = supported ? Notifications.useLastNotificationResponse() : null;

  useEffect(() => {
    if (!supported || !signedIn) return;
    readPref().then((pref) => (pref ? enablePush().catch(() => {}) : undefined));
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !response) return;
    const expenseId = response.notification.request.content.data?.expenseId;
    if (typeof expenseId === 'string') {
      router.push(`/groups/expense/${expenseId}`);
      Notifications.clearLastNotificationResponseAsync?.();
    }
  }, [signedIn, response]);
}
