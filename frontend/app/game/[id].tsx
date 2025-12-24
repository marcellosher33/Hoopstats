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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useAuthStore } from '../../src/stores/authStore';
import { useGameStore } from '../../src/stores/gameStore';
import { Button } from '../../src/components/Button';
import { StatButton } from '../../src/components/StatButton';
import { ShotChart } from '../../src/components/ShotChart';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { GamePlayerStats, StatType } from '../../src/types';

const screenWidth = Dimensions.get('window').width;

export default function LiveGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { currentGame, fetchGame, recordStat, updateGame, addMedia } = useGameStore();

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [showShotChart, setShowShotChart] = useState(false);
  const [pendingShotType, setPendingShotType] = useState<'2pt' | '3pt' | null>(null);
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const [opponentScore, setOpponentScore] = useState(0);
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (token && id) {
      fetchGame(id, token);
    }
  }, [token, id]);

  useEffect(() => {
    if (currentGame) {
      setOpponentScore(currentGame.opponent_score);
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
    await recordStat(id, selectedPlayer, statType, token, shotLocation);
  };

  const handleShotChartPress = (x: number, y: number) => {
    if (!pendingShotType) return;
    const statType: StatType = pendingShotType === '3pt' ? 'points_3' : 'points_2';
    handleStatPress(statType, { x, y });
    setShowShotChart(false);
    setPendingShotType(null);
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

  const handleOpponentScoreChange = async (delta: number) => {
    const newScore = Math.max(0, opponentScore + delta);
    setOpponentScore(newScore);
    if (token && id) {
      await updateGame(id, { opponent_score: newScore }, token);
    }
  };

  const handleEndGame = async () => {
    if (!token || !id) return;
    await updateGame(id, { status: 'completed', opponent_score: opponentScore }, token);
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
      {/* Game Header */}
      <View style={styles.header}>
        <View style={styles.scoreBoard}>
          <View style={styles.teamScore}>
            <Text style={styles.teamLabel}>YOUR TEAM</Text>
            <Text style={styles.score}>{currentGame.our_score}</Text>
          </View>
          <View style={styles.gameInfo}>
            <View style={styles.quarterBadge}>
              <Text style={styles.quarterText}>Q{currentGame.current_quarter}</Text>
            </View>
            <Text style={styles.vsText}>VS</Text>
          </View>
          <View style={styles.teamScore}>
            <Text style={styles.teamLabel}>{currentGame.opponent_name.toUpperCase()}</Text>
            <View style={styles.opponentScoreRow}>
              <TouchableOpacity
                style={styles.scoreButton}
                onPress={() => handleOpponentScoreChange(-1)}
              >
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.score}>{opponentScore}</Text>
              <TouchableOpacity
                style={styles.scoreButton}
                onPress={() => handleOpponentScoreChange(1)}
              >
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

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
            style={[styles.quarterBtn, styles.otBtn]}
            onPress={() => handleQuarterChange(5)}
          >
            <Text style={styles.quarterBtnText}>OT</Text>
          </TouchableOpacity>
        </View>
      </View>

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
            {/* Scoring */}
            <View style={styles.statSection}>
              <Text style={styles.statSectionTitle}>Scoring</Text>
              <View style={styles.statRow}>
                <StatButton
                  label="+2"
                  value={stats?.fg_made}
                  onPress={() => {
                    setPendingShotType('2pt');
                    setShowShotChart(true);
                  }}
                />
                <StatButton
                  label="+3"
                  value={stats?.three_pt_made}
                  onPress={() => {
                    setPendingShotType('3pt');
                    setShowShotChart(true);
                  }}
                />
                <StatButton
                  label="+1"
                  value={stats?.ft_made}
                  onPress={() => handleStatPress('ft_made')}
                />
              </View>
              <View style={styles.statRow}>
                <StatButton
                  label="Miss 2"
                  color={colors.surfaceLight}
                  onPress={() => handleStatPress('miss_2')}
                  size="small"
                  showBasketball={false}
                />
                <StatButton
                  label="Miss 3"
                  color={colors.surfaceLight}
                  onPress={() => handleStatPress('miss_3')}
                  size="small"
                  showBasketball={false}
                />
                <StatButton
                  label="Miss FT"
                  color={colors.error}
                  onPress={() => handleStatPress('ft_missed')}
                  size="small"
                  showBasketball={false}
                />
              </View>
            </View>

            {/* Other Stats */}
            <View style={styles.statSection}>
              <Text style={styles.statSectionTitle}>Other Stats</Text>
              <View style={styles.statRow}>
                <StatButton
                  label="REB"
                  value={stats?.rebounds}
                  onPress={() => handleStatPress('rebounds')}
                />
                <StatButton
                  label="AST"
                  value={stats?.assists}
                  onPress={() => handleStatPress('assists')}
                />
                <StatButton
                  label="STL"
                  value={stats?.steals}
                  onPress={() => handleStatPress('steals')}
                />
                <StatButton
                  label="BLK"
                  value={stats?.blocks}
                  onPress={() => handleStatPress('blocks')}
                />
              </View>
              <View style={styles.statRow}>
                <StatButton
                  label="TO"
                  value={stats?.turnovers}
                  onPress={() => handleStatPress('turnovers')}
                />
                <StatButton
                  label="FOUL"
                  value={stats?.fouls}
                  onPress={() => handleStatPress('fouls')}
                />
              </View>
            </View>

            {/* Current Player Stats Summary */}
            <View style={styles.playerStatsCard}>
              <Text style={styles.playerStatsTitle}>{selectedPlayerStats?.player_name} Stats</Text>
              <View style={styles.playerStatsGrid}>
                <View style={styles.playerStatItem}>
                  <Text style={styles.playerStatValue}>{stats?.points || 0}</Text>
                  <Text style={styles.playerStatLabel}>PTS</Text>
                </View>
                <View style={styles.playerStatItem}>
                  <Text style={styles.playerStatValue}>{stats?.rebounds || 0}</Text>
                  <Text style={styles.playerStatLabel}>REB</Text>
                </View>
                <View style={styles.playerStatItem}>
                  <Text style={styles.playerStatValue}>{stats?.assists || 0}</Text>
                  <Text style={styles.playerStatLabel}>AST</Text>
                </View>
                <View style={styles.playerStatItem}>
                  <Text style={styles.playerStatValue}>
                    {stats?.fg_attempted ? Math.round((stats.fg_made / stats.fg_attempted) * 100) : 0}%
                  </Text>
                  <Text style={styles.playerStatLabel}>FG%</Text>
                </View>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.selectPlayerPrompt}>
            <Ionicons name="person" size={48} color={colors.textSecondary} />
            <Text style={styles.selectPlayerText}>Select a player to record stats</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openCamera('photo')}>
          <Ionicons name="camera" size={24} color={colors.text} />
          <Text style={styles.actionBtnText}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, user?.subscription_tier === 'free' && styles.actionBtnDisabled]}
          onPress={() => openCamera('video')}
        >
          <Ionicons name="videocam" size={24} color={user?.subscription_tier === 'free' ? colors.textSecondary : colors.text} />
          <Text style={[styles.actionBtnText, user?.subscription_tier === 'free' && styles.actionBtnTextDisabled]}>Video</Text>
          {user?.subscription_tier === 'free' && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.endGameBtn} onPress={() => setShowEndGameModal(true)}>
          <Ionicons name="flag" size={24} color={colors.text} />
          <Text style={styles.endGameBtnText}>End Game</Text>
        </TouchableOpacity>
      </View>

      {/* Shot Chart Modal */}
      <Modal visible={showShotChart} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.shotChartModal}>
            <Text style={styles.modalTitle}>Tap shot location</Text>
            <Text style={styles.modalSubtitle}>
              {pendingShotType === '3pt' ? '3-Point Shot' : '2-Point Shot'}
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
                <Text style={styles.finalScore}>{opponentScore}</Text>
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
    backgroundColor: colors.surface,
    padding: spacing.md,
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
  },
  score: {
    color: colors.text,
    fontSize: 36,
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
  },
  vsText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  opponentScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: colors.surfaceLight,
  },
  quarterBtnActive: {
    backgroundColor: colors.primary,
  },
  quarterBtnText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  quarterBtnTextActive: {
    color: colors.text,
  },
  otBtn: {
    backgroundColor: colors.warning,
  },
  playerScroll: {
    maxHeight: 70,
    backgroundColor: colors.background,
  },
  playerChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginHorizontal: spacing.xs,
    marginVertical: spacing.sm,
    alignItems: 'center',
    minWidth: 80,
  },
  playerChipActive: {
    backgroundColor: colors.primary,
  },
  playerChipText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
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
  },
  statSection: {
    marginBottom: spacing.lg,
  },
  statSectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  selectPlayerPrompt: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  selectPlayerText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  playerStatsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  playerStatsTitle: {
    color: colors.text,
    fontWeight: 'bold',
    marginBottom: spacing.md,
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
    fontSize: 12,
  },
  actionBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
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
  },
  actionBtnTextDisabled: {
    color: colors.textSecondary,
  },
  proBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.warning,
    paddingHorizontal: 4,
    paddingVertical: 1,
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
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  shotChartModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.md,
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
