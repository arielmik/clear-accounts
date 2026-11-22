import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useImageUrl } from '../lib/images';
import { useTheme } from './theme';

/**
 * Imagen circular. Sin imagen cargada muestra las iniciales o un ícono.
 */
export function Avatar({
  path,
  size = 44,
  name,
  icon,
  iconColor,
}: {
  path: string | null | undefined;
  size?: number;
  name?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}) {
  const theme = useTheme();
  const url = useImageUrl(path);
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (path && url.data) {
    return (
      <Image
        source={{ uri: url.data, cacheKey: path }}
        style={[circle, { backgroundColor: theme.chip }]}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View style={[circle, { backgroundColor: theme.chip, alignItems: 'center', justifyContent: 'center' }]}>
      {icon || !initials ? (
        <Ionicons name={icon ?? 'person'} size={size * 0.55} color={iconColor ?? theme.muted} />
      ) : (
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
      )}
    </View>
  );
}
