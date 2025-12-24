import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Button } from '../../src/components/Button';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Team {
  id: string;
  name: string;
  logo?: string;
  color_primary: string;
  color_secondary: string;
  created_at: string;
}

export default function TeamsScreen() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTeams = async () => {
    try {
      const response = await fetch(`${API_URL}/api/teams`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTeams(data);
      }
    } catch (error) {
      console.error('Failed to fetch teams:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchTeams();
    }
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTeams();
  };

  if (user?.subscription_tier !== 'team') {
    return (
      <View style={styles.container}>
        <View style={styles.upgradePrompt}>
          <Ionicons name="people" size={64} color={colors.textSecondary} />
          <Text style={styles.upgradeTitle}>Team Feature</Text>
          <Text style={styles.upgradeText}>
            Upgrade to Team tier to create and manage team rosters.
          </Text>
          <Button
            title="Upgrade to Team"
            onPress={() => router.push('/profile')}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {teams.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Teams Yet</Text>
            <Text style={styles.emptyText}>Create your first team to manage rosters</Text>
          </View>
        ) : (
          teams.map((team) => (
            <TouchableOpacity
              key={team.id}
              style={[styles.teamCard, { borderLeftColor: team.color_primary }]}
              onPress={() => router.push(`/team/${team.id}`)}
            >
              <View style={[styles.teamIcon, { backgroundColor: team.color_primary }]}>
                <Text style={styles.teamIconText}>{team.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.teamInfo}>
                <Text style={styles.teamName}>{team.name}</Text>
                <Text style={styles.teamDate}>
                  Created {new Date(team.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/team/new')}
      >
        <Ionicons name="add" size={28} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  upgradePrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  upgradeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: spacing.md,
  },
  upgradeText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
  },
  teamIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamIconText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  teamName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
