import { useColorScheme } from 'react-native';

/**
 * Tema "Banda": fondo limpio, tinta casi negra para lo importante, coral como acento
 * (botón de carga) y un color propio por grupo.
 */
const light = {
  bg: '#FFFFFF',
  card: '#F3F1F7',
  text: '#16131F',
  muted: '#6F6A7D',
  border: '#E6E2EE',
  /** Acción principal (botones, chips elegidos): tinta. */
  primary: '#16131F',
  primaryText: '#FFFFFF',
  /** Acento de marca: el + para cargar gastos. */
  accent: '#FF6A4D',
  accentText: '#FFFFFF',
  positive: '#139463',
  negative: '#C9361C',
  positiveSoft: '#DDF6EC',
  negativeSoft: '#FFE4DE',
  chip: '#F3F1F7',
  /** Tarjeta destacada (consumo del mes). */
  hero: '#16131F',
  heroText: '#FFFFFF',
  heroMuted: '#BDB8C9',
  /** Texto sobre los colores de grupo (siempre oscuro: los colores son claros). */
  onGroup: '#16131F',
};

const dark: typeof light = {
  bg: '#121016',
  card: '#1F1B26',
  text: '#F1EEF6',
  muted: '#A49FB0',
  border: '#2E2A36',
  primary: '#F1EEF6',
  primaryText: '#16131F',
  accent: '#FF7A5C',
  accentText: '#16131F',
  positive: '#3DD69B',
  negative: '#FF8A73',
  positiveSoft: '#16362A',
  negativeSoft: '#3D211B',
  chip: '#2A2532',
  hero: '#2A2532',
  heroText: '#FFFFFF',
  heroMuted: '#B4AEC1',
  onGroup: '#16131F',
};

export type Theme = typeof light & { dark: boolean };

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? { ...dark, dark: true } : { ...light, dark: false };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 };

/** Tipografía de títulos y montos grandes (el cuerpo usa la del sistema). */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  displayMedium: 'BricolageGrotesque_600SemiBold',
};
