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
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

export default function NewTeamScreen() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { createTeam } = useGameStore();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateTeam = async () => {
    if (user?.subscription_tier !== 'team') {
      Alert.alert('Team Tier Required', 'Creating teams requires the Team subscription ($199.99/year)');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter team name');
      return;
    }

    setLoading(true);
    try {
      await createTeam({ name: name.trim() }, token!);
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  if (user?.subscription_tier !== 'team') {
    return (
      <View style={styles.container}>
        <View style={styles.locked}>
          <Ionicons name="lock-closed" size={64} color={colors.warning} />
          <Text style={styles.lockedTitle}>Team Tier Required</Text>
          <Text style={styles.lockedText}>
            Creating and managing teams requires the Team subscription at $199.99/year.
          </Text>
          <Button
            title="Upgrade to Team"
            onPress={() => router.push('/(tabs)/profile')}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="people" size={48} color={colors.primary} />
        </View>

        <Input
          label="Team Name"
          value={name}
          onChangeText={setName}
          placeholder="Enter team name"
        />

        <Button
          title="Create Team"
          onPress={handleCreateTeam}
          loading={loading}
          disabled={!name.trim()}
          size="large"
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
  iconContainer: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  locked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  lockedTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: spacing.lg,
  },
  lockedText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
