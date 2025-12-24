import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing } from '../utils/theme';

interface StatButtonProps {
  label: string;
  value?: number;
  onPress: () => void;
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  showBasketball?: boolean;
}

const BasketballBackground = ({ size }: { size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
    {/* Basketball orange background */}
    <Circle cx="50" cy="50" r="48" fill="#FF6B35" />
    {/* Darker orange rim */}
    <Circle cx="50" cy="50" r="48" fill="none" stroke="#E55A2B" strokeWidth="3" />
    {/* Basketball lines */}
    <G stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round" opacity="0.4">
      {/* Horizontal line */}
      <Path d="M 2 50 L 98 50" />
      {/* Vertical line */}
      <Path d="M 50 2 L 50 98" />
      {/* Left curve */}
      <Path d="M 30 5 Q 20 50 30 95" fill="none" />
      {/* Right curve */}
      <Path d="M 70 5 Q 80 50 70 95" fill="none" />
    </G>
  </Svg>
);

export const StatButton: React.FC<StatButtonProps> = ({
  label,
  value,
  onPress,
  color = colors.primary,
  icon,
  size = 'medium',
  disabled = false,
  showBasketball = true,
}) => {
  const sizeMap = {
    small: 60,
    medium: 75,
    large: 90,
  };

  const buttonSize = sizeMap[size];
  const fontSize = size === 'small' ? 14 : size === 'medium' ? 18 : 22;
  const iconSize = size === 'small' ? 16 : size === 'medium' ? 20 : 24;

  // Determine what to show inside the basketball
  const getInnerContent = () => {
    // Scoring buttons with specific displays
    if (label === '+2' || label === '+3' || label === 'FT' || label === '+1') {
      return (
        <View style={styles.innerContent}>
          <Text style={[styles.scoreText, { fontSize: fontSize + 4 }]}>{label}</Text>
        </View>
      );
    }
    
    // Miss buttons
    if (label.includes('Miss')) {
      return (
        <View style={styles.innerContent}>
          <Ionicons name="close" size={iconSize + 4} color="white" />
          <Text style={[styles.labelText, { fontSize: fontSize - 6 }]}>{label.replace('Miss ', '')}</Text>
        </View>
      );
    }

    // Stat buttons with icons
    const statIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
      'REB': 'basketball',
      'AST': 'hand-left',
      'STL': 'flash',
      'BLK': 'shield',
      'TO': 'swap-horizontal',
      'FOUL': 'warning',
    };

    if (statIcons[label]) {
      return (
        <View style={styles.innerContent}>
          <Ionicons name={statIcons[label]} size={iconSize} color="white" />
          <Text style={[styles.labelText, { fontSize: fontSize - 6 }]}>{label}</Text>
        </View>
      );
    }

    // Default: just show the label
    return (
      <View style={styles.innerContent}>
        {icon && <Ionicons name={icon} size={iconSize} color="white" />}
        <Text style={[styles.labelText, { fontSize: fontSize - 4 }]}>{label}</Text>
      </View>
    );
  };

  if (showBasketball) {
    return (
      <TouchableOpacity
        style={[
          styles.basketballButton,
          { width: buttonSize, height: buttonSize },
          disabled && styles.disabled,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <BasketballBackground size={buttonSize} />
        <View style={styles.contentOverlay}>
          {getInnerContent()}
        </View>
        {value !== undefined && value > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{value}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // Non-basketball style (for miss buttons, etc.)
  return (
    <TouchableOpacity
      style={[
        styles.regularButton,
        { width: buttonSize, height: buttonSize, backgroundColor: color },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {getInnerContent()}
      {value !== undefined && value > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{value}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  basketballButton: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.xs,
    position: 'relative',
    overflow: 'hidden',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  regularButton: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.xs,
    position: 'relative',
  },
  disabled: {
    opacity: 0.5,
  },
  contentOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    color: 'white',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  labelText: {
    color: 'white',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
});
