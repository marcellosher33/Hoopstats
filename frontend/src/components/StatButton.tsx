import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
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
}

export const StatButton: React.FC<StatButtonProps> = ({
  label,
  value,
  onPress,
  color = colors.primary,
  icon,
  size = 'medium',
  disabled = false,
}) => {
  const sizeStyles = {
    small: { width: 60, height: 60 },
    medium: { width: 80, height: 80 },
    large: { width: 100, height: 100 },
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        sizeStyles[size],
        { backgroundColor: color },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {icon && (
        <Ionicons name={icon} size={size === 'small' ? 20 : 24} color={colors.text} />
      )}
      <Text style={[styles.label, size === 'small' && styles.labelSmall]}>{label}</Text>
      {value !== undefined && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{value}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.xs,
    position: 'relative',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  labelSmall: {
    fontSize: 10,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
