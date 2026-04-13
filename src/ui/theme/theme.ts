// ─── Material Design 3 Theme ──────────────────────────────────────────────────

import { MD3DarkTheme } from 'react-native-paper';

export const AppTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#7B9EFF',
    onPrimary: '#001B76',
    primaryContainer: '#003095',
    onPrimaryContainer: '#DCE1FF',
    secondary: '#BDC2DD',
    onSecondary: '#272D3D',
    background: '#0B0B0F',
    surface: '#121218',
    surfaceVariant: '#1A1A24',
    onBackground: '#E4E1E6',
    onSurface: '#E4E1E6',
    onSurfaceVariant: '#C6C4CE',
    outline: '#908F9A',
    error: '#FFB4AB',
    onError: '#690005',
  },
};

export type AppThemeType = typeof AppTheme;
