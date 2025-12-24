import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { BarChart } from 'react-native-gifted-charts';

const screenWidth = Dimensions.get('window').width;

export default function StatsScreen() {
  const { token, user } = useAuthStore();
  const { games, players, fetchGames } = useGameStore();
  const [selectedStat, setSelectedStat] = useState<'points' | 'rebounds' | 'assists'>('points');

  useEffect(() => {
    if (token) {
      fetchGames(token);
    }
  }, [token]);

  // Calculate overall stats
  const completedGames = games.filter(g => g.status === 'completed');
  const totalGames = completedGames.length;
  const wins = completedGames.filter(g => g.our_score > g.opponent_score).length;
  const losses = completedGames.filter(g => g.our_score < g.opponent_score).length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  // Calculate average stats
  const avgScore = totalGames > 0 
    ? Math.round(completedGames.reduce((sum, g) => sum + g.our_score, 0) / totalGames) 
    : 0;
  const avgOpponentScore = totalGames > 0 
    ? Math.round(completedGames.reduce((sum, g) => sum + g.opponent_score, 0) / totalGames) 
    : 0;

  // Prepare chart data
  const chartData = completedGames.slice(-10).map((game, index) => ({
    value: game.our_score,
    label: `G${index + 1}`,
    frontColor: game.our_score > game.opponent_score ? colors.success : colors.error,
  }));

  // Player leaderboard
  const playerStats: Record<string, { name: string; points: number; rebounds: number; assists: number; games: number }> = {};
  
  completedGames.forEach(game => {
    game.player_stats.forEach(ps => {
      if (!playerStats[ps.player_id]) {
        playerStats[ps.player_id] = {
          name: ps.player_name,
          points: 0,
          rebounds: 0,
          assists: 0,
          games: 0,
        };
      }
      playerStats[ps.player_id].points += ps.stats.points || 0;
      playerStats[ps.player_id].rebounds += ps.stats.rebounds || 0;
      playerStats[ps.player_id].assists += ps.stats.assists || 0;
      playerStats[ps.player_id].games += 1;
    });
  });

  const leaderboard = Object.values(playerStats)
    .sort((a, b) => b[selectedStat] - a[selectedStat])
    .slice(0, 5);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Season Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Season Summary</Text>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totalGames}</Text>
            <Text style={styles.summaryLabel}>Games</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: colors.success }]}>{wins}</Text>
            <Text style={styles.summaryLabel}>Wins</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: colors.error }]}>{losses}</Text>
            <Text style={styles.summaryLabel}>Losses</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{winRate}%</Text>
            <Text style={styles.summaryLabel}>Win Rate</Text>
          </View>
        </View>
      </View>

      {/* Score Averages */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Score Averages</Text>
        <View style={styles.scoreCompare}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Your Team</Text>
            <Text style={[styles.scoreValue, { color: colors.primary }]}>{avgScore}</Text>
          </View>
          <View style={styles.vsDivider}>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Opponents</Text>
            <Text style={styles.scoreValue}>{avgOpponentScore}</Text>
          </View>
        </View>
      </View>

      {/* Score Trend Chart */}
      {chartData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Score Trend (Last 10 Games)</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={chartData}
              width={screenWidth - spacing.md * 4}
              height={150}
              barWidth={20}
              spacing={12}
              noOfSections={4}
              barBorderRadius={4}
              yAxisThickness={0}
              xAxisThickness={1}
              xAxisColor={colors.surfaceLight}
              yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
              hideRules
              isAnimated
            />
          </View>
        </View>
      )}

      {/* Player Leaderboard */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Player Leaderboard</Text>
        
        <View style={styles.statTabs}>
          {(['points', 'rebounds', 'assists'] as const).map((stat) => (
            <TouchableOpacity
              key={stat}
              style={[styles.statTab, selectedStat === stat && styles.statTabActive]}
              onPress={() => setSelectedStat(stat)}
            >
              <Text style={[styles.statTabText, selectedStat === stat && styles.statTabTextActive]}>
                {stat.charAt(0).toUpperCase() + stat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {leaderboard.length === 0 ? (
          <View style={styles.emptyLeaderboard}>
            <Text style={styles.emptyText}>No player stats yet</Text>
          </View>
        ) : (
          leaderboard.map((player, index) => (
            <View key={player.name} style={styles.leaderboardRow}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={styles.leaderboardInfo}>
                <Text style={styles.leaderboardName}>{player.name}</Text>
                <Text style={styles.leaderboardGames}>{player.games} games</Text>
              </View>
              <View style={styles.leaderboardStats}>
                <Text style={styles.leaderboardValue}>{player[selectedStat]}</Text>
                <Text style={styles.leaderboardAvg}>
                  ({(player[selectedStat] / player.games).toFixed(1)}/g)
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Pro Features Prompt */}
      {user?.subscription_tier === 'free' && (
        <View style={styles.proPrompt}>
          <Ionicons name="lock-closed" size={24} color={colors.warning} />
          <View style={styles.proPromptInfo}>
            <Text style={styles.proPromptTitle}>Unlock Advanced Analytics</Text>
            <Text style={styles.proPromptText}>Shot charts, trends, AI insights & more</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  scoreCompare: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  scoreBox: {
    flex: 1,
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
  },
  vsDivider: {
    paddingHorizontal: spacing.md,
  },
  vsText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  statTabActive: {
    backgroundColor: colors.primary,
  },
  statTabText: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statTabTextActive: {
    color: colors.text,
  },
  emptyLeaderboard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: colors.text,
    fontWeight: 'bold',
  },
  leaderboardInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  leaderboardName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  leaderboardGames: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  leaderboardStats: {
    alignItems: 'flex-end',
  },
  leaderboardValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  leaderboardAvg: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  proPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  proPromptInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  proPromptTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  proPromptText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
