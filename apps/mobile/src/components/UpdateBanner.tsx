import * as Updates from 'expo-updates';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { useBackgroundUpdateCheck } from '../lib/updates';
import { useTheme } from './theme';

/** Aviso fijo arriba cuando ya se descargó una versión nueva: tocarlo la aplica. */
export function UpdateBanner() {
  useBackgroundUpdateCheck();
  const { isUpdatePending } = Updates.useUpdates();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (!isUpdatePending) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void Updates.reloadAsync()}
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        backgroundColor: theme.primary,
        borderRadius: 12,
        padding: 12,
        zIndex: 10,
        elevation: 6,
      }}
    >
      <Text style={{ color: theme.primaryText, fontWeight: '700', textAlign: 'center' }}>{t.updates.available}</Text>
    </Pressable>
  );
}
