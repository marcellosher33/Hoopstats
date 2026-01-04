import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import Constants from 'expo-constants';

const screenWidth = Dimensions.get('window').width;
const API_URL = Constants.expoConfig?.extra?.backendUrl || 'https://stattrack-app-1.preview.emergentagent.com/api';

interface PlayerSeasonStats {
  player_id: string;
  player_name: string;
  games_played: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  topg: number;
  fg_pct: number;
  three_pt_pct: number;
  ft_pct: number;
  totals: {
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
  };
  trend_data: Array<{
    game_id: string;
    game_date: string;
    opponent: string;
    points: number;
    rebounds: number;
    assists: number;
  }>;
}

interface SeasonStats {
  total_games: number;
  completed_games: number;
  wins: number;
  losses: number;
  ties: number;
  win_pct: number;
  total_points_for: number;
  total_points_against: number;
  avg_points_for: number;
  avg_points_against: number;
  point_differential: number;
  player_season_stats: PlayerSeasonStats[];
  recent_games: any[];
  best_game: any;
  worst_game: any;
}

export default function StatsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [seasonStats, setSeasonStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [trendStat, setTrendStat] = useState<'points' | 'rebounds' | 'assists'>('points');

  const fetchSeasonStats = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${API_URL}/season-stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSeasonStats(data);
        if (data.player_season_stats.length > 0 && !selectedPlayer) {
          setSelectedPlayer(data.player_season_stats[0].player_id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch season stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSeasonStats();
  }, [fetchSeasonStats]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSeasonStats();
  }, [fetchSeasonStats]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading season stats...</Text>
      </View>
    );
  }

  if (!seasonStats || seasonStats.total_games === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="stats-chart" size={64} color={colors.textSecondary} />
        <Text style={styles.emptyTitle}>No Stats Yet</Text>
        <Text style={styles.emptySubtitle}>Play some games to see your season statistics!</Text>
        <TouchableOpacity 
          style={styles.startButton}
          onPress={() => router.push('/game/new')}
        >
          <Text style={styles.startButtonText}>Start a Game</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const selectedPlayerStats = seasonStats.player_season_stats.find(p => p.player_id === selectedPlayer);

  // Prepare trend chart data
  const trendData = selectedPlayerStats?.trend_data.map((game, index) => ({
    value: game[trendStat],
    label: `G${index + 1}`,
    dataPointText: game[trendStat].toString(),
  })) || [];

  // Prepare bar chart for team scoring
  const scoringData = seasonStats.recent_games.slice(0, 8).reverse().map((game, index) => ({
    value: game.our_score,
    label: `G${index + 1}`,
    frontColor: game.our_score > game.opponent_score ? colors.success : colors.error,
  }));

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Season Record Header */}
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Season Dashboard</Text>
        
        <View style={styles.recordContainer}>
          <View style={styles.recordItem}>
            <Text style={styles.recordValue}>{seasonStats.wins}</Text>
            <Text style={styles.recordLabel}>WINS</Text>
          </View>
          <View style={styles.recordDivider} />
          <View style={styles.recordItem}>
            <Text style={styles.recordValue}>{seasonStats.losses}</Text>
            <Text style={styles.recordLabel}>LOSSES</Text>
          </View>
          <View style={styles.recordDivider} />
          <View style={styles.recordItem}>
            <Text style={[styles.recordValue, { color: colors.primary }]}>{seasonStats.win_pct}%</Text>
            <Text style={styles.recordLabel}>WIN %</Text>
          </View>
        </View>

        <View style={styles.avgContainer}>
          <View style={styles.avgItem}>
            <Text style={styles.avgValue}>{seasonStats.avg_points_for}</Text>
            <Text style={styles.avgLabel}>PPG</Text>
          </View>
          <View style={styles.avgItem}>
            <Text style={styles.avgValue}>{seasonStats.avg_points_against}</Text>
            <Text style={styles.avgLabel}>OPP PPG</Text>
          </View>
          <View style={styles.avgItem}>
            <Text style={[styles.avgValue, { color: seasonStats.point_differential >= 0 ? colors.success : colors.error }]}>
              {seasonStats.point_differential >= 0 ? '+' : ''}{seasonStats.point_differential}
            </Text>
            <Text style={styles.avgLabel}>DIFF</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Team Scoring Trend */}
      {scoringData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Team Scoring (Last 8 Games)</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={scoringData}
              width={screenWidth - 60}
              height={150}
              barWidth={28}
              spacing={12}
              barBorderRadius={4}
              noOfSections={4}
              yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
              hideRules
              yAxisThickness={0}
              xAxisThickness={0}
            />
          </View>
        </View>
      )}

      {/* Player Leaderboard */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Player Leaderboard</Text>
        
        {seasonStats.player_season_stats.slice(0, 5).map((player, index) => (
          <TouchableOpacity
            key={player.player_id}
            style={[
              styles.playerRow,
              selectedPlayer === player.player_id && styles.playerRowSelected
            ]}
            onPress={() => setSelectedPlayer(player.player_id)}
          >
            <View style={styles.playerRank}>
              <Text style={styles.rankText}>#{index + 1}</Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.player_name}</Text>
              <Text style={styles.playerGames}>{player.games_played} games</Text>
            </View>
            <View style={styles.playerStats}>
              <Text style={styles.playerStat}>{player.ppg} <Text style={styles.statLabel}>PPG</Text></Text>
              <Text style={styles.playerStat}>{player.rpg} <Text style={styles.statLabel}>RPG</Text></Text>
              <Text style={styles.playerStat}>{player.apg} <Text style={styles.statLabel}>APG</Text></Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Player Trend Chart */}
      {selectedPlayerStats && trendData.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {selectedPlayerStats.player_name} - Performance Trend
          </Text>
          
          {/* Stat Selector */}
          <View style={styles.statSelector}>
            {(['points', 'rebounds', 'assists'] as const).map(stat => (
              <TouchableOpacity
                key={stat}
                style={[styles.statTab, trendStat === stat && styles.statTabActive]}
                onPress={() => setTrendStat(stat)}
              >
                <Text style={[styles.statTabText, trendStat === stat && styles.statTabTextActive]}>
                  {stat === 'points' ? 'PTS' : stat === 'rebounds' ? 'REB' : 'AST'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <View style={styles.chartContainer}>
            <LineChart
              data={trendData}
              width={screenWidth - 60}
              height={150}
              spacing={40}
              color={colors.primary}
              thickness={3}
              dataPointsColor={colors.primary}
              dataPointsRadius={5}
              textColor={colors.text}
              textFontSize={10}
              yAxisTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textSecondary, fontSize: 10 }}
              hideRules
              yAxisThickness={0}
              xAxisThickness={0}
              curved
              areaChart
              startFillColor={colors.primary}
              startOpacity={0.3}
              endOpacity={0}
            />
          </View>
          
          {/* Season Totals for selected player */}
          <View style={styles.totalsContainer}>
            <View style={styles.totalItem}>
              <Text style={styles.totalValue}>{selectedPlayerStats.totals.points}</Text>
              <Text style={styles.totalLabel}>Total Points</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalValue}>{selectedPlayerStats.totals.rebounds}</Text>
              <Text style={styles.totalLabel}>Total Rebounds</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalValue}>{selectedPlayerStats.totals.assists}</Text>
              <Text style={styles.totalLabel}>Total Assists</Text>
            </View>
          </View>
          
          {/* Shooting Percentages */}
          <View style={styles.shootingContainer}>
            <View style={styles.shootingItem}>
              <Text style={styles.shootingValue}>{selectedPlayerStats.fg_pct}%</Text>
              <Text style={styles.shootingLabel}>FG%</Text>
            </View>
            <View style={styles.shootingItem}>
              <Text style={styles.shootingValue}>{selectedPlayerStats.three_pt_pct}%</Text>
              <Text style={styles.shootingLabel}>3P%</Text>
            </View>
            <View style={styles.shootingItem}>
              <Text style={styles.shootingValue}>{selectedPlayerStats.ft_pct}%</Text>
              <Text style={styles.shootingLabel}>FT%</Text>
            </View>
          </View>
        </View>
      )}

      {/* Best/Worst Games */}
      {(seasonStats.best_game || seasonStats.worst_game) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season Highlights</Text>
          
          {seasonStats.best_game && (
            <View style={[styles.highlightCard, styles.bestGame]}>
              <View style={styles.highlightIcon}>
                <Ionicons name="trophy" size={24} color={colors.success} />
              </View>
              <View style={styles.highlightInfo}>
                <Text style={styles.highlightTitle}>Best Performance</Text>
                <Text style={styles.highlightText}>
                  vs {seasonStats.best_game.opponent_name}
                </Text>
                <Text style={styles.highlightScore}>
                  {seasonStats.best_game.our_score} - {seasonStats.best_game.opponent_score}
                  <Text style={styles.highlightDiff}>
                    {' '}(+{seasonStats.best_game.our_score - seasonStats.best_game.opponent_score})
                  </Text>
                </Text>
              </View>
            </View>
          )}
          
          {seasonStats.worst_game && seasonStats.worst_game.our_score < seasonStats.worst_game.opponent_score && (
            <View style={[styles.highlightCard, styles.worstGame]}>
              <View style={styles.highlightIcon}>
                <Ionicons name="trending-down" size={24} color={colors.error} />
              </View>
              <View style={styles.highlightInfo}>
                <Text style={styles.highlightTitle}>Toughest Loss</Text>
                <Text style={styles.highlightText}>
                  vs {seasonStats.worst_game.opponent_name}
                </Text>
                <Text style={styles.highlightScore}>
                  {seasonStats.worst_game.our_score} - {seasonStats.worst_game.opponent_score}
                  <Text style={[styles.highlightDiff, { color: colors.error }]}>
                    {' '}({seasonStats.worst_game.our_score - seasonStats.worst_game.opponent_score})
                  </Text>
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: spacing.lg,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xl,
  },
  startButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  recordContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  recordItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  recordValue: {
    color: colors.text,
    fontSize: 36,
    fontWeight: 'bold',
  },
  recordLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  recordDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.surfaceLight,
  },
  avgContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  avgItem: {
    alignItems: 'center',
  },
  avgValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
  },
  avgLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  playerRowSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  playerRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  rankText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  playerGames: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  playerStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  playerStat: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: 'normal',
  },
  statSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 4,
    marginBottom: spacing.md,
  },
  statTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  statTabActive: {
    backgroundColor: colors.primary,
  },
  statTabText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  statTabTextActive: {
    color: colors.text,
  },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  totalItem: {
    alignItems: 'center',
  },
  totalValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  totalLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  shootingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  shootingItem: {
    alignItems: 'center',
  },
  shootingValue: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  shootingLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  highlightCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  bestGame: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  worstGame: {
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  highlightIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  highlightInfo: {
    flex: 1,
  },
  highlightTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  highlightText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  highlightScore: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  highlightDiff: {
    color: colors.success,
    fontSize: 14,
  },
});
