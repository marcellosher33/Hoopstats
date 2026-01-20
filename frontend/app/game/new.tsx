import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Player, Team } from '../../src/types';

type LocationType = 'home' | 'away' | null;
type GameType = 'preseason' | 'tournament' | 'regular_season' | 'playoffs' | null;
type PeriodType = 'quarters' | 'halves';

const LOCATION_OPTIONS: { value: LocationType; label: string; icon: string }[] = [
  { value: 'home', label: 'Home', icon: 'home' },
  { value: 'away', label: 'Away', icon: 'airplane' },
];

const GAME_TYPE_OPTIONS: { value: GameType; label: string; icon: string }[] = [
  { value: 'preseason', label: 'Preseason', icon: 'fitness' },
  { value: 'regular_season', label: 'Regular Season', icon: 'basketball' },
  { value: 'tournament', label: 'Tournament', icon: 'trophy' },
  { value: 'playoffs', label: 'Playoffs', icon: 'star' },
];

const PERIOD_TYPE_OPTIONS: { value: PeriodType; label: string; description: string }[] = [
  { value: 'quarters', label: '4 Quarters', description: 'NBA, HS' },
  { value: 'halves', label: '2 Halves', description: 'College, FIBA, Youth' },
];

const PERIOD_TIME_OPTIONS = [
  { value: 4, label: '4 min' },
  { value: 5, label: '5 min' },
  { value: 6, label: '6 min' },
  { value: 8, label: '8 min' },
  { value: 10, label: '10 min' },
  { value: 12, label: '12 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
];

export default function NewGameScreen() {
  const router = useRouter();
  const { token } = useAuthStore();
  const { players, teams, fetchPlayers, fetchTeams, createGame } = useGameStore();

  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [opponentName, setOpponentName] = useState('');
  const [location, setLocation] = useState<LocationType>(null);
  const [gameType, setGameType] = useState<GameType>(null);
  const [periodType, setPeriodType] = useState<PeriodType>('quarters');
  const [periodTimeMinutes, setPeriodTimeMinutes] = useState(8); // Default 8 minutes per quarter
  const [homeTeamName, setHomeTeamName] = useState('');
  const [venue, setVenue] = useState('');
  const [gameNotes, setGameNotes] = useState(''); // Game goals/notes
  
  // Update default time when period type changes
  useEffect(() => {
    if (periodType === 'halves') {
      setPeriodTimeMinutes(20); // 20 min halves default
    } else {
      setPeriodTimeMinutes(8); // 8 min quarters default
    }
  }, [periodType]);
  const [gameDate, setGameDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchPlayers(token);
      fetchTeams(token);
    }
  }, [token]);

  // Filter players based on selected team
  const availablePlayers = selectedTeam 
    ? players.filter(p => p.team_id === selectedTeam.id)
    : players;

  // When team is selected, auto-select all team players and set team name
  const handleTeamSelect = (team: Team | null) => {
    setSelectedTeam(team);
    if (team) {
      setHomeTeamName(team.name);
      // Auto-select all players from this team
      const teamPlayerIds = players
        .filter(p => p.team_id === team.id)
        .map(p => p.id);
      setSelectedPlayers(teamPlayerIds);
    } else {
      setHomeTeamName('');
      setSelectedPlayers([]);
    }
  };

  const togglePlayer = (playerId: string) => {
    console.log('[NewGame] togglePlayer called with:', playerId);
    console.log('[NewGame] Current selectedPlayers:', selectedPlayers);
    setSelectedPlayers(prev => {
      const newSelection = prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId];
      console.log('[NewGame] New selection:', newSelection);
      return newSelection;
    });
  };

  const handleCreateGame = async () => {
    if (!homeTeamName.trim()) {
      Alert.alert('Error', 'Please enter your team name');
      return;
    }
    
    if (!opponentName.trim()) {
      Alert.alert('Error', 'Please enter opponent name');
      return;
    }

    if (selectedPlayers.length === 0) {
      Alert.alert('Error', 'Please select at least one player');
      return;
    }

    setLoading(true);
    try {
      const game = await createGame(
        {
          home_team_name: homeTeamName.trim(),
          team_id: selectedTeam?.id || undefined,
          opponent_name: opponentName.trim(),
          location: location || undefined,
          game_type: gameType || undefined,
          venue: venue.trim() || undefined,
          period_type: periodType,
          period_time_minutes: periodTimeMinutes,
          game_date: gameDate.toISOString(),
          player_ids: selectedPlayers,
          notes: gameNotes.trim() || undefined,
        },
        token!
      );
      router.replace(`/game/${game.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Team Selection */}
        {teams.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Your Team</Text>
            <Text style={styles.sectionSubtitle}>Choose a team to auto-load roster</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teamScroll}>
              <TouchableOpacity
                style={[
                  styles.teamCard,
                  !selectedTeam && styles.teamCardActive,
                ]}
                onPress={() => handleTeamSelect(null)}
              >
                <Ionicons name="people-outline" size={24} color={!selectedTeam ? colors.text : colors.textSecondary} />
                <Text style={[styles.teamCardText, !selectedTeam && styles.teamCardTextActive]}>
                  All Players
                </Text>
              </TouchableOpacity>
              {teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamCard,
                    selectedTeam?.id === team.id && styles.teamCardActive,
                  ]}
                  onPress={() => handleTeamSelect(team)}
                >
                  <View style={[styles.teamBadge, { backgroundColor: team.color_primary || colors.primary }]}>
                    <Text style={styles.teamBadgeText}>{team.name.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.teamCardText, selectedTeam?.id === team.id && styles.teamCardTextActive]}>
                    {team.name}
                  </Text>
                  <Text style={styles.teamPlayerCount}>
                    {players.filter(p => p.team_id === team.id).length} players
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Game Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Game Info</Text>

          <Input
            label="Your Team Name *"
            value={homeTeamName}
            onChangeText={setHomeTeamName}
            placeholder="e.g., Warriors, Hornets"
          />

          <Input
            label="Opponent Name *"
            value={opponentName}
            onChangeText={setOpponentName}
            placeholder="e.g., Lakers, Eagles"
          />

          {/* Location Dropdown */}
          <View style={styles.dropdownSection}>
            <Text style={styles.label}>Location</Text>
            <View style={styles.optionsRow}>
              {LOCATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    location === option.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setLocation(location === option.value ? null : option.value)}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={20}
                    color={location === option.value ? colors.text : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.optionText,
                      location === option.value && styles.optionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Game Type Dropdown */}
          <View style={styles.dropdownSection}>
            <Text style={styles.label}>Game Type</Text>
            <View style={styles.optionsGrid}>
              {GAME_TYPE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.gameTypeButton,
                    gameType === option.value && styles.gameTypeButtonActive,
                  ]}
                  onPress={() => setGameType(gameType === option.value ? null : option.value)}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={18}
                    color={gameType === option.value ? colors.text : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.gameTypeText,
                      gameType === option.value && styles.gameTypeTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Period Type Selector */}
          <View style={styles.dropdownSection}>
            <Text style={styles.label}>Game Format</Text>
            <View style={styles.optionsRow}>
              {PERIOD_TYPE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.periodButton,
                    periodType === option.value && styles.periodButtonActive,
                  ]}
                  onPress={() => setPeriodType(option.value)}
                >
                  <Text
                    style={[
                      styles.periodLabel,
                      periodType === option.value && styles.periodLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.periodDescription,
                      periodType === option.value && styles.periodDescriptionActive,
                    ]}
                  >
                    {option.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Period Time Selector */}
          <View style={styles.dropdownSection}>
            <Text style={styles.label}>Time Per {periodType === 'quarters' ? 'Quarter' : 'Half'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeOptionsScroll}>
              <View style={styles.timeOptionsRow}>
                {PERIOD_TIME_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.timeButton,
                      periodTimeMinutes === option.value && styles.timeButtonActive,
                    ]}
                    onPress={() => setPeriodTimeMinutes(option.value)}
                  >
                    <Text
                      style={[
                        styles.timeButtonText,
                        periodTimeMinutes === option.value && styles.timeButtonTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Venue (optional text input) */}
          <Input
            label="Venue (Optional)"
            value={venue}
            onChangeText={setVenue}
            placeholder="e.g., Main Gym, City Arena"
          />

          <View style={styles.dateRow}>
            <Text style={styles.label}>Game Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar" size={20} color={colors.primary} />
              <Text style={styles.dateText}>
                {gameDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={gameDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) setGameDate(date);
              }}
            />
          )}

          {/* Game Goals / Notes */}
          <View style={styles.dropdownSection}>
            <Text style={styles.label}>Game Goals / Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={gameNotes}
              onChangeText={setGameNotes}
              placeholder="e.g., Focus on defense, work on 3-point shots, practice new plays..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <Text style={styles.notesHint}>
              <Ionicons name="lock-closed" size={12} color={colors.textSecondary} /> Only you can see these notes
            </Text>
          </View>
        </View>

        {/* Player Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {selectedTeam ? `${selectedTeam.name} Roster` : 'Select Players'}
            </Text>
            <Text style={styles.selectedCount}>
              {selectedPlayers.length} selected
            </Text>
          </View>

          {availablePlayers.length === 0 ? (
            <View style={styles.emptyPlayers}>
              <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>
                {selectedTeam ? `No players in ${selectedTeam.name}` : 'No players yet'}
              </Text>
              <Button
                title="Add Player"
                onPress={() => router.push('/player/new')}
                variant="outline"
                size="small"
                style={{ marginTop: spacing.md }}
              />
            </View>
          ) : (
            <View style={styles.playerGrid}>
              {availablePlayers.map((player) => (
                <Pressable
                  key={player.id}
                  style={[
                    styles.playerCard,
                    selectedPlayers.includes(player.id) && styles.playerSelected,
                  ]}
                  onPress={() => togglePlayer(player.id)}
                >
                  <View style={styles.playerAvatar}>
                    <Text style={styles.avatarText}>
                      {player.name.charAt(0).toUpperCase()}
                    </Text>
                    {player.number && (
                      <View style={styles.numberBadge}>
                        <Text style={styles.numberText}>#{player.number}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {player.name}
                  </Text>
                  {player.position && (
                    <Text style={styles.playerPosition}>{player.position}</Text>
                  )}
                  {selectedPlayers.includes(player.id) && (
                    <View style={styles.checkmark}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Quick Add Player */}
        <TouchableOpacity
          style={styles.addPlayerButton}
          onPress={() => router.push('/player/new')}
        >
          <Ionicons name="person-add" size={20} color={colors.primary} />
          <Text style={styles.addPlayerText}>Add New Player</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Start Game Button */}
      <View style={styles.footer}>
        <Button
          title="Start Game"
          onPress={handleCreateGame}
          loading={loading}
          disabled={!opponentName.trim() || selectedPlayers.length === 0}
          size="large"
          icon={<Ionicons name="play" size={20} color={colors.text} />}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 100,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  selectedCount: {
    color: colors.primary,
    fontSize: 14,
  },
  teamScroll: {
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  teamCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginRight: spacing.sm,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  teamCardActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  teamCardText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  teamCardTextActive: {
    color: colors.text,
  },
  teamBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamBadgeText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  teamPlayerCount: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  dropdownSection: {
    marginBottom: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  optionTextActive: {
    color: colors.text,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gameTypeButton: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  gameTypeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  gameTypeText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  gameTypeTextActive: {
    color: colors.text,
  },
  periodButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodLabel: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  periodLabelActive: {
    color: colors.text,
  },
  periodDescription: {
    color: colors.textSecondary,
    fontSize: 11,
    opacity: 0.7,
  },
  periodDescriptionActive: {
    color: colors.text,
    opacity: 0.8,
  },
  timeOptionsScroll: {
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  timeOptionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 65,
    alignItems: 'center',
  },
  timeButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  timeButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  timeButtonTextActive: {
    color: colors.text,
  },
  dateRow: {
    marginBottom: spacing.md,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dateText: {
    color: colors.text,
    fontSize: 16,
  },
  emptyPlayers: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  playerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  playerCard: {
    width: '31%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  playerSelected: {
    borderColor: colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  playerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    position: 'relative',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  numberBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.secondary,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  numberText: {
    color: colors.text,
    fontSize: 8,
    fontWeight: 'bold',
  },
  playerName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  playerPosition: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  checkmark: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addPlayerText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  notesInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  notesHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
});
