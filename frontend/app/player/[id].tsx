import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { colors, spacing, borderRadius } from '../../src/utils/theme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const screenWidth = Dimensions.get('window').width;

interface PlayerFullStats {
  games_played: number;
  total_points: number;
  total_rebounds: number;
  total_assists: number;
  total_steals: number;
  total_blocks: number;
  total_turnovers: number;
  total_fouls: number;
  total_fg_made: number;
  total_fg_attempted: number;
  total_3pt_made: number;
  total_3pt_attempted: number;
  total_ft_made: number;
  total_ft_attempted: number;
  total_minutes: number;
  averages: {
    ppg: number;
    rpg: number;
    apg: number;
    spg: number;
    bpg: number;
    fg_pct: number;
    three_pt_pct: number;
    ft_pct: number;
  };
  game_history: Array<{
    game_id: string;
    date: string;
    opponent: string;
    stats: any;
  }>;
}

export default function PlayerStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuthStore();
  const { players } = useGameStore();
  
  const [stats, setStats] = useState<PlayerFullStats | null>(null);
  const [loading, setLoading] = useState(true);

  const player = players.find(p => p.id === id);

  useEffect(() => {
    fetchPlayerStats();
  }, [id, token]);

  const fetchPlayerStats = async () => {
    if (!token || !id) return;
    
    try {
      const response = await fetch(`${API_URL}/api/players/${id}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch player stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading stats...</Text>
      </View>
    );
  }

  const pointsData = stats?.game_history.slice(-10).map((g, i) => ({
    value: g.stats.points || 0,
    label: `G${i + 1}`,
    frontColor: colors.points,
  })) || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Player Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {player?.name.charAt(0).toUpperCase() || '?'}
          </Text>
          {player?.number && (
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>#{player.number}</Text>
            </View>
          )}
        </View>
        <Text style={styles.playerName}>{player?.name}</Text>
        {player?.position && (
          <Text style={styles.playerPosition}>{player.position}</Text>
        )}
      </View>

      {/* Season Averages */}
      {stats && stats.games_played > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season Averages</Text>
          <View style={styles.averagesGrid}>
            <AverageCard label="PPG" value={stats.averages.ppg} color={colors.points} />
            <AverageCard label="RPG" value={stats.averages.rpg} color={colors.rebounds} />
            <AverageCard label="APG" value={stats.averages.apg} color={colors.assists} />
            <AverageCard label="SPG" value={stats.averages.spg} color={colors.steals} />
            <AverageCard label="BPG" value={stats.averages.bpg} color={colors.blocks} />
            <AverageCard label="FG%" value={stats.averages.fg_pct} color={colors.success} suffix="%" />
          </View>
        </View>
      )}

      {/* Shooting Stats */}
      {stats && stats.games_played > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shooting</Text>
          <View style={styles.shootingCard}>
            <ShootingBar
              label="Field Goals"
              made={stats.total_fg_made}
              attempted={stats.total_fg_attempted}
              percentage={stats.averages.fg_pct}
              color={colors.primary}
            />
            <ShootingBar
              label="3-Pointers"
              made={stats.total_3pt_made}
              attempted={stats.total_3pt_attempted}
              percentage={stats.averages.three_pt_pct}
              color="#8B5CF6"
            />
            <ShootingBar
              label="Free Throws"
              made={stats.total_ft_made}
              attempted={stats.total_ft_attempted}
              percentage={stats.averages.ft_pct}
              color={colors.success}
            />
          </View>
        </View>
      )}

      {/* Points Trend */}
      {pointsData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Points Trend (Last 10 Games)</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={pointsData}
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

      {/* Season Totals */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Season Totals</Text>
          <View style={styles.totalsCard}>
            <TotalRow label="Games Played" value={stats.games_played} />
            <TotalRow label="Total Points" value={stats.total_points} />
            <TotalRow label="Total Rebounds" value={stats.total_rebounds} />
            <TotalRow label="Total Assists" value={stats.total_assists} />
            <TotalRow label="Total Steals" value={stats.total_steals} />
            <TotalRow label="Total Blocks" value={stats.total_blocks} />
            <TotalRow label="Total Turnovers" value={stats.total_turnovers} />
          </View>
        </View>
      )}

      {/* Game Log */}
      {stats && stats.game_history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Log</Text>
          {stats.game_history.map((game, index) => (
            <View key={game.game_id} style={styles.gameLogItem}>
              <View style={styles.gameLogHeader}>
                <Text style={styles.gameLogOpponent}>vs {game.opponent}</Text>
                <Text style={styles.gameLogDate}>
                  {new Date(game.date).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.gameLogStats}>
                <Text style={styles.gameLogStat}>{game.stats.points || 0} PTS</Text>
                <Text style={styles.gameLogStat}>{game.stats.rebounds || 0} REB</Text>
                <Text style={styles.gameLogStat}>{game.stats.assists || 0} AST</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* No Games Yet */}
      {stats && stats.games_played === 0 && (
        <View style={styles.noGames}>
          <Ionicons name="basketball-outline" size={64} color={colors.textSecondary} />
          <Text style={styles.noGamesText}>No games played yet</Text>
          <Text style={styles.noGamesSubtext}>
            Start a game and add this player to see their stats
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const AverageCard = ({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) => (
  <View style={[styles.averageCard, { borderLeftColor: color }]}>
    <Text style={[styles.averageValue, { color }]}>{value}{suffix}</Text>
    <Text style={styles.averageLabel}>{label}</Text>
  </View>
);

const ShootingBar = ({ label, made, attempted, percentage, color }: {
  label: string;
  made: number;
  attempted: number;
  percentage: number;
  color: string;
}) => (
  <View style={styles.shootingRow}>
    <View style={styles.shootingInfo}>
      <Text style={styles.shootingLabel}>{label}</Text>
      <Text style={styles.shootingNumbers}>{made}/{attempted}</Text>
    </View>
    <View style={styles.shootingBarContainer}>
      <View style={[styles.shootingBarFill, { width: `${percentage}%`, backgroundColor: color }]} />
    </View>
    <Text style={[styles.shootingPct, { color }]}>{percentage}%</Text>
  </View>
);

const TotalRow = ({ label, value }: { label: string; value: number }) => (
  <View style={styles.totalRow}>
    <Text style={styles.totalLabel}>{label}</Text>
    <Text style={styles.totalValue}>{value}</Text>
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
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.text,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.text,
  },
  numberBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.background,
  },
  numberText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  playerName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  playerPosition: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  averagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  averageCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderLeftWidth: 3,
    alignItems: 'center',
  },
  averageValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  averageLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  shootingCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  shootingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  shootingInfo: {
    width: 100,
  },
  shootingLabel: {
    color: colors.text,
    fontSize: 12,
  },
  shootingNumbers: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  shootingBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  shootingBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  shootingPct: {
    width: 45,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  totalsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  totalLabel: {
    color: colors.textSecondary,
  },
  totalValue: {
    color: colors.text,
    fontWeight: '600',
  },
  gameLogItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  gameLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  gameLogOpponent: {
    color: colors.text,
    fontWeight: '600',
  },
  gameLogDate: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  gameLogStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  gameLogStat: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  noGames: {
    alignItems: 'center',
    padding: spacing.xxl,
  },
  noGamesText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  noGamesSubtext: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
