import { Alert, Platform } from 'react-native';

/** Confirmación que funciona en iOS, Android y web. */
export function confirm(message: string, okLabel = 'OK', cancelLabel = 'Cancelar'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(message) ?? false);
  return new Promise((resolve) =>
    Alert.alert('', message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, onPress: () => resolve(true) },
    ]),
  );
}
