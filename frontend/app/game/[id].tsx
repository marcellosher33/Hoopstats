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
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { ScoringButton, StatButton, MissButton } from '../../src/components/StatButton';
import { ShotChart } from '../../src/components/ShotChart';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { StatType } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

export default function LiveGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { currentGame, fetchGame, recordStat, updateGame, addMedia, undoLastStat, adjustStat } = useGameStore();

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [showShotChart, setShowShotChart] = useState(false);
  const [pendingShotType, setPendingShotType] = useState<'2pt' | '3pt' | null>(null);
  const [pendingShotMade, setPendingShotMade] = useState(true);
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [opponentScore, setOpponentScore] = useState('0');
  const [ourScore, setOurScore] = useState('0');
  const [teamMode, setTeamMode] = useState(false);  // Track all players at once
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustStatType, setAdjustStatType] = useState<string | null>(null);
  const [adjustStatLabel, setAdjustStatLabel] = useState<string>('');
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraZoom, setCameraZoom] = useState(0); // 0 to 1 range
  
  // Pinch-to-zoom gesture values
  const baseZoom = useSharedValue(0);
  const pinchScale = useSharedValue(1);
  
  // Create pinch gesture for camera zoom
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      baseZoom.value = cameraZoom;
    })
    .onUpdate((event) => {
      // Calculate new zoom based on pinch scale
      // Scale of 1 = no change, 2 = double zoom, 0.5 = half zoom
      const scaleFactor = (event.scale - 1) * 0.5; // Reduce sensitivity
      const newZoom = Math.min(1, Math.max(0, baseZoom.value + scaleFactor));
      setCameraZoom(newZoom);
    })
    .onEnd(() => {
      baseZoom.value = cameraZoom;
    });

  useEffect(() => {
    if (token && id) {
      fetchGame(id, token);
    }
  }, [token, id]);

  useEffect(() => {
    if (currentGame) {
      setOpponentScore(currentGame.opponent_score.toString());
      setOurScore(currentGame.our_score.toString());
    }
  }, [currentGame]);

  const selectedPlayerStats = currentGame?.player_stats.find(
    ps => ps.player_id === selectedPlayer
  );

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
    // Set the selected player if provided (for team mode)
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

  const handleTakePhoto = async () => {
    if (!cameraRef.current) return;
    
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (photo?.base64 && token && id) {
        await addMedia(id, 'photo', `data:image/jpeg;base64,${photo.base64}`, token, {
          quarter: currentGame?.current_period || currentGame?.current_quarter,
        });
        Alert.alert('Success', 'Photo saved!');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
    setShowCamera(false);
  };

  const [isRecording, setIsRecording] = useState(false);

  const handleStartRecording = async () => {
    if (!cameraRef.current) return;
    
    try {
      setIsRecording(true);
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (video?.uri && token && id) {
        // Convert video to base64 for storage
        const response = await fetch(video.uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          await addMedia(id, 'video', base64data, token, {
            quarter: currentGame?.current_period || currentGame?.current_quarter,
          });
          Alert.alert('Success', 'Video saved!');
        };
        reader.readAsDataURL(blob);
      }
    } catch (error) {
      console.error('Video recording error:', error);
      Alert.alert('Error', 'Failed to record video');
    } finally {
      setIsRecording(false);
      setShowCamera(false);
    }
  };

  const handleStopRecording = () => {
    if (cameraRef.current && isRecording) {
      cameraRef.current.stopRecording();
    }
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

  const handleEndGame = async () => {
    if (!token || !id) return;
    await updateGame(id, { 
      status: 'completed', 
      opponent_score: parseInt(opponentScore, 10) || 0 
    }, token);
    setShowEndGameModal(false);
    router.replace(`/game/summary/${id}`);
  };

  const openCamera = async (mode: 'photo' | 'video') => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos/videos');
        return;
      }
    }

    if (mode === 'video' && user?.subscription_tier === 'free') {
      Alert.alert('Pro Feature', 'Video recording requires a Pro subscription');
      return;
    }

    setCameraMode(mode);
    setShowCamera(true);
  };

  if (!currentGame) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading game...</Text>
      </View>
    );
  }

  const stats = selectedPlayerStats?.stats;

  return (
    <View style={styles.container}>
      {/* Game Header - Scoreboard */}
      <LinearGradient
        colors={['#1A1A2E', '#16213E']}
        style={styles.header}
      >
        <TouchableOpacity style={styles.scoreBoard} onPress={() => setShowScoreModal(true)}>
          <View style={styles.teamScore}>
            <Text style={styles.teamLabel}>YOUR TEAM</Text>
            <Text style={styles.score}>{currentGame.our_score}</Text>
          </View>
          <View style={styles.gameInfo}>
            <View style={styles.quarterBadge}>
              <Text style={styles.quarterText}>
                {currentGame.period_type === 'halves' 
                  ? `H${currentGame.current_period || 1}` 
                  : `Q${currentGame.current_period || currentGame.current_quarter || 1}`}
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
          </View>
        </TouchableOpacity>

        {/* Period Controls */}
        <View style={styles.quarterControls}>
          {(currentGame.period_type === 'halves' ? [1, 2] : [1, 2, 3, 4]).map(p => (
            <TouchableOpacity
              key={p}
              style={[
                styles.quarterBtn,
                (currentGame.current_period || currentGame.current_quarter || 1) === p && styles.quarterBtnActive,
              ]}
              onPress={() => handleQuarterChange(p)}
            >
              <Text style={[
                styles.quarterBtnText,
                (currentGame.current_period || currentGame.current_quarter || 1) === p && styles.quarterBtnTextActive,
              ]}>
                {currentGame.period_type === 'halves' ? `H${p}` : `Q${p}`}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.quarterBtn, currentGame.current_quarter > 4 && styles.quarterBtnActive]}
            onPress={() => handleQuarterChange(5)}
          >
            <Text style={[styles.quarterBtnText, currentGame.current_quarter > 4 && styles.quarterBtnTextActive]}>OT</Text>
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
        /* Team Mode - All Players View */
        <ScrollView style={styles.teamModeContainer}>
          <Text style={styles.teamModeTitle}>Tap stat to record • Long-press to adjust</Text>
          {currentGame.player_stats.map((ps) => (
            <View key={ps.player_id} style={styles.teamModePlayerRow}>
              <View style={styles.teamModePlayerInfo}>
                <View style={styles.teamModeAvatar}>
                  <Text style={styles.teamModeAvatarText}>{ps.player_name.charAt(0)}</Text>
                </View>
                <View style={styles.teamModePlayerDetails}>
                  <Text style={styles.teamModePlayerName}>{ps.player_name}</Text>
                  <Text style={styles.teamModePlayerStats}>
                    {ps.stats.points || 0} pts • {ps.stats.rebounds || 0} reb • {ps.stats.assists || 0} ast
                  </Text>
                  <Text style={styles.teamModePlayerStatsRow2}>
                    {ps.stats.steals || 0} stl • {ps.stats.blocks || 0} blk • {ps.stats.turnovers || 0} to • {ps.stats.fouls || 0} foul
                  </Text>
                </View>
              </View>
              <View style={styles.teamModeQuickStats}>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(255, 107, 53, 0.2)' }]}
                  onPress={() => {
                    setSelectedPlayer(ps.player_id);
                    setPendingShotType('2pt');
                    setPendingShotMade(true);
                    setShowShotChart(true);
                  }}
                  onLongPress={() => handleLongPressAdjust('points', 'Points', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>+2</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(59, 130, 246, 0.2)' }]}
                  onPress={() => {
                    setSelectedPlayer(ps.player_id);
                    setPendingShotType('3pt');
                    setPendingShotMade(true);
                    setShowShotChart(true);
                  }}
                  onLongPress={() => handleLongPressAdjust('points', 'Points', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>+3</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}
                  onPress={async () => {
                    if (token && id) {
                      await recordStat(id, ps.player_id, 'offensive_rebounds', token);
                    }
                  }}
                  onLongPress={() => handleLongPressAdjust('offensive_rebounds', 'Off Rebounds', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>OREB</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(16, 185, 129, 0.4)' }]}
                  onPress={async () => {
                    if (token && id) {
                      await recordStat(id, ps.player_id, 'defensive_rebounds', token);
                    }
                  }}
                  onLongPress={() => handleLongPressAdjust('defensive_rebounds', 'Def Rebounds', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>DREB</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(245, 158, 11, 0.2)' }]}
                  onPress={async () => {
                    if (token && id) {
                      await recordStat(id, ps.player_id, 'assists', token);
                    }
                  }}
                  onLongPress={() => handleLongPressAdjust('assists', 'Assists', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>AST</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}
                  onPress={async () => {
                    if (token && id) {
                      await recordStat(id, ps.player_id, 'steals', token);
                    }
                  }}
                  onLongPress={() => handleLongPressAdjust('steals', 'Steals', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>STL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}
                  onPress={async () => {
                    if (token && id) {
                      await recordStat(id, ps.player_id, 'turnovers', token);
                    }
                  }}
                  onLongPress={() => handleLongPressAdjust('turnovers', 'Turnovers', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>TO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teamModeStatBtn, { backgroundColor: 'rgba(251, 191, 36, 0.2)' }]}
                  onPress={async () => {
                    if (token && id) {
                      await recordStat(id, ps.player_id, 'fouls', token);
                    }
                  }}
                  onLongPress={() => handleLongPressAdjust('fouls', 'Fouls', ps.player_id)}
                  delayLongPress={500}
                >
                  <Text style={styles.teamModeStatBtnText}>FOUL</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <>
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

            {/* Other Stats */}
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
                <Text style={styles.playerStatsTitle}>{selectedPlayerStats?.player_name}</Text>
                <View style={styles.playerStatsGrid}>
                  <View style={styles.playerStatItem}>
                    <Text style={[styles.playerStatValue, { color: colors.points }]}>{stats?.points || 0}</Text>
                    <Text style={styles.playerStatLabel}>PTS</Text>
                  </View>
                  <View style={styles.playerStatItem}>
                    <Text style={[styles.playerStatValue, { color: colors.rebounds }]}>{stats?.rebounds || 0}</Text>
                    <Text style={styles.playerStatLabel}>REB</Text>
                  </View>
                  <View style={styles.playerStatItem}>
                    <Text style={[styles.playerStatValue, { color: colors.rebounds, fontSize: 16 }]}>{stats?.offensive_rebounds || 0}/{stats?.defensive_rebounds || 0}</Text>
                    <Text style={styles.playerStatLabel}>O/D</Text>
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
                </View>
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
        <TouchableOpacity style={styles.actionBtn} onPress={() => openCamera('photo')}>
          <Ionicons name="camera" size={26} color={colors.text} />
          <Text style={styles.actionBtnText}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, user?.subscription_tier === 'free' && styles.actionBtnDisabled]}
          onPress={() => openCamera('video')}
        >
          <Ionicons name="videocam" size={26} color={user?.subscription_tier === 'free' ? colors.textSecondary : colors.text} />
          <Text style={[styles.actionBtnText, user?.subscription_tier === 'free' && styles.actionBtnTextDisabled]}>Video</Text>
          {user?.subscription_tier === 'free' && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
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
                <Text style={styles.scoreInputLabel}>Your Team</Text>
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

      {/* Shot Chart Modal */}
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
            <ShotChart
              shots={selectedPlayerStats?.shots || []}
              onCourtPress={handleShotChartPress}
              width={screenWidth - 64}
              height={(screenWidth - 64) * 0.94}
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
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[
          styles.cameraContainer,
          cameraMode === 'video' && styles.cameraContainerVideo
        ]}>
          {/* Mode Banner */}
          <View style={[
            styles.modeBanner,
            cameraMode === 'video' ? styles.modeBannerVideo : styles.modeBannerPhoto
          ]}>
            <Ionicons 
              name={cameraMode === 'video' ? 'videocam' : 'camera'} 
              size={24} 
              color="white" 
            />
            <Text style={styles.modeBannerText}>
              {cameraMode === 'video' ? 'VIDEO MODE' : 'PHOTO MODE'}
            </Text>
          </View>

          <GestureDetector gesture={pinchGesture}>
          <View style={styles.camera}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode={cameraMode === 'video' ? 'video' : 'picture'}
            zoom={cameraZoom}
          >
            <View style={styles.cameraHeader}>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => {
                  if (isRecording) {
                    handleStopRecording();
                  }
                  setCameraZoom(0); // Reset zoom when closing
                  setShowCamera(false);
                }}
              >
                <Ionicons name="close" size={28} color="white" />
              </TouchableOpacity>
              
              {/* Zoom indicator */}
              <View style={styles.zoomIndicator}>
                <Text style={styles.zoomText}>{(1 + cameraZoom * 7).toFixed(1)}x</Text>
              </View>
            </View>
            
            {/* Zoom Controls */}
            <View style={styles.zoomControlsContainer}>
              <View style={styles.zoomControls}>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom === 0 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom === 0 && styles.zoomBtnTextActive]}>1x</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom >= 0.12 && cameraZoom < 0.25 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0.125)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom >= 0.12 && cameraZoom < 0.25 && styles.zoomBtnTextActive]}>2x</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom >= 0.25 && cameraZoom < 0.5 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0.285)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom >= 0.25 && cameraZoom < 0.5 && styles.zoomBtnTextActive]}>3x</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.zoomBtn, cameraZoom >= 0.5 && styles.zoomBtnActive]}
                  onPress={() => setCameraZoom(0.57)}
                >
                  <Text style={[styles.zoomBtnText, cameraZoom >= 0.5 && styles.zoomBtnTextActive]}>5x</Text>
                </TouchableOpacity>
              </View>
              
              {/* Fine zoom slider */}
              <View style={styles.zoomSliderContainer}>
                <Ionicons name="remove" size={20} color="white" />
                <View style={styles.zoomSlider}>
                  <View 
                    style={[styles.zoomSliderFill, { width: `${cameraZoom * 100}%` }]} 
                  />
                  <TouchableOpacity
                    style={[styles.zoomSliderThumb, { left: `${cameraZoom * 100}%` }]}
                    onPress={() => {}}
                  />
                </View>
                <Ionicons name="add" size={20} color="white" />
              </View>
              
              {/* Zoom +/- buttons for fine control */}
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
              {/* Recording indicator */}
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>REC</Text>
                </View>
              )}
              
              {/* Capture button */}
              {cameraMode === 'photo' ? (
                <TouchableOpacity style={styles.captureBtn} onPress={handleTakePhoto}>
                  <View style={styles.captureBtnInner} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.captureBtn, styles.videoCaptureBtn, isRecording && styles.recordingBtn]} 
                  onPress={isRecording ? handleStopRecording : handleStartRecording}
                >
                  <View style={[
                    styles.captureBtnInner, 
                    styles.videoBtnInner,
                    isRecording && styles.recordingBtnInner
                  ]} />
                </TouchableOpacity>
              )}
              
              {/* Mode label */}
              <Text style={styles.captureModeLabel}>
                {cameraMode === 'video' 
                  ? (isRecording ? 'Tap to stop' : 'Tap to record')
                  : 'Tap to capture'
                }
              </Text>
            </View>
          </CameraView>
          </View>
          </GestureDetector>
        </View>
        </GestureHandlerRootView>
      </Modal>

      {/* End Game Modal */}
      <Modal visible={showEndGameModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.endGameModal}>
            <Text style={styles.modalTitle}>End Game?</Text>
            <Text style={styles.modalSubtitle}>Final Score</Text>
            <View style={styles.finalScoreRow}>
              <View style={styles.finalScoreTeam}>
                <Text style={styles.finalScoreLabel}>Your Team</Text>
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
    alignItems: 'center',
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
    fontSize: 28,
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
    position: 'relative',
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: colors.text,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  actionBtnTextDisabled: {
    color: colors.textSecondary,
  },
  proBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.warning,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  proBadgeText: {
    color: colors.text,
    fontSize: 8,
    fontWeight: 'bold',
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
  cameraContainerVideo: {
    backgroundColor: '#1a0000',
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
  modeBannerVideo: {
    backgroundColor: colors.error,
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
  cameraHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
    position: 'absolute',
    right: 0,
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
  zoomSliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  zoomSlider: {
    width: 150,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    position: 'relative',
  },
  zoomSliderFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  zoomSliderThumb: {
    position: 'absolute',
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'white',
    marginLeft: -8,
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
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
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
  videoCaptureBtn: {
    borderColor: colors.error,
  },
  captureBtnInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'white',
  },
  videoBtnInner: {
    backgroundColor: colors.error,
  },
  recordingBtn: {
    borderColor: colors.error,
    borderWidth: 6,
  },
  recordingBtnInner: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.error,
  },
  captureModeLabel: {
    color: 'white',
    fontSize: 14,
    marginTop: spacing.md,
    opacity: 0.8,
  },
  recordingText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: spacing.sm,
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
    paddingHorizontal: spacing.md,
  },
  teamModeTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  teamModePlayerRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  teamModePlayerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  teamModeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
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
  teamModePlayerStats: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  teamModePlayerStatsRow2: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  teamModeQuickStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  teamModeStatBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamModeStatBtnText: {
    color: colors.text,
    fontSize: 14,
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
