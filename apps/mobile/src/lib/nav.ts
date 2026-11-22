import { useSegments } from 'expo-router';

/**
 * Prefijo de la pestaña actual ('' para Inicio, '/groups', '/ledger'), para
 * abrir detalles dentro de la misma pestaña y que el menú inferior siga visible.
 */
export function useTabBase(): '' | '/groups' | '/ledger' {
  const segments = useSegments() as string[];
  if (segments.includes('groups')) return '/groups';
  if (segments.includes('ledger')) return '/ledger';
  return '';
}
