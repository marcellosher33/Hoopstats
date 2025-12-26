import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Team, Player, Game } from '../../src/types';

const COLOR_OPTIONS = [
  '#FF6B35', '#3B82F6', '#10B981', '#A855F7', '#F59E0B',
  '#EF4444', '#EC4899', '#06B6D4', '#8B5CF6', '#14B8A6',
];

export default function TeamsScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { teams, players, games, fetchTeams, fetchPlayers, fetchGames, createTeam, updateTeam, deleteTeam, updatePlayer } = useGameStore();

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddPlayersModal, setShowAddPlayersModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamColor, setNewTeamColor] = useState(COLOR_OPTIONS[0]);
  const [newTeamLogo, setNewTeamLogo] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamColor, setEditTeamColor] = useState(COLOR_OPTIONS[0]);
  const [editTeamLogo, setEditTeamLogo] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedPlayersToAdd, setSelectedPlayersToAdd] = useState<string[]>([]);

  useEffect(() => {
    if (token) {
      fetchTeams(token);
      fetchPlayers(token);
      fetchGames(token);
    }
  }, [token]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (token) {
      await Promise.all([
        fetchTeams(token),
        fetchPlayers(token),
        fetchGames(token),
      ]);
    }
    setRefreshing(false);
  };

  const handlePickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setNewTeamLogo(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      Alert.alert('Error', 'Please enter a team name');
      return;
    }

    setLoading(true);
    try {
      await createTeam(
        {
          name: newTeamName.trim(),
          color_primary: newTeamColor,
          logo: newTeamLogo || undefined,
        },
        token!
      );
      setShowCreateModal(false);
      setNewTeamName('');
      setNewTeamColor(COLOR_OPTIONS[0]);
      setNewTeamLogo(null);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const openEditTeamModal = (team: Team) => {
    setEditingTeam(team);
    setEditTeamName(team.name);
    setEditTeamColor(team.color_primary || COLOR_OPTIONS[0]);
    setEditTeamLogo(team.logo || null);
    setShowEditModal(true);
  };

  const handlePickEditLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setEditTeamLogo(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleUpdateTeam = async () => {
    if (!editingTeam || !editTeamName.trim()) {
      Alert.alert('Error', 'Please enter a team name');
      return;
    }

    setLoading(true);
    try {
      await updateTeam(
        editingTeam.id,
        {
          name: editTeamName.trim(),
          color_primary: editTeamColor,
          logo: editTeamLogo || undefined,
        },
        token!
      );
      setShowEditModal(false);
      setEditingTeam(null);
      Alert.alert('Success', 'Team updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update team');
    } finally {
      setLoading(false);
    }
  };

  const getUnassignedPlayers = (): Player[] => {
    return players.filter(p => !p.team_id);
  };

  const openAddPlayersModal = (team: Team) => {
    setSelectedTeam(team);
    setSelectedPlayersToAdd([]);
    setShowAddPlayersModal(true);
  };

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayersToAdd(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleAddPlayersToTeam = async () => {
    if (!selectedTeam || selectedPlayersToAdd.length === 0) return;

    setLoading(true);
    try {
      // Update each selected player's team_id
      for (const playerId of selectedPlayersToAdd) {
        await updatePlayer(playerId, { team_id: selectedTeam.id }, token!);
      }
      await fetchPlayers(token!);
      setShowAddPlayersModal(false);
      setSelectedPlayersToAdd([]);
      Alert.alert('Success', `Added ${selectedPlayersToAdd.length} player(s) to ${selectedTeam.name}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add players');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlayerFromTeam = async (player: Player) => {
    Alert.alert(
      'Remove Player',
      `Remove ${player.name} from this team?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await updatePlayer(player.id, { team_id: null }, token!);
              await fetchPlayers(token!);
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to remove player');
            }
          },
        },
      ]
    );
  };

  const handleDeleteTeam = (team: Team) => {
    Alert.alert(
      'Delete Team',
      `Are you sure you want to delete "${team.name}"? Players will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTeam(team.id, token!);
              if (selectedTeam?.id === team.id) {
                setSelectedTeam(null);
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete team');
            }
          },
        },
      ]
    );
  };

  const getTeamPlayers = (teamId: string): Player[] => {
    return players.filter(p => p.team_id === teamId);
  };

  const getTeamGames = (teamId: string): Game[] => {
    // Get games where any player from this team participated
    const teamPlayerIds = getTeamPlayers(teamId).map(p => p.id);
    return games.filter(g => 
      g.player_stats.some(ps => teamPlayerIds.includes(ps.player_id))
    );
  };

  const getTeamStats = (teamId: string) => {
    const teamGames = getTeamGames(teamId);
    const teamPlayerIds = getTeamPlayers(teamId).map(p => p.id);
    
    let totalPoints = 0;
    let totalRebounds = 0;
    let totalAssists = 0;
    let totalSteals = 0;
    let totalBlocks = 0;
    let wins = 0;
    let losses = 0;

    teamGames.forEach(game => {
      const gameStats = game.player_stats
        .filter(ps => teamPlayerIds.includes(ps.player_id))
        .reduce((acc, ps) => ({
          points: acc.points + (ps.stats.points || 0),
          rebounds: acc.rebounds + (ps.stats.rebounds || 0),
          assists: acc.assists + (ps.stats.assists || 0),
          steals: acc.steals + (ps.stats.steals || 0),
          blocks: acc.blocks + (ps.stats.blocks || 0),
        }), { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 });

      totalPoints += gameStats.points;
      totalRebounds += gameStats.rebounds;
      totalAssists += gameStats.assists;
      totalSteals += gameStats.steals;
      totalBlocks += gameStats.blocks;

      if (game.status === 'completed') {
        if (game.our_score > game.opponent_score) {
          wins++;
        } else {
          losses++;
        }
      }
    });

    return {
      games: teamGames.length,
      wins,
      losses,
      totalPoints,
      totalRebounds,
      totalAssists,
      totalSteals,
      totalBlocks,
      ppg: teamGames.length > 0 ? (totalPoints / teamGames.length).toFixed(1) : '0',
      rpg: teamGames.length > 0 ? (totalRebounds / teamGames.length).toFixed(1) : '0',
      apg: teamGames.length > 0 ? (totalAssists / teamGames.length).toFixed(1) : '0',
    };
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Teams</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {teams.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shirt-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Teams Yet</Text>
            <Text style={styles.emptyText}>Create a team to organize your players and track team stats</Text>
            <Button
              title="Create Team"
              onPress={() => setShowCreateModal(true)}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        ) : (
          <>
            {/* Team List */}
            <View style={styles.teamList}>
              {teams.map((team) => {
                const teamPlayers = getTeamPlayers(team.id);
                const teamStats = getTeamStats(team.id);
                const isSelected = selectedTeam?.id === team.id;

                return (
                  <TouchableOpacity
                    key={team.id}
                    style={[styles.teamCard, isSelected && styles.teamCardSelected]}
                    onPress={() => setSelectedTeam(isSelected ? null : team)}
                    onLongPress={() => handleDeleteTeam(team)}
                  >
                    <View style={styles.teamHeader}>
                      {team.logo ? (
                        <Image source={{ uri: team.logo }} style={styles.teamLogo} />
                      ) : (
                        <View style={[styles.teamBadge, { backgroundColor: team.color_primary }]}>
                          <Text style={styles.teamBadgeText}>{team.name.charAt(0)}</Text>
                        </View>
                      )}
                      <View style={styles.teamInfo}>
                        <Text style={styles.teamName}>{team.name}</Text>
                        <Text style={styles.teamMeta}>
                          {teamPlayers.length} players • {teamStats.games} games
                        </Text>
                      </View>
                      <View style={styles.teamRecord}>
                        <Text style={styles.recordText}>{teamStats.wins}-{teamStats.losses}</Text>
                        <Text style={styles.recordLabel}>Record</Text>
                      </View>
                    </View>

                    {isSelected && (
                      <View style={styles.teamDetails}>
                        {/* Team Stats */}
                        <View style={styles.statsRow}>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{teamStats.ppg}</Text>
                            <Text style={styles.statLabel}>PPG</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{teamStats.rpg}</Text>
                            <Text style={styles.statLabel}>RPG</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{teamStats.apg}</Text>
                            <Text style={styles.statLabel}>APG</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{teamStats.totalSteals}</Text>
                            <Text style={styles.statLabel}>STL</Text>
                          </View>
                          <View style={styles.statItem}>
                            <Text style={styles.statValue}>{teamStats.totalBlocks}</Text>
                            <Text style={styles.statLabel}>BLK</Text>
                          </View>
                        </View>

                        {/* Players */}
                        <Text style={styles.sectionTitle}>Roster ({teamPlayers.length})</Text>
                        {teamPlayers.length === 0 ? (
                          <Text style={styles.noPlayersText}>No players assigned to this team</Text>
                        ) : (
                          <View style={styles.playerList}>
                            {teamPlayers.map((player) => (
                              <TouchableOpacity
                                key={player.id}
                                style={styles.playerItem}
                                onPress={() => router.push(`/player/${player.id}`)}
                                onLongPress={() => handleRemovePlayerFromTeam(player)}
                              >
                                <View style={styles.playerAvatar}>
                                  <Text style={styles.playerAvatarText}>{player.name.charAt(0)}</Text>
                                </View>
                                <View style={styles.playerInfo}>
                                  <Text style={styles.playerName}>{player.name}</Text>
                                  <Text style={styles.playerMeta}>
                                    {player.number ? `#${player.number}` : ''} {player.position || ''}
                                  </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}

                        <View style={styles.addPlayerActions}>
                          <TouchableOpacity
                            style={styles.addPlayerBtn}
                            onPress={() => openAddPlayersModal(team)}
                          >
                            <Ionicons name="person-add" size={18} color={colors.primary} />
                            <Text style={styles.addPlayerText}>Add Existing Players</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.addPlayerBtn}
                            onPress={() => router.push(`/player/new?teamId=${team.id}`)}
                          >
                            <Ionicons name="add-circle" size={18} color={colors.success} />
                            <Text style={[styles.addPlayerText, { color: colors.success }]}>Create New Player</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.teamActions}>
                          <TouchableOpacity
                            style={styles.editTeamBtn}
                            onPress={() => openEditTeamModal(team)}
                          >
                            <Ionicons name="create" size={18} color={colors.primary} />
                            <Text style={styles.editTeamText}>Edit Team</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.deleteTeamBtn}
                            onPress={() => handleDeleteTeam(team)}
                          >
                            <Ionicons name="trash" size={18} color={colors.error} />
                            <Text style={styles.deleteTeamText}>Delete Team</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.hintText}>Long-press player to remove from team</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Create Team Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Team</Text>
              <TouchableOpacity onPress={() => { setShowCreateModal(false); setNewTeamLogo(null); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Team Logo */}
            <TouchableOpacity style={styles.logoPickerContainer} onPress={handlePickLogo}>
              {newTeamLogo ? (
                <Image source={{ uri: newTeamLogo }} style={styles.logoPicker} />
              ) : (
                <View style={[styles.logoPlaceholder, { backgroundColor: newTeamColor }]}>
                  <Ionicons name="camera" size={32} color="white" />
                  <Text style={styles.logoPlaceholderText}>Add Logo</Text>
                </View>
              )}
            </TouchableOpacity>

            <Input
              label="Team Name"
              value={newTeamName}
              onChangeText={setNewTeamName}
              placeholder="e.g., Warriors, Eagles"
            />

            <Text style={styles.colorLabel}>Team Color</Text>
            <View style={styles.colorGrid}>
              {COLOR_OPTIONS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    newTeamColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setNewTeamColor(color)}
                >
                  {newTeamColor === color && (
                    <Ionicons name="checkmark" size={20} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title="Create Team"
              onPress={handleCreateTeam}
              loading={loading}
              disabled={!newTeamName.trim()}
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </View>
      </Modal>

      {/* Add Players Modal */}
      <Modal visible={showAddPlayersModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Players to {selectedTeam?.name}</Text>
              <TouchableOpacity onPress={() => setShowAddPlayersModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {getUnassignedPlayers().length === 0 ? (
              <View style={styles.emptyPlayersModal}>
                <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyPlayersText}>All players are already assigned to teams</Text>
                <Button
                  title="Create New Player"
                  onPress={() => {
                    setShowAddPlayersModal(false);
                    router.push(`/player/new?teamId=${selectedTeam?.id}`);
                  }}
                  variant="outline"
                  style={{ marginTop: spacing.md }}
                />
              </View>
            ) : (
              <>
                <Text style={styles.modalSubtitle}>Select players to add:</Text>
                <ScrollView style={styles.playerSelectList}>
                  {getUnassignedPlayers().map((player) => (
                    <TouchableOpacity
                      key={player.id}
                      style={[
                        styles.playerSelectItem,
                        selectedPlayersToAdd.includes(player.id) && styles.playerSelectItemActive,
                      ]}
                      onPress={() => togglePlayerSelection(player.id)}
                    >
                      <View style={styles.playerAvatar}>
                        <Text style={styles.playerAvatarText}>{player.name.charAt(0)}</Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{player.name}</Text>
                        <Text style={styles.playerMeta}>
                          {player.number ? `#${player.number}` : ''} {player.position || ''}
                        </Text>
                      </View>
                      {selectedPlayersToAdd.includes(player.id) ? (
                        <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={24} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Button
                  title={`Add ${selectedPlayersToAdd.length} Player(s)`}
                  onPress={handleAddPlayersToTeam}
                  loading={loading}
                  disabled={selectedPlayersToAdd.length === 0}
                  style={{ marginTop: spacing.md }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Team Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Team</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoPickerContainer} onPress={handlePickEditLogo}>
              {editTeamLogo ? (
                <Image source={{ uri: editTeamLogo }} style={styles.logoPicker} />
              ) : (
                <View style={[styles.logoPlaceholder, { backgroundColor: editTeamColor }]}>
                  <Ionicons name="camera" size={32} color="white" />
                  <Text style={styles.logoPlaceholderText}>Change Logo</Text>
                </View>
              )}
            </TouchableOpacity>

            <Input
              label="Team Name"
              value={editTeamName}
              onChangeText={setEditTeamName}
              placeholder="e.g., Warriors, Eagles"
            />

            <Text style={styles.colorLabel}>Team Color</Text>
            <View style={styles.colorGrid}>
              {COLOR_OPTIONS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    editTeamColor === color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setEditTeamColor(color)}
                >
                  {editTeamColor === color && (
                    <Ionicons name="checkmark" size={20} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title="Save Changes"
              onPress={handleUpdateTeam}
              loading={loading}
              disabled={!editTeamName.trim()}
              style={{ marginTop: spacing.lg }}
            />
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
  content: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  addButton: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  teamList: {
    gap: spacing.md,
  },
  teamCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  teamCardSelected: {
    borderColor: colors.primary,
  },
  teamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  teamBadgeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  teamRecord: {
    alignItems: 'center',
  },
  recordText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  recordLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  teamDetails: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  noPlayersText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  playerList: {
    gap: spacing.xs,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  playerAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  playerMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  addPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  addPlayerText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  colorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: colors.text,
  },
  // New styles
  teamLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: spacing.md,
  },
  logoPickerContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoPicker: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderText: {
    color: 'white',
    fontSize: 11,
    marginTop: 4,
  },
  addPlayerActions: {
    gap: spacing.sm,
  },
  hintText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  emptyPlayersModal: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyPlayersText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  playerSelectList: {
    maxHeight: 300,
  },
  playerSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  playerSelectItemActive: {
    borderColor: colors.success,
    backgroundColor: colors.success + '20',
  },
});
