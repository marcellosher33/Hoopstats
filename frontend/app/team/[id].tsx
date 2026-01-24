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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Player } from '../../src/types';

import { requireApiBaseUrl } from '../../src/services/apiBase';

const API_URL = requireApiBaseUrl();

interface Team {
  id: string;
  name: string;
  logo?: string;
  color_primary: string;
  color_secondary: string;
  created_at: string;
}

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuthStore();
  const { players, fetchPlayers } = useGameStore();
  
  const [team, setTeam] = useState<Team | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchTeam = async () => {
    try {
      const response = await fetch(`${API_URL}/api/teams/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTeam(data);
      }
    } catch (error) {
      console.error('Failed to fetch team:', error);
    }
  };

  const fetchTeamPlayers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/teams/${id}/players`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTeamPlayers(data);
      }
    } catch (error) {
      console.error('Failed to fetch team players:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token && id) {
      fetchTeam();
      fetchTeamPlayers();
      fetchPlayers(token);
    }
  }, [token, id]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTeam();
    fetchTeamPlayers();
  };

  const handleAddPlayer = async (playerId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/teams/${id}/players/${playerId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        fetchTeamPlayers();
        fetchPlayers(token!);
        setShowAddModal(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add player');
    }
  };

  const handleRemovePlayer = async (playerId: string) => {
    Alert.alert(
      'Remove Player',
      'Are you sure you want to remove this player from the team?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/teams/${id}/players/${playerId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
              });
              if (response.ok) {
                fetchTeamPlayers();
                fetchPlayers(token!);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to remove player');
            }
          },
        },
      ]
    );
  };

  const handleStartTeamGame = () => {
    if (teamPlayers.length === 0) {
      Alert.alert('No Players', 'Add players to the team before starting a game');
      return;
    }
    // Navigate to new game with team pre-selected
    router.push({ pathname: '/game/new', params: { teamId: id, teamName: team?.name } });
  };

  const availablePlayers = players.filter(
    (p) => !teamPlayers.some((tp) => tp.id === p.id)
  );

  if (!team) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
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
        {/* Team Header */}
        <View style={styles.header}>
          <View style={[styles.teamIcon, { backgroundColor: team.color_primary }]}>
            <Text style={styles.teamIconText}>{team.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.playerCount}>{teamPlayers.length} Players</Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <Button
            title="Start Team Game"
            onPress={handleStartTeamGame}
            icon={<Ionicons name="basketball" size={20} color={colors.text} />}
            style={{ flex: 1 }}
          />
        </View>

        {/* Roster */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Roster</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="person-add" size={20} color={colors.primary} />
              <Text style={styles.addButtonText}>Add Player</Text>
            </TouchableOpacity>
          </View>

          {teamPlayers.length === 0 ? (
            <View style={styles.emptyRoster}>
              <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No players on roster</Text>
              <Text style={styles.emptySubtext}>Add players to start tracking team stats</Text>
            </View>
          ) : (
            teamPlayers.map((player) => (
              <View key={player.id} style={styles.playerCard}>
                <View style={[styles.playerAvatar, { backgroundColor: team.color_primary }]}>
                  <Text style={styles.playerAvatarText}>
                    {player.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  <Text style={styles.playerDetails}>
                    #{player.number || '-'} • {player.position || 'No Position'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemovePlayer(player.id)}
                >
                  <Ionicons name="close-circle" size={24} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Player Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Player to Team</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {availablePlayers.length === 0 ? (
              <View style={styles.emptyModal}>
                <Text style={styles.emptyModalText}>All players are already on this team</Text>
                <Button
                  title="Create New Player"
                  onPress={() => {
                    setShowAddModal(false);
                    router.push('/player/new');
                  }}
                  variant="outline"
                  style={{ marginTop: spacing.md }}
                />
              </View>
            ) : (
              <ScrollView style={styles.playerList}>
                {availablePlayers.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    style={styles.playerOption}
                    onPress={() => handleAddPlayer(player.id)}
                  >
                    <View style={styles.playerOptionAvatar}>
                      <Text style={styles.playerOptionAvatarText}>
                        {player.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.playerOptionInfo}>
                      <Text style={styles.playerOptionName}>{player.name}</Text>
                      <Text style={styles.playerOptionDetails}>
                        #{player.number || '-'} • {player.position || 'No Position'}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={colors.success} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textSecondary,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  teamIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  teamIconText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  playerCount: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
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
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addButtonText: {
    color: colors.primary,
    fontWeight: '500',
  },
  emptyRoster: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
    marginTop: spacing.md,
  },
  emptySubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  playerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  playerDetails: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  removeButton: {
    padding: spacing.xs,
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
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  emptyModal: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyModalText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  playerList: {
    padding: spacing.md,
  },
  playerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  playerOptionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerOptionAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  playerOptionInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  playerOptionName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  playerOptionDetails: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
