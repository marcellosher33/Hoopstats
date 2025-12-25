import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing } from '../utils/theme';

interface StatButtonProps {
  label: string;
  sublabel?: string;
  value?: number;
  onPress: () => void;
  onLongPress?: () => void;
  variant?: 'scoring' | 'stat' | 'miss' | 'negative';
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
}

const gradients = {
  scoring: ['#FF8C42', '#FF6B35', '#E85D2D'] as const,
  stat: ['#4F9DFF', '#3B82F6', '#2563EB'] as const,
  miss: ['#6B7280', '#4B5563', '#374151'] as const,
  negative: ['#F87171', '#EF4444', '#DC2626'] as const,
};

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  'REB': 'basketball',
  'AST': 'hand-left',
  'STL': 'flash',
  'BLK': 'shield',
  'TO': 'swap-horizontal',
  'FOUL': 'alert-circle',
  '+2': 'add-circle',
  '+3': 'star',
  '+1': 'checkmark-circle',
};

export const StatButton: React.FC<StatButtonProps> = ({
  label,
  sublabel,
  value,
  onPress,
  onLongPress,
  variant = 'scoring',
  icon,
  size = 'medium',
  disabled = false,
}) => {
  const sizeMap = {
    small: { width: 70, height: 70, fontSize: 16, iconSize: 22 },
    medium: { width: 85, height: 85, fontSize: 20, iconSize: 28 },
    large: { width: 100, height: 100, fontSize: 24, iconSize: 32 },
  };

  const { width, height, fontSize, iconSize } = sizeMap[size];
  const displayIcon = icon || iconMap[label];
  const gradientColors = gradients[variant];

  return (
    <TouchableOpacity
      style={[styles.container, { width, height }, disabled && styles.disabled]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={gradientColors as unknown as string[]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { width, height, borderRadius: width / 2 }]}
      >
        {/* Inner glow effect */}
        <View style={[styles.innerGlow, { width: width - 8, height: height - 8, borderRadius: (width - 8) / 2 }]}>
          <View style={styles.content}>
            {displayIcon && (
              <Ionicons name={displayIcon} size={iconSize} color="white" style={styles.icon} />
            )}
            <Text style={[styles.label, { fontSize }]}>{label}</Text>
            {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
          </View>
        </View>
        
        {/* Shine effect */}
        <View style={styles.shine} />
      </LinearGradient>
      
      {/* Badge for count */}
      {value !== undefined && value > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{value}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Special large scoring button for +2, +3, FT
interface ScoringButtonProps {
  points: number;
  label: string;
  value?: number;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}

export const ScoringButton: React.FC<ScoringButtonProps> = ({
  points,
  label,
  value,
  onPress,
  onLongPress,
  disabled = false,
}) => {
  const gradientColors = points === 3 
    ? ['#A855F7', '#9333EA', '#7C3AED'] 
    : points === 2 
    ? ['#FF8C42', '#FF6B35', '#E85D2D']
    : ['#34D399', '#10B981', '#059669'];

  return (
    <TouchableOpacity
      style={[styles.scoringContainer, disabled && styles.disabled]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.scoringGradient}
      >
        <View style={styles.scoringInner}>
          <Text style={styles.scoringPoints}>+{points}</Text>
          <Text style={styles.scoringLabel}>{label}</Text>
        </View>
        <View style={styles.scoringShine} />
      </LinearGradient>
      
      {value !== undefined && value > 0 && (
        <View style={styles.scoringBadge}>
          <Text style={styles.badgeText}>{value}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Miss button - simpler design
interface MissButtonProps {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}

export const MissButton: React.FC<MissButtonProps> = ({
  label,
  onPress,
  onLongPress,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      style={[styles.missButton, disabled && styles.disabled]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons name="close-circle" size={18} color="#9CA3AF" />
      <Text style={styles.missLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: spacing.xs,
    position: 'relative',
  },
  disabled: {
    opacity: 0.5,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    overflow: 'hidden',
  },
  innerGlow: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  label: {
    color: 'white',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    marginTop: 2,
  },
  sublabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '500',
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Scoring button styles
  scoringContainer: {
    margin: spacing.sm,
    position: 'relative',
  },
  scoringGradient: {
    width: 95,
    height: 95,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  scoringInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoringPoints: {
    color: 'white',
    fontSize: 36,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  scoringLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: -2,
  },
  scoringShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  scoringBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#1F2937',
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.background,
  },
  
  // Miss button styles
  missButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    margin: spacing.xs,
    gap: 4,
  },
  missLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
});
