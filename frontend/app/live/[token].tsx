import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  AppState,
  Animated,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Game } from '../../src/types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width: screenWidth } = Dimensions.get('window');

export default function LiveGameViewer() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const appState = useRef(AppState.currentState);
  
  // Shot chart popup state
  const [showShotPopup, setShowShotPopup] = useState(false);
  const [lastShotLocation, setLastShotLocation] = useState<{x: number, y: number} | null>(null);
  const shotPopupOpacity = useRef(new Animated.Value(0)).current;
  const lastProcessedShot = useRef<string | null>(null);

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
      
      // Check for new made shot
      if (data.last_made_shot) {
        const shotKey = `${data.last_made_shot.player_id}_${data.last_made_shot.timestamp}`;
        if (shotKey !== lastProcessedShot.current) {
          lastProcessedShot.current = shotKey;
          setLastShotLocation({ x: data.last_made_shot.x, y: data.last_made_shot.y });
          showShotAnimation();
        }
      }
      
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
  
  // Show shot popup animation
  const showShotAnimation = () => {
    setShowShotPopup(true);
    Animated.sequence([
      Animated.timing(shotPopupOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(shotPopupOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowShotPopup(false);
    });
  };

  // Format seconds to MM:SS
  const formatClock = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get period status text
  const getPeriodStatusText = (): string | null => {
    if (!game) return null;
    
    const isQuarters = game.period_type === 'quarters';
    const currentPeriod = game.current_period || 1;
    const totalPeriods = isQuarters ? 4 : 2;
    const clockSeconds = game.game_clock_seconds || 0;
    
    // Only show status if clock is at 0 and game is not completed
    if (game.status === 'completed') {
      return 'FINAL';
    }
    
    if (clockSeconds > 0) return null;
    
    if (currentPeriod >= totalPeriods) {
      return 'FINAL';
    } else if (isQuarters) {
      if (currentPeriod === 2) return 'HALFTIME';
      return `END OF Q${currentPeriod}`;
    } else {
      return currentPeriod === 1 ? 'END OF 1ST HALF' : 'FINAL';
    }
  };

  // Format time for player minutes
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
  const periodStatus = getPeriodStatusText();

  return (
    <View style={styles.container}>
      {/* Live Header */}
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={styles.header}
      >
        {/* Period Status Overlay */}
        {periodStatus && (
          <View style={styles.periodStatusOverlay}>
            <Text style={styles.periodStatusText}>{periodStatus}</Text>
          </View>
        )}
        
        {isLive && !periodStatus && (
          <View style={styles.liveBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {isCompleted && !periodStatus && (
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
            <Text style={styles.periodText}>
              {game.period_type === 'halves' ? `H${game.current_period}` : `Q${game.current_period}`}
            </Text>
            {/* Game Clock */}
            {game.game_clock_seconds !== undefined && (
              <View style={styles.gameClockContainer}>
                <Text style={[
                  styles.gameClock, 
                  (game.game_clock_seconds || 0) <= 60 && styles.gameClockLow
                ]}>
                  {formatClock(game.game_clock_seconds || 0)}
                </Text>
                {game.clock_running && (
                  <View style={styles.clockRunningIndicator} />
                )}
              </View>
            )}
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
        {/* Player Stats - In/Out Format */}
        {game.status === 'in_progress' && (
          <>
            {/* Players In */}
            <View style={styles.playersSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.inBadge}>
                  <Text style={styles.inBadgeText}>IN</Text>
                </View>
                <Text style={styles.sectionTitle}>On Court</Text>
              </View>
              {game.player_stats
                .filter(ps => (game.active_player_ids || []).includes(ps.player_id))
                .map((ps) => (
                  <View key={ps.player_id} style={[styles.playerCard, styles.playerCardIn]}>
                    <View style={styles.playerHeader}>
                      <View style={styles.playerAvatar}>
                        <Text style={styles.playerAvatarText}>{ps.player_name.charAt(0)}</Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{ps.player_name}</Text>
                        <Text style={styles.playerPoints}>{ps.stats.points || 0} PTS</Text>
                      </View>
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
                    </View>
                  </View>
                ))}
              {game.player_stats.filter(ps => (game.active_player_ids || []).includes(ps.player_id)).length === 0 && (
                <Text style={styles.emptyText}>No players on court</Text>
              )}
            </View>

            {/* Players Out / Bench */}
            <View style={styles.playersSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.outBadge}>
                  <Text style={styles.outBadgeText}>OUT</Text>
                </View>
                <Text style={styles.sectionTitle}>Bench</Text>
              </View>
              {game.player_stats
                .filter(ps => !(game.active_player_ids || []).includes(ps.player_id))
                .map((ps) => (
                  <View key={ps.player_id} style={[styles.playerCard, styles.playerCardOut]}>
                    <View style={styles.playerHeader}>
                      <View style={[styles.playerAvatar, styles.playerAvatarOut]}>
                        <Text style={styles.playerAvatarText}>{ps.player_name.charAt(0)}</Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={[styles.playerName, styles.playerNameOut]}>{ps.player_name}</Text>
                        <Text style={styles.playerPointsOut}>{ps.stats.points || 0} PTS</Text>
                      </View>
                    </View>
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.points || 0}</Text>
                        <Text style={styles.statLabel}>PTS</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>
                          {(ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0)}
                        </Text>
                        <Text style={styles.statLabel}>REB</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.assists || 0}</Text>
                        <Text style={styles.statLabel}>AST</Text>
                      </View>
                    </View>
                  </View>
                ))}
            </View>
          </>
        )}

        {/* All Player Stats (shown when game is completed) */}
        {game.status === 'completed' && (
          <View style={styles.playersSection}>
            <Text style={styles.sectionTitle}>Player Stats</Text>
            {game.player_stats.map((ps) => (
              <View key={ps.player_id} style={styles.playerCard}>
                <View style={styles.playerHeader}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarText}>{ps.player_name.charAt(0)}</Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{ps.player_name}</Text>
                    <Text style={styles.playerPoints}>{ps.stats.points || 0} PTS</Text>
                  </View>
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
          </View>
        )}

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
  playersSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  inBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  outBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  outBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: spacing.md,
  },
  playerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  playerCardIn: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  playerCardOut: {
    opacity: 0.7,
    borderLeftWidth: 3,
    borderLeftColor: colors.surfaceLight,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  playerAvatarOut: {
    backgroundColor: colors.surfaceLight,
  },
  playerAvatarText: {
    color: colors.text,
    fontSize: 16,
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
  playerNameOut: {
    color: colors.textSecondary,
  },
  playerPoints: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  playerPointsOut: {
    color: colors.textSecondary,
    fontSize: 14,
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
  statValueOut: {
    color: colors.textSecondary,
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
  // Final badge styles
  finalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  finalText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  // AI Summary styles
  summarySection: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  summaryText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  // Final Score section styles
  finalScoreSection: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  finalScoreTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  finalScoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  finalTeam: {
    alignItems: 'center',
    flex: 1,
  },
  finalTeamName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  finalScore: {
    color: colors.text,
    fontSize: 36,
    fontWeight: 'bold',
  },
  winningScore: {
    color: colors.success,
  },
  finalDash: {
    color: colors.textSecondary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  gameResult: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.md,
  },
});
