import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#14171F',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#0E9F6E',
  primaryText: '#FFFFFF',
  positive: '#0E9F6E',
  negative: '#E02424',
  chip: '#EEF0F3',
};

const dark: typeof light = {
  bg: '#0F1115',
  card: '#1A1D24',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  border: '#2A2F3A',
  primary: '#31C48D',
  primaryText: '#0F1115',
  positive: '#31C48D',
  negative: '#F98080',
  chip: '#262B35',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
