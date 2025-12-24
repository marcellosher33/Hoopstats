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
import { ShotChart } from '../../src/components/ShotChart';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { StatType } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

export default function LiveGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { currentGame, fetchGame, recordStat, updateGame, addMedia } = useGameStore();

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
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

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
          quarter: currentGame?.current_quarter,
        });
        Alert.alert('Success', 'Photo saved!');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
    setShowCamera(false);
  };

  const handleQuarterChange = async (newQuarter: number) => {
    if (!token || !id) return;
    await updateGame(id, { current_quarter: newQuarter }, token);
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
              <Text style={styles.quarterText}>Q{currentGame.current_quarter}</Text>
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

        {/* Quarter Controls */}
        <View style={styles.quarterControls}>
          {[1, 2, 3, 4].map(q => (
            <TouchableOpacity
              key={q}
              style={[
                styles.quarterBtn,
                currentGame.current_quarter === q && styles.quarterBtnActive,
              ]}
              onPress={() => handleQuarterChange(q)}
            >
              <Text style={[
                styles.quarterBtnText,
                currentGame.current_quarter === q && styles.quarterBtnTextActive,
              ]}>Q{q}</Text>
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
              <Text style={styles.statSectionTitle}>SCORING</Text>
              <View style={styles.scoringRow}>
                <ScoringButton
                  points={2}
                  label="2PT"
                  value={stats?.fg_made}
                  onPress={() => {
                    setPendingShotType('2pt');
                    setPendingShotMade(true);
                    setShowShotChart(true);
                  }}
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
                />
                <ScoringButton
                  points={1}
                  label="FT"
                  value={stats?.ft_made}
                  onPress={() => handleStatPress('ft_made')}
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
                />
                <MissButton 
                  label="Miss 3PT" 
                  onPress={() => {
                    setPendingShotType('3pt');
                    setPendingShotMade(false);
                    setShowShotChart(true);
                  }} 
                />
                <MissButton label="Miss FT" onPress={() => handleStatPress('ft_missed')} />
              </View>
            </View>

            {/* Other Stats */}
            <View style={styles.statSection}>
              <Text style={styles.statSectionTitle}>STATS</Text>
              <View style={styles.statGrid}>
                <StatButton
                  label="REB"
                  value={stats?.rebounds}
                  variant="stat"
                  onPress={() => handleStatPress('rebounds')}
                />
                <StatButton
                  label="AST"
                  value={stats?.assists}
                  variant="stat"
                  onPress={() => handleStatPress('assists')}
                />
                <StatButton
                  label="STL"
                  value={stats?.steals}
                  variant="stat"
                  onPress={() => handleStatPress('steals')}
                />
                <StatButton
                  label="BLK"
                  value={stats?.blocks}
                  variant="stat"
                  onPress={() => handleStatPress('blocks')}
                />
              </View>
              <View style={styles.statGrid}>
                <StatButton
                  label="TO"
                  value={stats?.turnovers}
                  variant="negative"
                  onPress={() => handleStatPress('turnovers')}
                />
                <StatButton
                  label="FOUL"
                  value={stats?.fouls}
                  variant="negative"
                  onPress={() => handleStatPress('fouls')}
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

      {/* Bottom Action Bar */}
      <LinearGradient
        colors={['#1A1A2E', '#0F0F1A']}
        style={styles.actionBar}
      >
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
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
          >
            <View style={styles.cameraHeader}>
              <TouchableOpacity onPress={() => setShowCamera(false)}>
                <Ionicons name="close" size={32} color="white" />
              </TouchableOpacity>
            </View>
            <View style={styles.cameraControls}>
              <TouchableOpacity style={styles.captureBtn} onPress={handleTakePhoto}>
                <View style={styles.captureBtnInner} />
              </TouchableOpacity>
            </View>
          </CameraView>
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
  camera: {
    flex: 1,
  },
  cameraHeader: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
  },
  cameraControls: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.xxl,
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'white',
  },
});
