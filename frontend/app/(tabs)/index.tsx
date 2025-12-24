import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { user, token } = useAuthStore();
  const { games, players, fetchGames, fetchPlayers, isLoading } = useGameStore();

  useEffect(() => {
    if (token) {
      fetchGames(token);
      fetchPlayers(token);
    }
  }, [token]);

  const recentGames = games.slice(0, 3);
  const inProgressGame = games.find(g => g.status === 'in_progress');

  const onRefresh = () => {
    if (token) {
      fetchGames(token);
      fetchPlayers(token);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {/* Welcome Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.username}>{user?.username || 'Player'}</Text>
        </View>
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>{user?.subscription_tier?.toUpperCase() || 'FREE'}</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.actionCard, styles.primaryAction]}
          onPress={() => router.push('/game/new')}
        >
          <Ionicons name="add-circle" size={40} color={colors.text} />
          <Text style={styles.actionTitle}>New Game</Text>
          <Text style={styles.actionSubtitle}>Start tracking</Text>
        </TouchableOpacity>

        {inProgressGame && (
          <TouchableOpacity
            style={[styles.actionCard, styles.resumeAction]}
            onPress={() => router.push(`/game/${inProgressGame.id}`)}
          >
            <Ionicons name="play-circle" size={40} color={colors.text} />
            <Text style={styles.actionTitle}>Resume Game</Text>
            <Text style={styles.actionSubtitle}>vs {inProgressGame.opponent_name}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Stats</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="basketball" label="Games" value={games.length} color={colors.points} />
          <StatCard icon="people" label="Players" value={players.length} color={colors.assists} />
          <StatCard
            icon="trophy"
            label="Wins"
            value={games.filter(g => g.status === 'completed' && g.our_score > g.opponent_score).length}
            color={colors.success}
          />
          <StatCard
            icon="stats-chart"
            label="Avg Score"
            value={Math.round(games.reduce((sum, g) => sum + g.our_score, 0) / (games.length || 1))}
            color={colors.rebounds}
          />
        </View>
      </View>

      {/* Recent Games */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Games</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/games')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>

        {recentGames.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="basketball-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No games yet</Text>
            <Text style={styles.emptySubtext}>Start your first game to see stats here</Text>
          </View>
        ) : (
          recentGames.map((game) => (
            <TouchableOpacity
              key={game.id}
              style={styles.gameCard}
              onPress={() => router.push(`/game/summary/${game.id}`)}
            >
              <View style={styles.gameInfo}>
                <Text style={styles.gameOpponent}>vs {game.opponent_name}</Text>
                <Text style={styles.gameDate}>
                  {new Date(game.game_date).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.gameScore}>
                <Text style={[
                  styles.scoreText,
                  game.our_score > game.opponent_score && styles.scoreWin,
                  game.our_score < game.opponent_score && styles.scoreLoss,
                ]}>
                  {game.our_score} - {game.opponent_score}
                </Text>
                <View style={[
                  styles.statusBadge,
                  game.status === 'in_progress' && styles.statusInProgress,
                ]}>
                  <Text style={styles.statusText}>
                    {game.status === 'in_progress' ? 'LIVE' : game.our_score > game.opponent_score ? 'W' : 'L'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Subscription Prompt */}
      {user?.subscription_tier === 'free' && (
        <TouchableOpacity
          style={styles.upgradeCard}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Ionicons name="star" size={24} color={colors.warning} />
          <View style={styles.upgradeInfo}>
            <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
            <Text style={styles.upgradeSubtitle}>Unlock video recording, AI summaries & more</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const StatCard = ({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; color: string }) => (
  <View style={[styles.statCard, { borderLeftColor: color }]}>
    <Ionicons name={icon} size={24} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  username: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  tierBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  tierText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  primaryAction: {
    backgroundColor: colors.primary,
  },
  resumeAction: {
    backgroundColor: colors.success,
  },
  actionTitle: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: spacing.sm,
  },
  actionSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
  },
  seeAll: {
    color: colors.primary,
    fontSize: 14,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderLeftWidth: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: spacing.xs,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyState: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  gameCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  gameInfo: {
    flex: 1,
  },
  gameOpponent: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  gameDate: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  gameScore: {
    alignItems: 'flex-end',
  },
  scoreText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  scoreWin: {
    color: colors.success,
  },
  scoreLoss: {
    color: colors.error,
  },
  statusBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginTop: spacing.xs,
  },
  statusInProgress: {
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  upgradeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning,
  },
  upgradeInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  upgradeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  upgradeSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
