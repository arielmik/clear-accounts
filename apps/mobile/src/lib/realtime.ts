import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';

/** Tablas publicadas para tiempo real (ver migración images_realtime). */
export const REALTIME_TABLES = ['expenses', 'settlements', 'group_members', 'groups', 'profiles'] as const;

/**
 * Escucha los cambios de la base y refresca la pantalla sola.
 * Realtime aplica RLS: solo llegan eventos de filas que el usuario puede ver.
 * Varios eventos seguidos (ej. guardar un gasto) se agrupan en un único refresco.
 */
export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Las URLs firmadas de imágenes no cambian con los datos: no hace falta pedirlas de nuevo.
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'image-url' });
      }, 300);
    };

    let channel = supabase.channel('db-changes');
    for (const table of REALTIME_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh);
    }
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

/** En mobile, al volver a la app se refrescan los datos (en web lo hace el navegador). */
export function setupFocusRefetch() {
  if (Platform.OS === 'web') return;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}
