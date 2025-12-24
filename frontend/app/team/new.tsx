import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const TEAM_COLORS = [
  '#FF6B35', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16', '#6366F1',
];

export default function NewTeamScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [name, setName] = useState('');
  const [primaryColor, setPrimaryColor] = useState(TEAM_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a team name');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          color_primary: primaryColor,
          color_secondary: '#FFFFFF',
        }),
      });

      if (response.ok) {
        const team = await response.json();
        router.replace(`/team/${team.id}`);
      } else {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to create team');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.previewCard}>
          <View style={[styles.previewIcon, { backgroundColor: primaryColor }]}>
            <Text style={styles.previewIconText}>
              {name ? name.charAt(0).toUpperCase() : 'T'}
            </Text>
          </View>
          <Text style={styles.previewName}>{name || 'Team Name'}</Text>
        </View>

        <Input
          label="Team Name"
          value={name}
          onChangeText={setName}
          placeholder="Enter team name"
        />

        <Text style={styles.label}>Team Color</Text>
        <View style={styles.colorGrid}>
          {TEAM_COLORS.map((color) => (
            <View
              key={color}
              style={[
                styles.colorOption,
                primaryColor === color && styles.colorSelected,
              ]}
            >
              <View
                style={[styles.colorCircle, { backgroundColor: color }]}
                onTouchEnd={() => setPrimaryColor(color)}
              >
                {primaryColor === color && (
                  <Ionicons name="checkmark" size={20} color="white" />
                )}
              </View>
            </View>
          ))}
        </View>

        <Button
          title="Create Team"
          onPress={handleCreate}
          loading={loading}
          disabled={!name.trim()}
          style={{ marginTop: spacing.xl }}
          icon={<Ionicons name="people" size={20} color={colors.text} />}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  previewIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  previewIconText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
  },
  previewName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    padding: 4,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: colors.text,
  },
  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
