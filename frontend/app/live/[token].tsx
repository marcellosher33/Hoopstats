import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Game } from '../../src/types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function LiveGameViewer() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const appState = useRef(AppState.currentState);

  const fetchGame = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${API_URL}/api/live/${token}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('Game not found or sharing has been disabled');
        } else {
          setError('Failed to load game');
        }
        return;
      }
      const data = await response.json();
      setGame(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError('Network error - check your connection');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchGame();
    
    // Fast refresh every 2 seconds for real-time updates
    const interval = setInterval(fetchGame, 2000);
    
    // Handle app state changes (pause when backgrounded)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchGame(); // Refresh immediately when coming back to foreground
      }
      appState.current = nextAppState;
    });
    
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [fetchGame]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGame();
  }, [fetchGame]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading live game...</Text>
      </View>
    );
  }

  if (error || !game) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color={colors.error} />
        <Text style={styles.errorText}>{error || 'Game not found'}</Text>
      </View>
    );
  }

  const isLive = game.status === 'in_progress';
  const isCompleted = game.status === 'completed';

  return (
    <View style={styles.container}>
      {/* Live Header */}
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={styles.header}
      >
        {isLive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {isCompleted && (
          <View style={styles.finalBadge}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.finalText}>FINAL</Text>
          </View>
        )}
        
        <View style={styles.scoreboard}>
          <View style={styles.teamSection}>
            <Text style={styles.teamName}>{game.home_team_name}</Text>
            <Text style={styles.score}>{game.our_score}</Text>
          </View>
          
          <View style={styles.gameInfo}>
            <Text style={styles.vsText}>VS</Text>
            <Text style={styles.periodText}>
              {game.period_type === 'halves' ? `H${game.current_period}` : `Q${game.current_period}`}
            </Text>
          </View>
          
          <View style={styles.teamSection}>
            <Text style={styles.teamName}>{game.opponent_name}</Text>
            <Text style={styles.score}>{game.opponent_score}</Text>
          </View>
        </View>
        
        <Text style={styles.lastUpdate}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Player Stats */}
        <Text style={styles.sectionTitle}>Player Stats</Text>
        
        {game.player_stats.map((ps) => (
          <View key={ps.player_id} style={styles.playerCard}>
            <View style={styles.playerHeader}>
              <Text style={styles.playerName}>{ps.player_name}</Text>
              <Text style={styles.playerPoints}>{ps.stats.points || 0} PTS</Text>
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ps.stats.points || 0}</Text>
                <Text style={styles.statLabel}>PTS</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {(ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0)}
                </Text>
                <Text style={styles.statLabel}>REB</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ps.stats.assists || 0}</Text>
                <Text style={styles.statLabel}>AST</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ps.stats.steals || 0}</Text>
                <Text style={styles.statLabel}>STL</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ps.stats.blocks || 0}</Text>
                <Text style={styles.statLabel}>BLK</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {ps.stats.fg_attempted ? Math.round((ps.stats.fg_made || 0) / ps.stats.fg_attempted * 100) : 0}%
                </Text>
                <Text style={styles.statLabel}>FG%</Text>
              </View>
            </View>
          </View>
        ))}

        {/* AI Summary (shown when game is completed) */}
        {game.status === 'completed' && game.ai_summary && (
          <View style={styles.summarySection}>
            <View style={styles.summaryHeader}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
              <Text style={styles.summaryTitle}>Game Summary</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{game.ai_summary}</Text>
            </View>
          </View>
        )}

        {/* Final Score Card (shown when game is completed) */}
        {game.status === 'completed' && (
          <View style={styles.finalScoreSection}>
            <Text style={styles.finalScoreTitle}>Final Score</Text>
            <View style={styles.finalScoreCard}>
              <View style={styles.finalTeam}>
                <Text style={styles.finalTeamName}>{game.home_team_name}</Text>
                <Text style={[styles.finalScore, game.our_score > game.opponent_score && styles.winningScore]}>
                  {game.our_score}
                </Text>
              </View>
              <Text style={styles.finalDash}>-</Text>
              <View style={styles.finalTeam}>
                <Text style={styles.finalTeamName}>{game.opponent_name}</Text>
                <Text style={[styles.finalScore, game.opponent_score > game.our_score && styles.winningScore]}>
                  {game.opponent_score}
                </Text>
              </View>
            </View>
            <Text style={styles.gameResult}>
              {game.our_score > game.opponent_score ? '🏆 Victory!' : game.our_score < game.opponent_score ? 'Defeat' : 'Tie Game'}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons name="basketball" size={20} color={colors.textSecondary} />
          <Text style={styles.footerText}>Powered by CourtClock</Text>
        </View>
      </ScrollView>
    </View>
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
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xl + 20,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
    marginRight: spacing.xs,
  },
  liveText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: 'bold',
  },
  scoreboard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  score: {
    color: colors.text,
    fontSize: 48,
    fontWeight: 'bold',
  },
  gameInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  vsText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  periodText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.xs,
  },
  lastUpdate: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  playerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  playerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  playerPoints: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
