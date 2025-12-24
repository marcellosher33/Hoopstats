import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Game } from '../../src/types';

export default function GamesScreen() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { games, fetchGames, isLoading } = useGameStore();
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed'>('all');

  useEffect(() => {
    if (token) {
      fetchGames(token);
    }
  }, [token]);

  const filteredGames = games.filter(game => {
    if (filter === 'all') return true;
    return game.status === filter;
  });

  const renderGame = ({ item }: { item: Game }) => {
    const isWin = item.our_score > item.opponent_score;
    const isLoss = item.our_score < item.opponent_score;
    const isLive = item.status === 'in_progress';

    return (
      <TouchableOpacity
        style={styles.gameCard}
        onPress={() => router.push(isLive ? `/game/${item.id}` : `/game/summary/${item.id}`)}
      >
        <View style={styles.gameHeader}>
          <View style={[
            styles.statusDot,
            isLive && styles.statusLive,
            !isLive && isWin && styles.statusWin,
            !isLive && isLoss && styles.statusLoss,
          ]} />
          <Text style={styles.gameDate}>
            {new Date(item.game_date).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
          {isLive && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>

        <View style={styles.gameBody}>
          <View style={styles.teamInfo}>
            <View style={styles.teamLogo}>
              <Ionicons name="basketball" size={24} color={colors.primary} />
            </View>
            <Text style={styles.teamName}>Your Team</Text>
          </View>

          <View style={styles.scoreContainer}>
            <Text style={[
              styles.score,
              isWin && styles.scoreWin,
            ]}>
              {item.our_score}
            </Text>
            <Text style={styles.scoreDivider}>-</Text>
            <Text style={[
              styles.score,
              isLoss && styles.scoreLoss,
            ]}>
              {item.opponent_score}
            </Text>
          </View>

          <View style={styles.teamInfo}>
            <View style={[styles.teamLogo, styles.opponentLogo]}>
              <Ionicons name="people" size={24} color={colors.textSecondary} />
            </View>
            <Text style={styles.teamName}>{item.opponent_name}</Text>
          </View>
        </View>

        <View style={styles.gameFooter}>
          {item.location && (
            <View style={styles.footerItem}>
              <Ionicons name="location" size={14} color={colors.textSecondary} />
              <Text style={styles.footerText}>{item.location}</Text>
            </View>
          )}
          {item.player_stats.length > 0 && (
            <View style={styles.footerItem}>
              <Ionicons name="people" size={14} color={colors.textSecondary} />
              <Text style={styles.footerText}>{item.player_stats.length} players</Text>
            </View>
          )}
          {item.media.length > 0 && (
            <View style={styles.footerItem}>
              <Ionicons name="images" size={14} color={colors.textSecondary} />
              <Text style={styles.footerText}>{item.media.length}</Text>
            </View>
          )}
          {isLive && (
            <Text style={styles.quarterText}>Q{item.current_quarter}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['all', 'in_progress', 'completed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'in_progress' ? 'Live' : 'Completed'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Free tier warning */}
      {user?.subscription_tier === 'free' && (
        <View style={styles.tierWarning}>
          <Ionicons name="information-circle" size={16} color={colors.warning} />
          <Text style={styles.tierWarningText}>
            Free tier: Showing last 2 completed games. Upgrade to see all.
          </Text>
        </View>
      )}

      <FlatList
        data={filteredGames}
        renderItem={renderGame}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => token && fetchGames(token)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="basketball-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Games Yet</Text>
            <Text style={styles.emptyText}>Start a new game to begin tracking stats</Text>
            <Button
              title="Start New Game"
              onPress={() => router.push('/game/new')}
              style={{ marginTop: spacing.md }}
            />
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/game/new')}
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
  filterTabs: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: colors.text,
  },
  tierWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  tierWarningText: {
    color: colors.warning,
    fontSize: 12,
    flex: 1,
  },
  list: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  gameCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textSecondary,
    marginRight: spacing.sm,
  },
  statusLive: {
    backgroundColor: colors.success,
  },
  statusWin: {
    backgroundColor: colors.success,
  },
  statusLoss: {
    backgroundColor: colors.error,
  },
  gameDate: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  liveBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  liveText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  gameBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamInfo: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  opponentLogo: {
    backgroundColor: colors.secondary,
  },
  teamName: {
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  score: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  scoreWin: {
    color: colors.success,
  },
  scoreLoss: {
    color: colors.error,
  },
  scoreDivider: {
    fontSize: 24,
    color: colors.textSecondary,
    marginHorizontal: spacing.md,
  },
  gameFooter: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
    gap: spacing.md,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  quarterText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 'auto',
  },
  empty: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: spacing.md,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
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
