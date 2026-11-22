import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/**
 * Actualizaciones por el aire (EAS Update). Al abrir la app, Expo ya busca una versión
 * nueva; además la buscamos cada vez que la app vuelve a primer plano, para que no haya
 * que cerrarla y abrirla dos veces. En Expo Go y en desarrollo esto está desactivado.
 */
export function useBackgroundUpdateCheck() {
  useEffect(() => {
    if (!Updates.isEnabled) return;
    const check = async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Sin conexión u otro problema: se reintenta la próxima vez.
      }
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, []);
}

/** Texto corto para identificar qué está corriendo: canal y actualización. */
export function buildInfo(): string {
  if (!Updates.isEnabled) return 'desarrollo';
  const parts = [Updates.channel ?? 'sin canal'];
  parts.push(Updates.isEmbeddedLaunch ? 'instalada' : `act. ${Updates.updateId?.slice(0, 8) ?? '?'}`);
  return parts.join(' · ');
}
