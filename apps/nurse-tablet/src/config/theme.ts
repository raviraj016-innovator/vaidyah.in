// ---------------------------------------------------------------------------
// Vaidyah Nurse Tablet -- Design Tokens
// Healthcare-themed, WCAG AA compliant, optimised for tablet use in clinical
// settings with large touch targets and clear visual hierarchy.
// ---------------------------------------------------------------------------

export const COLORS = {
  // Primary palette -- trustworthy medical blue
  primary: {
    50: '#E3F2FD',
    100: '#BBDEFB',
    200: '#90CAF9',
    300: '#64B5F6',
    400: '#42A5F5',
    500: '#0066CC', // main
    600: '#0058B3',
    700: '#004A99',
    800: '#003D80',
    900: '#002F66',
  },

  // Emergency red -- immediate attention
  emergency: {
    50: '#FFEBEE',
    100: '#FFCDD2',
    200: '#EF9A9A',
    300: '#E57373',
    400: '#EF5350',
    500: '#D32F2F', // main
    600: '#C62828',
    700: '#B71C1C',
    800: '#951717',
    900: '#7A1212',
  },

  // Success / safe green
  success: {
    50: '#E8F5E9',
    100: '#C8E6C9',
    200: '#A5D6A7',
    300: '#81C784',
    400: '#66BB6A',
    500: '#2E7D32', // main
    600: '#256D29',
    700: '#1B5E20',
    800: '#144D19',
    900: '#0E3D12',
  },

  // Warning / caution amber
  warning: {
    50: '#FFF8E1',
    100: '#FFECB3',
    200: '#FFE082',
    300: '#FFD54F',
    400: '#FFCA28',
    500: '#F9A825', // main
    600: '#F57F17',
    700: '#E65100',
    800: '#BF4300',
    900: '#993500',
  },

  // Neutral grays
  neutral: {
    0: '#FFFFFF',
    50: '#F8F9FA',
    100: '#F1F3F5',
    200: '#E9ECEF',
    300: '#DEE2E6',
    400: '#CED4DA',
    500: '#ADB5BD',
    600: '#6C757D',
    700: '#495057',
    800: '#343A40',
    900: '#212529',
  },

  // Semantic aliases
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#212529',
  textSecondary: '#495057',
  textDisabled: '#ADB5BD',
  textOnPrimary: '#FFFFFF',
  textOnEmergency: '#FFFFFF',
  border: '#DEE2E6',
  borderFocus: '#0066CC',
  divider: '#E9ECEF',
  overlay: 'rgba(0, 0, 0, 0.5)',

  // Triage-specific
  triageGreen: '#2E7D32',
  triageYellow: '#F9A825',
  triageRed: '#D32F2F',

  // Emotion indicators
  emotionDistress: '#D32F2F',
  emotionPain: '#E65100',
  emotionAnxiety: '#F9A825',
  emotionCalm: '#2E7D32',

  // Offline indicator
  offline: '#6C757D',
  syncing: '#F9A825',
  synced: '#2E7D32',
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
export const TYPOGRAPHY = {
  // Font families
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
    mono: 'Courier',
  },

  // Font weights
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
  },

  // Size scale (optimised for tablet readability in clinical settings)
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    md: 18,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 32,
    '4xl': 40,
    '5xl': 48,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Pre-composed text styles
  styles: {
    h1: {
      fontSize: 32,
      fontWeight: '700' as const,
      lineHeight: 40,
      color: '#212529',
    },
    h2: {
      fontSize: 28,
      fontWeight: '700' as const,
      lineHeight: 36,
      color: '#212529',
    },
    h3: {
      fontSize: 24,
      fontWeight: '600' as const,
      lineHeight: 32,
      color: '#212529',
    },
    h4: {
      fontSize: 20,
      fontWeight: '600' as const,
      lineHeight: 28,
      color: '#212529',
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 24,
      color: '#212529',
    },
    bodyLarge: {
      fontSize: 18,
      fontWeight: '400' as const,
      lineHeight: 28,
      color: '#212529',
    },
    caption: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
      color: '#495057',
    },
    label: {
      fontSize: 14,
      fontWeight: '600' as const,
      lineHeight: 20,
      color: '#495057',
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    button: {
      fontSize: 16,
      fontWeight: '600' as const,
      lineHeight: 24,
    },
    buttonLarge: {
      fontSize: 18,
      fontWeight: '600' as const,
      lineHeight: 28,
    },
    mono: {
      fontSize: 14,
      fontFamily: 'Courier',
      lineHeight: 20,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Spacing (8-point grid)
// ---------------------------------------------------------------------------
export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 56,
  '6xl': 64,
  '7xl': 80,
  '8xl': 96,
} as const;

// ---------------------------------------------------------------------------
// Border radii
// ---------------------------------------------------------------------------
export const BORDER_RADIUS = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Shadows (elevation)
// ---------------------------------------------------------------------------
export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
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
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
} as const;

// ---------------------------------------------------------------------------
// Touch targets (minimum 48 dp per WCAG / Material guidelines)
// ---------------------------------------------------------------------------
export const TOUCH_TARGET = {
  minimum: 48,
  comfortable: 56,
  large: 64,
} as const;

// ---------------------------------------------------------------------------
// Animation durations
// ---------------------------------------------------------------------------
export const ANIMATION = {
  fast: 150,
  normal: 300,
  slow: 500,
} as const;

// ---------------------------------------------------------------------------
// Z-index layers
// ---------------------------------------------------------------------------
export const Z_INDEX = {
  base: 0,
  card: 1,
  dropdown: 10,
  sticky: 20,
  banner: 30,
  modal: 40,
  toast: 50,
  emergency: 100,
} as const;

// ---------------------------------------------------------------------------
// Aggregate theme object
// ---------------------------------------------------------------------------
const theme = {
  colors: COLORS,
  typography: TYPOGRAPHY,
  spacing: SPACING,
  borderRadius: BORDER_RADIUS,
  shadows: SHADOWS,
  touchTarget: TOUCH_TARGET,
  animation: ANIMATION,
  zIndex: Z_INDEX,
} as const;

export type Theme = typeof theme;
export default theme;
