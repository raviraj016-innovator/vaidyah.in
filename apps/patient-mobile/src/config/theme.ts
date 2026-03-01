/**
 * Vaidyah Patient-Friendly Theme
 * --------------------------------
 * Designed for accessibility:
 *  - Warm, calming colours that feel trustworthy
 *  - Large text sizes for patients with limited vision
 *  - High contrast ratios (WCAG AA minimum)
 *  - Generous spacing and touch targets (min 48 dp)
 */

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

export const COLORS = {
  // Primary – deep green conveying health & trust
  primary: '#1B5E20',
  primaryLight: '#4C8C4A',
  primaryDark: '#003300',
  primarySurface: '#E8F5E9',

  // Secondary – warm amber for attention/CTA
  secondary: '#F57F17',
  secondaryLight: '#FFB04C',
  secondaryDark: '#BC5100',
  secondarySurface: '#FFF8E1',

  // Accent – teal for informational highlights
  accent: '#00796B',
  accentLight: '#48A999',
  accentDark: '#004C40',
  accentSurface: '#E0F2F1',

  // Semantic
  success: '#2E7D32',
  successLight: '#C8E6C9',
  warning: '#F9A825',
  warningLight: '#FFF9C4',
  error: '#C62828',
  errorLight: '#FFCDD2',
  info: '#0277BD',
  infoLight: '#B3E5FC',

  // Match score colours
  matchHigh: '#2E7D32',
  matchMedium: '#F57F17',
  matchLow: '#C62828',

  // Neutrals
  white: '#FFFFFF',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E0E0E0',
  borderLight: '#F0F0F0',
  disabled: '#BDBDBD',
  placeholder: '#9E9E9E',

  // Text
  textPrimary: '#212121',
  textSecondary: '#616161',
  textTertiary: '#9E9E9E',
  textOnPrimary: '#FFFFFF',
  textOnSecondary: '#FFFFFF',
  textLink: '#0277BD',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.1)',
} as const;

// ---------------------------------------------------------------------------
// Typography – larger sizes for patient readability
// ---------------------------------------------------------------------------

export const FONTS = {
  /** Display – hero sections */
  displayLarge: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  /** Screen titles */
  headlineLarge: {
    fontSize: 28,
    lineHeight: 38,
    fontWeight: '700' as const,
    letterSpacing: 0,
  },
  headlineMedium: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
  headlineSmall: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600' as const,
    letterSpacing: 0.15,
  },
  /** Section headers, card titles */
  titleLarge: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600' as const,
    letterSpacing: 0,
  },
  titleMedium: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600' as const,
    letterSpacing: 0.15,
  },
  titleSmall: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  /** Body – main readable text */
  bodyLarge: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '400' as const,
    letterSpacing: 0.5,
  },
  bodyMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    letterSpacing: 0.25,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    letterSpacing: 0.4,
  },
  /** Labels, buttons */
  labelLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
  },
  labelMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
  labelSmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.5,
  },
  /** Caption / helper text */
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400' as const,
    letterSpacing: 0.4,
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing & sizing
// ---------------------------------------------------------------------------

export const SPACING = {
  /** 4 dp */
  xxs: 4,
  /** 8 dp */
  xs: 8,
  /** 12 dp */
  sm: 12,
  /** 16 dp */
  md: 16,
  /** 20 dp */
  lg: 20,
  /** 24 dp */
  xl: 24,
  /** 32 dp */
  xxl: 32,
  /** 40 dp */
  xxxl: 40,
  /** 48 dp */
  huge: 48,
} as const;

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/** Minimum touch target (WCAG / Material Guidelines) */
export const MIN_TOUCH_TARGET = 48;

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

// ---------------------------------------------------------------------------
// Composed theme object for convenience
// ---------------------------------------------------------------------------

const theme = {
  colors: COLORS,
  fonts: FONTS,
  spacing: SPACING,
  radius: RADIUS,
  shadows: SHADOWS,
  minTouchTarget: MIN_TOUCH_TARGET,
} as const;

export type AppTheme = typeof theme;
export default theme;
