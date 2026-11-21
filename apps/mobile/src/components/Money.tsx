import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatMoney } from '../lib/money';
import { useTheme } from './theme';

/** Monto formateado; con `signed`, verde si es positivo y rojo si es negativo. */
export function Money({
  minor,
  currency,
  signed,
  style,
}: {
  minor: number;
  currency: string;
  signed?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  const color = !signed || minor === 0 ? theme.text : minor > 0 ? theme.positive : theme.negative;
  return <Text style={[{ color, fontVariant: ['tabular-nums'], fontWeight: '600' }, style]}>{formatMoney(Math.abs(minor), currency)}</Text>;
}
