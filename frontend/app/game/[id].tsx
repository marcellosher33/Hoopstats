import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { ScoringButton, StatButton, MissButton } from '../../src/components/StatButton';
import { FullCourtShotChart } from '../../src/components/FullCourtShotChart';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { StatType } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

// Format time as MM:SS
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function LiveGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { currentGame, fetchGame, recordStat, updateGame, addMedia, undoLastStat, adjustStat } = useGameStore();

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showShotChart, setShowShotChart] = useState(false);
  const [pendingShotType, setPendingShotType] = useState<'2pt' | '3pt' | null>(null);
  const [pendingShotMade, setPendingShotMade] = useState(true);
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [opponentScore, setOpponentScore] = useState('0');
  const [ourScore, setOurScore] = useState('0');
  const [teamMode, setTeamMode] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustStatType, setAdjustStatType] = useState<string | null>(null);
  const [adjustStatLabel, setAdjustStatLabel] = useState<string>('');
  
  // New state for minutes tracking and active players
  const [playerMinutes, setPlayerMinutes] = useState<Record<string, number>>({});
  const [activePlayerIds, setActivePlayerIds] = useState<Set<string>>(new Set());
  const [isClockRunning, setIsClockRunning] = useState(false); // Single player mode clock
  const minutesIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Stats filter by period (null = all periods)
  const [statsFilterPeriod, setStatsFilterPeriod] = useState<number | null>(null);
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraZoom, setCameraZoom] = useState(0);

  useEffect(() => {
    if (token && id) {
      fetchGame(id, token);
    }
  }, [token, id]);

  useEffect(() => {
    if (currentGame) {
      setOpponentScore(currentGame.opponent_score.toString());
      setOurScore(currentGame.our_score.toString());
      
      // Initialize minutes for all players
      const initialMinutes: Record<string, number> = {};
      currentGame.player_stats.forEach(ps => {
        initialMinutes[ps.player_id] = playerMinutes[ps.player_id] || 0;
      });
      setPlayerMinutes(prev => ({ ...initialMinutes, ...prev }));
    }
  }, [currentGame]);

  // Minutes tracking interval for team mode
  useEffect(() => {
    if (teamMode && activePlayerIds.size > 0) {
      minutesIntervalRef.current = setInterval(() => {
        setPlayerMinutes(prev => {
          const updated = { ...prev };
          activePlayerIds.forEach(playerId => {
            updated[playerId] = (updated[playerId] || 0) + 1;
          });
          return updated;
        });
      }, 1000);
    } else if (minutesIntervalRef.current) {
      clearInterval(minutesIntervalRef.current);
      minutesIntervalRef.current = null;
    }

    return () => {
      if (minutesIntervalRef.current) {
        clearInterval(minutesIntervalRef.current);
      }
    };
  }, [teamMode, activePlayerIds]);

  // Single player mode clock
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (!teamMode && isClockRunning && selectedPlayer) {
      interval = setInterval(() => {
        setPlayerMinutes(prev => ({
          ...prev,
          [selectedPlayer]: (prev[selectedPlayer] || 0) + 1
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [teamMode, isClockRunning, selectedPlayer]);

  const toggleActivePlayer = (playerId: string) => {
    setActivePlayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        if (newSet.size >= 5) {
          Alert.alert('Max Players', 'Only 5 players can be on the court at a time');
          return prev;
        }
        newSet.add(playerId);
      }
      return newSet;
    });
  };

  const selectedPlayerStats = currentGame?.player_stats.find(
    ps => ps.player_id === selectedPlayer
  );

  // Helper function to calculate stats from shots filtered by period
  const getFilteredStats = (playerStats: typeof selectedPlayerStats) => {
    if (!playerStats) return null;
    
    // If no filter, return original stats
    if (statsFilterPeriod === null) {
      return playerStats.stats;
    }
    
    // Calculate stats from filtered shots
    const filteredShots = playerStats.shots.filter(
      shot => (shot.period || shot.quarter) === statsFilterPeriod
    );
    
    // Calculate stats from shots
    let points = 0;
    let fg_made = 0;
    let fg_attempted = 0;
    let three_pt_made = 0;
    let three_pt_attempted = 0;
    
    filteredShots.forEach(shot => {
      if (shot.shot_type === '3pt') {
        three_pt_attempted++;
        if (shot.made) {
          three_pt_made++;
          fg_made++;
          points += 3;
        }
        fg_attempted++;
      } else if (shot.shot_type === '2pt') {
        fg_attempted++;
        if (shot.made) {
          fg_made++;
          points += 2;
        }
      }
    });
    
    // For non-shot stats, we don't have period-level tracking yet,
    // so show the full game stats with a note
    return {
      ...playerStats.stats,
      points,
      fg_made,
      fg_attempted,
      three_pt_made,
      three_pt_attempted,
      // Keep other stats as totals (they aren't tracked by period currently)
    };
  };

  // Get filtered shots for the shot chart
  const getFilteredShots = (shots: typeof selectedPlayerStats.shots) => {
    if (!shots) return [];
    if (statsFilterPeriod === null) return shots;
    return shots.filter(shot => (shot.period || shot.quarter) === statsFilterPeriod);
  };

  // Get the filtered stats for display
  const filteredStats = selectedPlayerStats ? getFilteredStats(selectedPlayerStats) : null;

  const handleStatPress = async (statType: StatType, shotLocation?: { x: number; y: number }) => {
    if (!selectedPlayer || !token || !id) {
      Alert.alert('Select Player', 'Please select a player first');
      return;
    }
    try {
      await recordStat(id, selectedPlayer, statType, token, shotLocation);
    } catch (error) {
      console.error('Failed to record stat:', error);
    }
  };

  const handleTeamStatPress = async (playerId: string, statType: StatType, shotLocation?: { x: number; y: number }) => {
    if (!token || !id) return;
    try {
      await recordStat(id, playerId, statType, token, shotLocation);
    } catch (error) {
      console.error('Failed to record stat:', error);
    }
  };

  const handleUndo = async () => {
    if (!token || !id) return;
    const success = await undoLastStat(id, token);
    if (success) {
      Alert.alert('Success', 'Last stat undone');
    } else {
      Alert.alert('Error', 'No stats to undo');
    }
  };

  const handleLongPressAdjust = (statType: string, label: string, playerId?: string) => {
    const targetPlayer = playerId || selectedPlayer;
    if (!targetPlayer) {
      Alert.alert('Select Player', 'Please select a player first');
      return;
    }
    if (playerId) {
      setSelectedPlayer(playerId);
    }
    setAdjustStatType(statType);
    setAdjustStatLabel(label);
    setShowAdjustModal(true);
  };

  const handleAdjustStat = async (adjustment: number) => {
    if (!token || !id || !selectedPlayer || !adjustStatType) return;
    await adjustStat(id, selectedPlayer, adjustStatType, adjustment, token);
    setShowAdjustModal(false);
    setAdjustStatType(null);
  };

  const handleShotChartPress = (x: number, y: number) => {
    if (!pendingShotType) return;
    
    let statType: StatType;
    if (pendingShotMade) {
      statType = pendingShotType === '3pt' ? 'points_3' : 'points_2';
    } else {
      statType = pendingShotType === '3pt' ? 'miss_3' : 'miss_2';
    }
    
    handleStatPress(statType, { x, y });
    setShowShotChart(false);
    setPendingShotType(null);
    setPendingShotMade(true);
  };

  // Team mode shot chart handler
  const handleTeamShotChartPress = (playerId: string, x: number, y: number, shotType: '2pt' | '3pt', made: boolean) => {
    if (!token || !id) return;
    
    let statType: StatType;
    if (made) {
      statType = shotType === '3pt' ? 'points_3' : 'points_2';
    } else {
      statType = shotType === '3pt' ? 'miss_3' : 'miss_2';
    }
    
    handleTeamStatPress(playerId, statType, { x, y });
  };

  const handleTakePhoto = async () => {
    if (!cameraRef.current) return;
    
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (photo?.base64 && token && id) {
        await addMedia(id, 'photo', `data:image/jpeg;base64,${photo.base64}`, token, {
          quarter: currentGame?.current_period || 1,
        });
        Alert.alert('Success', 'Photo saved!');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
    setShowCamera(false);
  };

  const handleQuarterChange = async (newPeriod: number) => {
    if (!token || !id) return;
    await updateGame(id, { current_period: newPeriod }, token);
  };

  const handleScoreUpdate = async () => {
    if (!token || !id) return;
    const newOurScore = parseInt(ourScore, 10) || 0;
    const newOpponentScore = parseInt(opponentScore, 10) || 0;
    await updateGame(id, { 
      our_score: newOurScore, 
      opponent_score: newOpponentScore 
    }, token);
    setShowScoreModal(false);
  };

  // Opponent score quick buttons
  const handleOpponentScore = async (points: number) => {
    if (!token || !id || !currentGame) return;
    const newOpponentScore = currentGame.opponent_score + points;
    await updateGame(id, { opponent_score: newOpponentScore }, token);
  };

  const handleEndGame = async () => {
    if (!token || !id) return;
    await updateGame(id, { 
      status: 'completed', 
      opponent_score: parseInt(opponentScore, 10) || 0 
    }, token);
    setShowEndGameModal(false);
    router.replace(`/game/summary/${id}`);
  };

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos');
        return;
      }
    }
    setShowCamera(true);
  };

  if (!currentGame) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading game...</Text>
      </View>
    );
  }

  // Use filtered stats instead of raw stats
  const stats = filteredStats;

  // Sort players: active (in) first, then bench (out)
  const sortedPlayerStats = [...currentGame.player_stats].sort((a, b) => {
    const aActive = activePlayerIds.has(a.player_id);
    const bActive = activePlayerIds.has(b.player_id);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return 0;
  });

  const inPlayers = sortedPlayerStats.filter(ps => activePlayerIds.has(ps.player_id));
  const outPlayers = sortedPlayerStats.filter(ps => !activePlayerIds.has(ps.player_id));

  return (
    <View style={styles.container}>
      {/* Game Header - Scoreboard */}
      <LinearGradient
        colors={['#1A1A2E', '#16213E']}
        style={styles.header}
      >
        <TouchableOpacity style={styles.scoreBoard} onPress={() => setShowScoreModal(true)}>
          <View style={styles.teamScore}>
            <Text style={styles.teamLabel}>{currentGame.home_team_name?.toUpperCase() || 'YOUR TEAM'}</Text>
            <Text style={styles.score}>{currentGame.our_score}</Text>
          </View>
          <View style={styles.gameInfo}>
            <View style={styles.quarterBadge}>
              <Text style={styles.quarterText}>
                {currentGame.period_type === 'halves' 
                  ? `H${currentGame.current_period || 1}` 
                  : `Q${currentGame.current_period || 1}`}
              </Text>
            </View>
            <Text style={styles.vsText}>VS</Text>
            <TouchableOpacity style={styles.editScoreHint}>
              <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.editHintText}>Tap to edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.teamScore}>
            <Text style={styles.teamLabel}>{currentGame.opponent_name.toUpperCase()}</Text>
            <Text style={styles.score}>{currentGame.opponent_score}</Text>
            {/* Opponent Quick Score Buttons */}
            <View style={styles.opponentQuickScore}>
              <TouchableOpacity 
                style={styles.opponentScoreBtn}
                onPress={() => handleOpponentScore(1)}
              >
                <Text style={styles.opponentScoreBtnText}>+1</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.opponentScoreBtn}
                onPress={() => handleOpponentScore(2)}
              >
                <Text style={styles.opponentScoreBtnText}>+2</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.opponentScoreBtn}
                onPress={() => handleOpponentScore(3)}
              >
                <Text style={styles.opponentScoreBtnText}>+3</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>

        {/* Period Controls */}
        <View style={styles.quarterControls}>
          {(currentGame.period_type === 'halves' ? [1, 2] : [1, 2, 3, 4]).map(p => (
            <TouchableOpacity
              key={p}
              style={[
                styles.quarterBtn,
                (currentGame.current_period || 1) === p && styles.quarterBtnActive,
              ]}
              onPress={() => handleQuarterChange(p)}
            >
              <Text style={[
                styles.quarterBtnText,
                (currentGame.current_period || 1) === p && styles.quarterBtnTextActive,
              ]}>
                {currentGame.period_type === 'halves' ? `H${p}` : `Q${p}`}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.quarterBtn, (currentGame.current_period || 1) > 4 && styles.quarterBtnActive]}
            onPress={() => handleQuarterChange(5)}
          >
            <Text style={[styles.quarterBtnText, (currentGame.current_period || 1) > 4 && styles.quarterBtnTextActive]}>OT</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, !teamMode && styles.modeBtnActive]}
          onPress={() => setTeamMode(false)}
        >
          <Ionicons name="person" size={16} color={!teamMode ? colors.text : colors.textSecondary} />
          <Text style={[styles.modeBtnText, !teamMode && styles.modeBtnTextActive]}>Single Player</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, teamMode && styles.modeBtnActive]}
          onPress={() => setTeamMode(true)}
        >
          <Ionicons name="people" size={16} color={teamMode ? colors.text : colors.textSecondary} />
          <Text style={[styles.modeBtnText, teamMode && styles.modeBtnTextActive]}>Team Mode</Text>
        </TouchableOpacity>
      </View>

      {teamMode ? (
        /* Team Mode - In/Out Players View */
        <ScrollView style={styles.teamModeContainer} contentContainerStyle={styles.teamModeContent}>
          <Text style={styles.teamModeTitle}>Tap IN/OUT to manage lineup • Tap stat to record</Text>
          
          {/* ON COURT Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name="basketball" size={18} color={colors.success} />
              <Text style={styles.sectionTitle}>ON COURT ({inPlayers.length}/5)</Text>
            </View>
            
            {inPlayers.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>Tap "IN" on players below to put them on court</Text>
              </View>
            ) : (
              inPlayers.map((ps) => (
                <TeamPlayerRow
                  key={ps.player_id}
                  player={ps}
                  isActive={true}
                  minutes={playerMinutes[ps.player_id] || 0}
                  onToggleActive={() => toggleActivePlayer(ps.player_id)}
                  onStatPress={(statType) => handleTeamStatPress(ps.player_id, statType)}
                  onShotPress={(shotType, made) => {
                    setSelectedPlayer(ps.player_id);
                    setPendingShotType(shotType);
                    setPendingShotMade(made);
                    setShowShotChart(true);
                  }}
                  onLongPress={(statType, label) => handleLongPressAdjust(statType, label, ps.player_id)}
                  token={token}
                  gameId={id}
                />
              ))
            )}
          </View>

          {/* BENCH Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people" size={18} color={colors.textSecondary} />
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>BENCH ({outPlayers.length})</Text>
            </View>
            
            {outPlayers.map((ps) => (
              <TeamPlayerRow
                key={ps.player_id}
                player={ps}
                isActive={false}
                minutes={playerMinutes[ps.player_id] || 0}
                onToggleActive={() => toggleActivePlayer(ps.player_id)}
                onStatPress={(statType) => handleTeamStatPress(ps.player_id, statType)}
                onShotPress={(shotType, made) => {
                  setSelectedPlayer(ps.player_id);
                  setPendingShotType(shotType);
                  setPendingShotMade(made);
                  setShowShotChart(true);
                }}
                onLongPress={(statType, label) => handleLongPressAdjust(statType, label, ps.player_id)}
                token={token}
                gameId={id}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <>
          {/* Single Player Mode */}
          {/* Player Selection */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerScroll}>
            {currentGame.player_stats.map((ps) => (
              <TouchableOpacity
                key={ps.player_id}
                style={[
                  styles.playerChip,
                  selectedPlayer === ps.player_id && styles.playerChipActive,
                ]}
                onPress={() => setSelectedPlayer(ps.player_id)}
              >
                <View style={[styles.playerAvatar, selectedPlayer === ps.player_id && styles.playerAvatarActive]}>
                  <Text style={styles.playerInitial}>{ps.player_name.charAt(0)}</Text>
                </View>
                <Text style={[
                  styles.playerChipText,
                  selectedPlayer === ps.player_id && styles.playerChipTextActive,
                ]}>
                  {ps.player_name}
                </Text>
                <Text style={styles.playerPoints}>{ps.stats.points || 0} pts</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Stats Dashboard */}
          <ScrollView style={styles.statsArea} contentContainerStyle={styles.statsContent}>
            {selectedPlayer ? (
              <>
                {/* Minutes Tracker */}
                <View style={styles.minutesTracker}>
                  <View style={styles.minutesDisplay}>
                    <Ionicons name="time-outline" size={20} color={colors.text} />
                    <Text style={styles.minutesText}>
                      {formatTime(playerMinutes[selectedPlayer] || 0)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.clockToggleBtn,
                      isClockRunning && styles.clockToggleBtnActive
                    ]}
                    onPress={() => setIsClockRunning(!isClockRunning)}
                  >
                    <Ionicons 
                      name={isClockRunning ? "pause" : "play"} 
                      size={20} 
                      color={isClockRunning ? colors.error : colors.success} 
                    />
                    <Text style={[
                      styles.clockToggleText,
                      isClockRunning && styles.clockToggleTextActive
                    ]}>
                      {isClockRunning ? 'OUT' : 'IN'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Period Filter for Stats */}
                <View style={styles.periodFilter}>
                  <Text style={styles.periodFilterLabel}>View Stats:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodFilterScroll}>
                    <TouchableOpacity
                      style={[
                        styles.periodFilterBtn,
                        statsFilterPeriod === null && styles.periodFilterBtnActive
                      ]}
                      onPress={() => setStatsFilterPeriod(null)}
                    >
                      <Text style={[
                        styles.periodFilterBtnText,
                        statsFilterPeriod === null && styles.periodFilterBtnTextActive
                      ]}>ALL</Text>
                    </TouchableOpacity>
                    {(currentGame.period_type === 'halves' ? [1, 2] : [1, 2, 3, 4]).map(p => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.periodFilterBtn,
                          statsFilterPeriod === p && styles.periodFilterBtnActive
                        ]}
                        onPress={() => setStatsFilterPeriod(p)}
                      >
                        <Text style={[
                          styles.periodFilterBtnText,
                          statsFilterPeriod === p && styles.periodFilterBtnTextActive
                        ]}>
                          {currentGame.period_type === 'halves' ? `H${p}` : `Q${p}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Scoring Buttons */}
                <View style={styles.statSection}>
                  <Text style={styles.statSectionTitle}>SCORING (Long-press to adjust)</Text>
                  <View style={styles.scoringRow}>
                    <ScoringButton
                      points={2}
                      label="2PT"
                      value={(stats?.fg_made || 0) - (stats?.three_pt_made || 0)}
                      onPress={() => {
                        setPendingShotType('2pt');
                        setPendingShotMade(true);
                        setShowShotChart(true);
                      }}
                      onLongPress={() => handleLongPressAdjust('points', 'Points')}
                    />
                    <ScoringButton
                      points={3}
                      label="3PT"
                      value={stats?.three_pt_made}
                      onPress={() => {
                        setPendingShotType('3pt');
                        setPendingShotMade(true);
                        setShowShotChart(true);
                      }}
                      onLongPress={() => handleLongPressAdjust('points', 'Points')}
                    />
                    <ScoringButton
                      points={1}
                      label="FT"
                      value={stats?.ft_made}
                      onPress={() => handleStatPress('ft_made')}
                      onLongPress={() => handleLongPressAdjust('ft_made', 'Free Throws Made')}
                    />
                  </View>
                  <View style={styles.missRow}>
                    <MissButton 
                      label="Miss 2PT" 
                      onPress={() => {
                        setPendingShotType('2pt');
                        setPendingShotMade(false);
                        setShowShotChart(true);
                      }}
                      onLongPress={() => handleLongPressAdjust('fg_attempted', 'FG Attempted')}
                    />
                    <MissButton 
                      label="Miss 3PT" 
                      onPress={() => {
                        setPendingShotType('3pt');
                        setPendingShotMade(false);
                        setShowShotChart(true);
                      }}
                      onLongPress={() => handleLongPressAdjust('three_pt_attempted', '3PT Attempted')}
                    />
                    <MissButton 
                      label="Miss FT" 
                      onPress={() => handleStatPress('ft_missed')}
                      onLongPress={() => handleLongPressAdjust('ft_attempted', 'FT Attempted')}
                    />
                  </View>
                </View>

                {/* Rebounds */}
                <View style={styles.statSection}>
                  <Text style={styles.statSectionTitle}>REBOUNDS (Long-press to adjust)</Text>
                  <View style={styles.statGrid}>
                    <StatButton
                      label="OREB"
                      value={stats?.offensive_rebounds}
                      variant="stat"
                      onPress={() => handleStatPress('offensive_rebounds')}
                      onLongPress={() => handleLongPressAdjust('offensive_rebounds', 'Offensive Rebounds')}
                    />
                    <StatButton
                      label="DREB"
                      value={stats?.defensive_rebounds}
                      variant="stat"
                      onPress={() => handleStatPress('defensive_rebounds')}
                      onLongPress={() => handleLongPressAdjust('defensive_rebounds', 'Defensive Rebounds')}
                    />
                  </View>
                </View>

                {/* Other Stats */}
                <View style={styles.statSection}>
                  <Text style={styles.statSectionTitle}>STATS (Long-press to adjust)</Text>
                  <View style={styles.statGrid}>
                    <StatButton
                      label="AST"
                      value={stats?.assists}
                      variant="stat"
                      onPress={() => handleStatPress('assists')}
                      onLongPress={() => handleLongPressAdjust('assists', 'Assists')}
                    />
                    <StatButton
                      label="STL"
                      value={stats?.steals}
                      variant="stat"
                      onPress={() => handleStatPress('steals')}
                      onLongPress={() => handleLongPressAdjust('steals', 'Steals')}
                    />
                    <StatButton
                      label="BLK"
                      value={stats?.blocks}
                      variant="stat"
                      onPress={() => handleStatPress('blocks')}
                      onLongPress={() => handleLongPressAdjust('blocks', 'Blocks')}
                    />
                  </View>
                  <View style={styles.statGrid}>
                    <StatButton
                      label="TO"
                      value={stats?.turnovers}
                      variant="negative"
                      onPress={() => handleStatPress('turnovers')}
                      onLongPress={() => handleLongPressAdjust('turnovers', 'Turnovers')}
                    />
                    <StatButton
                      label="FOUL"
                      value={stats?.fouls}
                      variant="negative"
                      onPress={() => handleStatPress('fouls')}
                      onLongPress={() => handleLongPressAdjust('fouls', 'Fouls')}
                    />
                  </View>
                </View>

                {/* Player Stats Summary Card */}
                <View style={styles.playerStatsCard}>
                  <LinearGradient
                    colors={['#252540', '#1A1A2E']}
                    style={styles.statsCardGradient}
                  >
                    <View style={styles.playerStatsTitleRow}>
                      <Text style={styles.playerStatsTitle}>{selectedPlayerStats?.player_name}</Text>
                      {statsFilterPeriod !== null && (
                        <View style={styles.periodBadge}>
                          <Text style={styles.periodBadgeText}>
                            {currentGame.period_type === 'halves' ? `H${statsFilterPeriod}` : `Q${statsFilterPeriod}`}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.playerStatsGrid}>
                      <View style={styles.playerStatItem}>
                        <Text style={[styles.playerStatValue, { color: colors.points }]}>{stats?.points || 0}</Text>
                        <Text style={styles.playerStatLabel}>PTS</Text>
                      </View>
                      <View style={styles.playerStatItem}>
                        <Text style={[styles.playerStatValue, { color: colors.rebounds }]}>{(stats?.offensive_rebounds || 0) + (stats?.defensive_rebounds || 0)}</Text>
                        <Text style={styles.playerStatLabel}>REB</Text>
                      </View>
                      <View style={styles.playerStatItem}>
                        <Text style={[styles.playerStatValue, { color: colors.assists }]}>{stats?.assists || 0}</Text>
                        <Text style={styles.playerStatLabel}>AST</Text>
                      </View>
                      <View style={styles.playerStatItem}>
                        <Text style={styles.playerStatValue}>
                          {stats?.fg_attempted ? Math.round((stats.fg_made / stats.fg_attempted) * 100) : 0}%
                        </Text>
                        <Text style={styles.playerStatLabel}>FG%</Text>
                      </View>
                      <View style={styles.playerStatItem}>
                        <Text style={styles.playerStatValue}>
                          {formatTime(playerMinutes[selectedPlayer] || 0)}
                        </Text>
                        <Text style={styles.playerStatLabel}>MIN</Text>
                      </View>
                    </View>
                    {statsFilterPeriod !== null && (
                      <Text style={styles.filterNote}>
                        *REB, AST, MIN show full game totals
                      </Text>
                    )}
                  </LinearGradient>
                </View>
              </>
            ) : (
              <View style={styles.selectPlayerPrompt}>
                <Ionicons name="person-circle-outline" size={64} color={colors.textSecondary} />
                <Text style={styles.selectPlayerText}>Select a player above</Text>
                <Text style={styles.selectPlayerSubtext}>to start recording stats</Text>
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* Bottom Action Bar */}
      <LinearGradient
        colors={['#1A1A2E', '#0F0F1A']}
        style={styles.actionBar}
      >
        <TouchableOpacity style={styles.actionBtn} onPress={handleUndo}>
          <Ionicons name="arrow-undo" size={26} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openCamera()}>
          <Ionicons name="camera" size={26} color={colors.text} />
          <Text style={styles.actionBtnText}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endGameBtn} onPress={() => setShowEndGameModal(true)}>
          <Ionicons name="flag" size={26} color={colors.text} />
          <Text style={styles.endGameBtnText}>End Game</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Score Edit Modal */}
      <Modal visible={showScoreModal} animationType="fade" transparent>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.scoreModal}>
            <Text style={styles.modalTitle}>Edit Score</Text>
            
            <View style={styles.scoreInputRow}>
              <View style={styles.scoreInputGroup}>
                <Text style={styles.scoreInputLabel}>{currentGame.home_team_name || 'Your Team'}</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={ourScore}
                  onChangeText={setOurScore}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  maxLength={3}
                />
              </View>
              <Text style={styles.scoreDash}>-</Text>
              <View style={styles.scoreInputGroup}>
                <Text style={styles.scoreInputLabel}>{currentGame.opponent_name}</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={opponentScore}
                  onChangeText={setOpponentScore}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  maxLength={3}
                />
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => {
                  setOurScore(currentGame.our_score.toString());
                  setOpponentScore(currentGame.opponent_score.toString());
                  setShowScoreModal(false);
                }}
                variant="ghost"
                style={{ flex: 1 }}
              />
              <Button
                title="Save"
                onPress={handleScoreUpdate}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Shot Chart Modal - Full Court */}
      <Modal visible={showShotChart} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.shotChartModal}>
            <Text style={styles.modalTitle}>Tap Shot Location</Text>
            <Text style={[
              styles.modalSubtitle,
              !pendingShotMade && styles.missedShotSubtitle
            ]}>
              {pendingShotMade ? '✓ Made' : '✗ Missed'} {pendingShotType === '3pt' ? '3-Point Shot' : '2-Point Shot'}
            </Text>
            <FullCourtShotChart
              shots={getFilteredShots(selectedPlayerStats?.shots || [])}
              onCourtPress={handleShotChartPress}
              width={screenWidth - 64}
              height={(screenWidth - 64) * 1.6}
              interactive
            />
            <Button
              title="Cancel"
              onPress={() => {
                setShowShotChart(false);
                setPendingShotType(null);
                setPendingShotMade(true);
              }}
              variant="ghost"
            />
          </View>
        </View>
      </Modal>

      {/* Camera Modal */}
      <Modal visible={showCamera} animationType="slide">
        <View style={styles.cameraContainer}>
          <View style={[styles.modeBanner, styles.modeBannerPhoto]}>
            <Ionicons name="camera" size={24} color="white" />
            <Text style={styles.modeBannerText}>PHOTO MODE</Text>
          </View>

          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            mode="picture"
            zoom={cameraZoom}
          />
          
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => {
                  setCameraZoom(0);
                  setShowCamera(false);
                }}
              >
                <Ionicons name="close" size={28} color="white" />
              </TouchableOpacity>
              
              <View style={styles.zoomIndicator}>
                <Text style={styles.zoomText}>{(1 + cameraZoom * 7).toFixed(1)}x</Text>
              </View>
            </View>
            
            <View style={styles.zoomControlsContainer}>
              <View style={styles.zoomControls}>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom === 0 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom === 0 && styles.zoomBtnTextActive]}>1x</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom > 0 && cameraZoom <= 0.15 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0.125)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom > 0 && cameraZoom <= 0.15 && styles.zoomBtnTextActive]}>2x</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom > 0.15 && cameraZoom <= 0.35 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0.285)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom > 0.15 && cameraZoom <= 0.35 && styles.zoomBtnTextActive]}>3x</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom > 0.35 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0.57)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom > 0.35 && styles.zoomBtnTextActive]}>5x</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.zoomFineControls}>
                <TouchableOpacity 
                  style={styles.zoomFineBtn}
                  onPress={() => setCameraZoom(Math.max(0, cameraZoom - 0.05))}
                >
                  <Ionicons name="remove-circle" size={36} color="white" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.zoomFineBtn}
                  onPress={() => setCameraZoom(Math.min(1, cameraZoom + 0.05))}
                >
                  <Ionicons name="add-circle" size={36} color="white" />
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.cameraControls}>
              <TouchableOpacity style={styles.captureBtn} onPress={handleTakePhoto}>
                <View style={styles.captureBtnInner} />
              </TouchableOpacity>
              
              <Text style={styles.captureModeLabel}>Tap to capture</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* End Game Modal */}
      <Modal visible={showEndGameModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.endGameModal}>
            <Text style={styles.modalTitle}>End Game?</Text>
            <Text style={styles.modalSubtitle}>Final Score</Text>
            <View style={styles.finalScoreRow}>
              <View style={styles.finalScoreTeam}>
                <Text style={styles.finalScoreLabel}>{currentGame.home_team_name || 'Your Team'}</Text>
                <Text style={styles.finalScore}>{currentGame.our_score}</Text>
              </View>
              <Text style={styles.finalScoreVs}>-</Text>
              <View style={styles.finalScoreTeam}>
                <Text style={styles.finalScoreLabel}>{currentGame.opponent_name}</Text>
                <Text style={styles.finalScore}>{currentGame.opponent_score}</Text>
              </View>
            </View>
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => setShowEndGameModal(false)}
                variant="ghost"
                style={{ flex: 1 }}
              />
              <Button
                title="End Game"
                onPress={handleEndGame}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Stat Adjustment Modal */}
      <Modal visible={showAdjustModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.adjustModal}>
            <Text style={styles.modalTitle}>Adjust {adjustStatLabel}</Text>
            <Text style={styles.modalSubtitle}>Current: {
              adjustStatType && selectedPlayerStats?.stats 
                ? (selectedPlayerStats.stats as any)[adjustStatType] || 0 
                : 0
            }</Text>
            <View style={styles.adjustButtons}>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleAdjustStat(-1)}
              >
                <Ionicons name="remove-circle" size={48} color={colors.error} />
                <Text style={styles.adjustBtnLabel}>-1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleAdjustStat(1)}
              >
                <Ionicons name="add-circle" size={48} color={colors.success} />
                <Text style={styles.adjustBtnLabel}>+1</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.adjustCloseBtn}
              onPress={() => setShowAdjustModal(false)}
            >
              <Text style={styles.adjustCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Team Player Row Component
interface TeamPlayerRowProps {
  player: any;
  isActive: boolean;
  minutes: number;
  onToggleActive: () => void;
  onStatPress: (statType: StatType) => void;
  onShotPress: (shotType: '2pt' | '3pt', made: boolean) => void;
  onLongPress: (statType: string, label: string) => void;
  token: string | null;
  gameId: string | undefined;
}

const TeamPlayerRow: React.FC<TeamPlayerRowProps> = ({
  player,
  isActive,
  minutes,
  onToggleActive,
  onStatPress,
  onShotPress,
  onLongPress,
}) => {
  return (
    <View style={[
      styles.teamModePlayerRow,
      isActive && styles.teamModePlayerRowActive
    ]}>
      <View style={styles.teamModePlayerHeader}>
        <TouchableOpacity 
          style={[
            styles.inOutToggle,
            isActive ? styles.inOutToggleIn : styles.inOutToggleOut
          ]}
          onPress={onToggleActive}
        >
          <Text style={styles.inOutToggleText}>{isActive ? 'IN' : 'OUT'}</Text>
        </TouchableOpacity>
        
        <View style={styles.teamModePlayerInfo}>
          <View style={[styles.teamModeAvatar, isActive && styles.teamModeAvatarActive]}>
            <Text style={styles.teamModeAvatarText}>{player.player_name.charAt(0)}</Text>
          </View>
          <View style={styles.teamModePlayerDetails}>
            <Text style={styles.teamModePlayerName}>{player.player_name}</Text>
            <View style={styles.teamModePlayerMiniStats}>
              <Text style={styles.teamModePlayerPoints}>{player.stats.points || 0} pts</Text>
              <Text style={styles.teamModePlayerMinutes}>{formatTime(minutes)}</Text>
            </View>
          </View>
        </View>
      </View>
      
      {/* Stat Buttons - Two rows for more buttons */}
      <View style={styles.teamModeStatsContainer}>
        {/* Scoring Row */}
        <View style={styles.teamModeQuickStats}>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnMade]}
            onPress={() => onShotPress('2pt', true)}
            onLongPress={() => onLongPress('points', 'Points')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>+2</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnMade]}
            onPress={() => onShotPress('3pt', true)}
            onLongPress={() => onLongPress('points', 'Points')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>+3</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnFT]}
            onPress={() => onStatPress('ft_made')}
            onLongPress={() => onLongPress('ft_made', 'FT Made')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>FT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnMiss]}
            onPress={() => onShotPress('2pt', false)}
          >
            <Text style={styles.teamModeStatBtnTextSmall}>Miss2</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnMiss]}
            onPress={() => onShotPress('3pt', false)}
          >
            <Text style={styles.teamModeStatBtnTextSmall}>Miss3</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnMiss]}
            onPress={() => onStatPress('ft_missed')}
          >
            <Text style={styles.teamModeStatBtnTextSmall}>MissFT</Text>
          </TouchableOpacity>
        </View>
        
        {/* Other Stats Row */}
        <View style={styles.teamModeQuickStats}>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnOreb]}
            onPress={() => onStatPress('offensive_rebounds')}
            onLongPress={() => onLongPress('offensive_rebounds', 'Off Rebounds')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>OR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnDreb]}
            onPress={() => onStatPress('defensive_rebounds')}
            onLongPress={() => onLongPress('defensive_rebounds', 'Def Rebounds')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>DR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnAst]}
            onPress={() => onStatPress('assists')}
            onLongPress={() => onLongPress('assists', 'Assists')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>AST</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnStl]}
            onPress={() => onStatPress('steals')}
            onLongPress={() => onLongPress('steals', 'Steals')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>STL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnBlk]}
            onPress={() => onStatPress('blocks')}
            onLongPress={() => onLongPress('blocks', 'Blocks')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>BLK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnTo]}
            onPress={() => onStatPress('turnovers')}
            onLongPress={() => onLongPress('turnovers', 'Turnovers')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>TO</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.teamModeStatBtn, styles.teamModeStatBtnFoul]}
            onPress={() => onStatPress('fouls')}
            onLongPress={() => onLongPress('fouls', 'Fouls')}
            delayLongPress={500}
          >
            <Text style={styles.teamModeStatBtnText}>FOU</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.text,
    fontSize: 16,
  },
  header: {
    padding: spacing.md,
    paddingTop: spacing.sm,
  },
  scoreBoard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  teamScore: {
    flex: 1,
    alignItems: 'center',
  },
  teamLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  score: {
    color: colors.text,
    fontSize: 42,
    fontWeight: 'bold',
  },
  opponentQuickScore: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  opponentScoreBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  opponentScoreBtnText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: 'bold',
  },
  gameInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  quarterBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  quarterText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  vsText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  editScoreHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  editHintText: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  quarterControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  quarterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  quarterBtnActive: {
    backgroundColor: colors.primary,
  },
  quarterBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  quarterBtnTextActive: {
    color: colors.text,
  },
  // Minutes Tracker
  minutesTracker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  minutesDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  minutesText: {
    color: colors.text,
    fontSize: 28,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  clockToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    gap: spacing.xs,
    borderWidth: 2,
    borderColor: colors.success,
  },
  clockToggleBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: colors.error,
  },
  clockToggleText: {
    color: colors.success,
    fontSize: 16,
    fontWeight: 'bold',
  },
  clockToggleTextActive: {
    color: colors.error,
  },
  // Period Filter Styles
  periodFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  periodFilterLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  periodFilterScroll: {
    flexGrow: 0,
  },
  periodFilterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    marginRight: spacing.xs,
  },
  periodFilterBtnActive: {
    backgroundColor: colors.primary,
  },
  periodFilterBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  periodFilterBtnTextActive: {
    color: colors.text,
  },
  playerScroll: {
    maxHeight: 90,
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
  },
  playerChip: {
    alignItems: 'center',
    marginHorizontal: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    minWidth: 80,
  },
  playerChipActive: {
    backgroundColor: colors.primary,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  playerAvatarActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  playerInitial: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  playerChipText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 11,
  },
  playerChipTextActive: {
    color: colors.text,
  },
  playerPoints: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  statsArea: {
    flex: 1,
  },
  statsContent: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  statSection: {
    marginBottom: spacing.lg,
  },
  statSectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  scoringRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  missRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  selectPlayerPrompt: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  selectPlayerText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  selectPlayerSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  playerStatsCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  statsCardGradient: {
    padding: spacing.md,
  },
  playerStatsTitle: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  playerStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  playerStatItem: {
    alignItems: 'center',
  },
  playerStatValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  playerStatLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  actionBar: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  actionBtnText: {
    color: colors.text,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  endGameBtn: {
    flex: 1,
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  endGameBtnText: {
    color: colors.text,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  scoreModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
  },
  scoreInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  scoreInputGroup: {
    alignItems: 'center',
  },
  scoreInputLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  scoreInput: {
    backgroundColor: colors.surfaceLight,
    color: colors.text,
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 120,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  scoreDash: {
    color: colors.textSecondary,
    fontSize: 36,
    marginHorizontal: spacing.md,
  },
  shotChartModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    maxHeight: '90%',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: colors.success,
    marginBottom: spacing.md,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  missedShotSubtitle: {
    color: colors.error,
  },
  endGameModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
  },
  finalScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  finalScoreTeam: {
    flex: 1,
    alignItems: 'center',
  },
  finalScoreLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  finalScore: {
    color: colors.text,
    fontSize: 48,
    fontWeight: 'bold',
  },
  finalScoreVs: {
    color: colors.textSecondary,
    fontSize: 24,
    marginHorizontal: spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  modeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  modeBannerPhoto: {
    backgroundColor: colors.primary,
  },
  modeBannerText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomIndicator: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  zoomText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  zoomControlsContainer: {
    position: 'absolute',
    bottom: 180,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.md,
  },
  zoomControls: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: borderRadius.full,
    padding: 4,
    gap: 4,
  },
  zoomBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    minWidth: 44,
    alignItems: 'center',
  },
  zoomBtnActive: {
    backgroundColor: colors.primary,
  },
  zoomBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  zoomBtnTextActive: {
    color: 'white',
    fontWeight: 'bold',
  },
  zoomFineControls: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  zoomFineBtn: {
    padding: spacing.xs,
  },
  cameraControls: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.xxl,
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
  },
  captureModeLabel: {
    color: 'white',
    fontSize: 14,
    marginTop: spacing.md,
    opacity: 0.8,
  },
  // Mode Toggle Styles
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: 4,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
  },
  modeBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: colors.text,
  },
  // Team Mode Styles
  teamModeContainer: {
    flex: 1,
  },
  teamModeContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 100,
  },
  teamModeTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  sectionContainer: {
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    color: colors.success,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  emptySection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceLight,
    borderStyle: 'dashed',
  },
  emptySectionText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  teamModePlayerRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  teamModePlayerRowActive: {
    borderColor: colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  teamModePlayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  inOutToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    minWidth: 50,
    alignItems: 'center',
  },
  inOutToggleIn: {
    backgroundColor: colors.success,
  },
  inOutToggleOut: {
    backgroundColor: colors.surfaceLight,
  },
  inOutToggleText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  teamModePlayerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamModeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  teamModeAvatarActive: {
    backgroundColor: colors.primary,
  },
  teamModeAvatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamModePlayerDetails: {
    flex: 1,
  },
  teamModePlayerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  teamModePlayerMiniStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  teamModePlayerPoints: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  teamModePlayerMinutes: {
    fontSize: 12,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  teamModeStatsContainer: {
    gap: spacing.xs,
  },
  teamModeQuickStats: {
    flexDirection: 'row',
    gap: 4,
  },
  teamModeStatBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  teamModeStatBtnMade: {
    backgroundColor: 'rgba(255, 107, 53, 0.3)',
  },
  teamModeStatBtnFT: {
    backgroundColor: 'rgba(251, 191, 36, 0.3)',
  },
  teamModeStatBtnMiss: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  teamModeStatBtnOreb: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  teamModeStatBtnDreb: {
    backgroundColor: 'rgba(16, 185, 129, 0.35)',
  },
  teamModeStatBtnAst: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  teamModeStatBtnStl: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  teamModeStatBtnBlk: {
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
  },
  teamModeStatBtnTo: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  teamModeStatBtnFoul: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  teamModeStatBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  teamModeStatBtnTextSmall: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Adjustment Modal Styles
  adjustModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
  },
  adjustButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginVertical: spacing.lg,
  },
  adjustBtn: {
    alignItems: 'center',
    padding: spacing.md,
  },
  adjustBtnLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.xs,
  },
  adjustCloseBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
  },
  adjustCloseBtnText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
