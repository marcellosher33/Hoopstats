export const colors = {
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  secondary: '#1A1A2E',
  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceLight: '#252540',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  
  // Stat colors
  points: '#FF6B35',
  rebounds: '#3B82F6',
  assists: '#10B981',
  steals: '#F59E0B',
  blocks: '#8B5CF6',
  turnovers: '#EF4444',
  
  // Court colors
  court: '#CD853F',
  courtDark: '#A0682B',
  courtLines: '#FFFFFF',
  shotMade: '#10B981',
  shotMissed: '#EF4444',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: 'bold' as const,
  },
  h2: {
    fontSize: 24,
    fontWeight: 'bold' as const,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 16,
    fontWeight: 'normal' as const,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: 'normal' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: 'normal' as const,
  },
};
