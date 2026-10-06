import { useColorScheme } from 'react-native';

export type Theme = {
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  good: string;
  warn: string;
  bad: string;
};

const light: Theme = {
  dark: false,
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EDF4',
  border: '#D5DCE7',
  text: '#0F1B2D',
  muted: '#5B6B82',
  accent: '#1E5EFF',
  onAccent: '#FFFFFF',
  good: '#178A4C',
  warn: '#B76E00',
  bad: '#C62828',
};

const dark: Theme = {
  dark: true,
  background: '#0B1220',
  surface: '#141D2E',
  surfaceAlt: '#1D2940',
  border: '#2A3953',
  text: '#EEF2F8',
  muted: '#9AA8BE',
  accent: '#5B8CFF',
  onAccent: '#0B1220',
  good: '#4CC38A',
  warn: '#F2B544',
  bad: '#FF6B6B',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
