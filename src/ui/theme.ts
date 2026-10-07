import { useColorScheme } from 'react-native';

export { BADGE_COLOR, KIND_COLOR, KIND_ICON } from './colors';

export type Theme = {
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
  onAccent: string;
  good: string;
  warn: string;
  bad: string;
  shadow: string;
};

const light: Theme = {
  dark: false,
  background: '#F3F5FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F7',
  border: '#DCE2EC',
  text: '#0E1726',
  muted: '#5D6B82',
  primary: '#3352FF',
  onPrimary: '#FFFFFF',
  primarySoft: '#E7EBFF',
  accent: '#FFB020',
  onAccent: '#2A1B00',
  good: '#15803D',
  warn: '#B45309',
  bad: '#DC2626',
  shadow: '#0E1726',
};

const dark: Theme = {
  dark: true,
  background: '#0A0F1C',
  surface: '#131B2D',
  surfaceAlt: '#1B2540',
  border: '#26324F',
  text: '#EEF2FA',
  muted: '#9AA7BF',
  primary: '#7088FF',
  onPrimary: '#0A0F1C',
  primarySoft: '#1E2A55',
  accent: '#FFB547',
  onAccent: '#2A1B00',
  good: '#4ADE80',
  warn: '#FBBF24',
  bad: '#F87171',
  shadow: '#000000',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
