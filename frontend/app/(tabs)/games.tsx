import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Game, Team } from '../../src/types';

export default function GamesScreen() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { games, teams, fetchGames, fetchTeams, updateGame, isLoading } = useGameStore();
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed'>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [gameToAssign, setGameToAssign] = useState<Game | null>(null);

  useEffect(() => {
    if (token) {
      fetchGames(token);
      fetchTeams(token);
    }
  }, [token]);

  const handleLongPressGame = (game: Game) => {
    if (teams.length > 0) {
      setGameToAssign(game);
      setShowAssignModal(true);
    }
  };

  const handleAssignTeam = async (teamId: string | null) => {
    if (!gameToAssign || !token) return;
    
    try {
      const selectedTeam = teams.find(t => t.id === teamId);
      await updateGame(gameToAssign.id, {
        team_id: teamId,
        home_team_name: selectedTeam?.name || gameToAssign.home_team_name,
      }, token);
      setShowAssignModal(false);
      setGameToAssign(null);
      Alert.alert('Success', teamId ? `Game assigned to ${selectedTeam?.name}` : 'Team assignment removed');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to assign team');
    }
  };

  const filteredGames = games.filter(game => {
    // Filter by status
    if (filter !== 'all' && game.status !== filter) return false;
    
    // Filter by team
    if (selectedTeamId) {
      const selectedTeam = teams.find(t => t.id === selectedTeamId);
      if (!selectedTeam) return false;
      
      // Check if game matches by team_id OR home_team_name
      const matchByTeamId = game.team_id === selectedTeamId;
      const matchByTeamName = game.home_team_name === selectedTeam.name;
      
      if (!matchByTeamId && !matchByTeamName) {
        return false;
      }
    }
    
    return true;
  });

  // Calculate stats for selected team
  const getTeamStats = () => {
    if (!selectedTeamId) return null;
    
    const selectedTeam = teams.find(t => t.id === selectedTeamId);
    if (!selectedTeam) return null;
    
    const teamGames = games.filter(g => {
      const matchByTeamId = g.team_id === selectedTeamId;
      const matchByTeamName = g.home_team_name === selectedTeam.name;
      return (matchByTeamId || matchByTeamName) && g.status === 'completed';
    });
    
    const wins = teamGames.filter(g => g.our_score > g.opponent_score).length;
    const losses = teamGames.filter(g => g.our_score < g.opponent_score).length;
    const totalPoints = teamGames.reduce((sum, g) => sum + (g.our_score || 0), 0);
    const avgPoints = teamGames.length > 0 ? (totalPoints / teamGames.length).toFixed(1) : '0';
    
    return { wins, losses, gamesPlayed: teamGames.length, avgPoints };
  };

  const teamStats = getTeamStats();

  const renderGame = ({ item }: { item: Game }) => {
    const isWin = item.our_score > item.opponent_score;
    const isLoss = item.our_score < item.opponent_score;
    const isLive = item.status === 'in_progress';
    const assignedTeam = teams.find(t => t.id === item.team_id);

    return (
      <TouchableOpacity
        style={styles.gameCard}
        onPress={() => router.push(isLive ? `/game/${item.id}` : `/game/summary/${item.id}`)}
        onLongPress={() => handleLongPressGame(item)}
        delayLongPress={500}
      >
        {/* Team badge if assigned */}
        {assignedTeam && (
          <View style={[styles.assignedTeamBadge, { backgroundColor: assignedTeam.color_primary || colors.primary }]}>
            <Text style={styles.assignedTeamText}>{assignedTeam.name}</Text>
          </View>
        )}
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
            <Text style={styles.teamName}>{item.home_team_name || 'Your Team'}</Text>
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
      {/* Team Selector */}
      {teams.length > 0 && (
        <View style={styles.teamSelector}>
          <Text style={styles.teamSelectorLabel}>Filter by Team:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamScrollView}>
            <TouchableOpacity
              style={[styles.teamChip, !selectedTeamId && styles.teamChipActive]}
              onPress={() => setSelectedTeamId(null)}
            >
              <Text style={[styles.teamChipText, !selectedTeamId && styles.teamChipTextActive]}>All Teams</Text>
            </TouchableOpacity>
            {teams.map((team) => (
              <TouchableOpacity
                key={team.id}
                style={[
                  styles.teamChip, 
                  selectedTeamId === team.id && styles.teamChipActive,
                  { borderColor: team.color_primary || colors.primary }
                ]}
                onPress={() => setSelectedTeamId(team.id)}
              >
                <View style={[styles.teamChipDot, { backgroundColor: team.color_primary || colors.primary }]} />
                <Text style={[styles.teamChipText, selectedTeamId === team.id && styles.teamChipTextActive]}>
                  {team.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Team Stats Card */}
      {selectedTeamId && teamStats && (
        <View style={styles.teamStatsCard}>
          <Text style={styles.teamStatsTitle}>
            {teams.find(t => t.id === selectedTeamId)?.name} Stats
          </Text>
          <View style={styles.teamStatsRow}>
            <View style={styles.teamStatItem}>
              <Text style={styles.teamStatValue}>{teamStats.gamesPlayed}</Text>
              <Text style={styles.teamStatLabel}>Games</Text>
            </View>
            <View style={styles.teamStatItem}>
              <Text style={[styles.teamStatValue, { color: colors.success }]}>{teamStats.wins}</Text>
              <Text style={styles.teamStatLabel}>Wins</Text>
            </View>
            <View style={styles.teamStatItem}>
              <Text style={[styles.teamStatValue, { color: colors.error }]}>{teamStats.losses}</Text>
              <Text style={styles.teamStatLabel}>Losses</Text>
            </View>
            <View style={styles.teamStatItem}>
              <Text style={styles.teamStatValue}>{teamStats.avgPoints}</Text>
              <Text style={styles.teamStatLabel}>Avg Pts</Text>
            </View>
          </View>
        </View>
      )}

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

      {/* Assign Team Modal */}
      <Modal visible={showAssignModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign to Team</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Long-press a game to assign it to a team
            </Text>
            
            <ScrollView style={styles.teamList}>
              <TouchableOpacity
                style={styles.teamOption}
                onPress={() => handleAssignTeam(null)}
              >
                <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
                <Text style={styles.teamOptionText}>No Team (Unassign)</Text>
              </TouchableOpacity>
              
              {teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamOption,
                    gameToAssign?.team_id === team.id && styles.teamOptionSelected
                  ]}
                  onPress={() => handleAssignTeam(team.id)}
                >
                  <View style={[styles.teamOptionDot, { backgroundColor: team.color_primary || colors.primary }]} />
                  <Text style={styles.teamOptionText}>{team.name}</Text>
                  {gameToAssign?.team_id === team.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  teamSelector: {
    padding: spacing.md,
    paddingBottom: 0,
  },
  teamSelectorLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  teamScrollView: {
    flexGrow: 0,
  },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
    gap: spacing.xs,
  },
  teamChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  teamChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  teamChipTextActive: {
    color: colors.text,
  },
  teamStatsCard: {
    margin: spacing.md,
    marginBottom: 0,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  teamStatsTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  teamStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  teamStatItem: {
    alignItems: 'center',
  },
  teamStatValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  teamStatLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
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
    overflow: 'hidden',
  },
  assignedTeamBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderBottomLeftRadius: borderRadius.md,
  },
  assignedTeamText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
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
