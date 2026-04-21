// ---- Material Design 3 Theme ----------------------------------------------
// Central design tokens. All spacing, radius, typography and status colors
// must be read from here rather than hardcoded at call sites.

import { MD3DarkTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

export const Spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const Radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const Layout = {
  // Distance-from-bottom (in pixels) below which the chat is considered
  // "at bottom" — drives the scroll-to-latest chevron's visibility.
  atBottomThresholdPx: 32,
} as const;

export const Typography = {
  titleLarge: { fontSize: 22, fontWeight: '700' as const, letterSpacing: 0 },
  titleMedium: { fontSize: 18, fontWeight: '700' as const, letterSpacing: 0 },
  bodyLarge: { fontSize: 16, fontWeight: '400' as const, letterSpacing: 0.15 },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const, letterSpacing: 0.2 },
  bodySmall: { fontSize: 12, fontWeight: '400' as const, letterSpacing: 0.25 },
  labelMedium: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.5 },
} as const;

const StatusPalette = {
  idle: '#7B9EFF',
  listening: '#FF5252',
  thinking: '#FFB74D',
  speaking: '#69F0AE',
} as const;

const ExtendedColors = {
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',
  successContainer: '#004D3A',
  onSuccessContainer: '#7BF3C9',
  status: StatusPalette,
} as const;

export interface AppThemeType extends MD3Theme {
  spacing: typeof Spacing;
  radius: typeof Radius;
  typography: typeof Typography;
  layout: typeof Layout;
  colors: MD3Theme['colors'] & typeof ExtendedColors;
}

export const AppTheme: AppThemeType = {
  ...MD3DarkTheme,
  spacing: Spacing,
  radius: Radius,
  typography: Typography,
  layout: Layout,
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
    ...ExtendedColors,
  },
};
