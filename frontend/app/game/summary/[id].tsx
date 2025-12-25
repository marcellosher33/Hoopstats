import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Image,
  Modal,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/stores/authStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { Button } from '../../../src/components/Button';
import { ShotChart } from '../../../src/components/ShotChart';
import { colors, spacing, borderRadius } from '../../../src/utils/theme';
import { GameMedia } from '../../../src/types';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

// Helper function to convert base64 to file URI using new File API
const base64ToFileUri = async (base64Data: string, filename: string): Promise<string | null> => {
  try {
    // Remove data URI prefix if present
    let cleanBase64 = base64Data;
    if (base64Data.includes(',')) {
      cleanBase64 = base64Data.split(',')[1];
    }
    
    // Decode base64 to binary
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create file using new File API
    const file = new File(Paths.cache, filename);
    await file.write(bytes);
    
    return file.uri;
  } catch (error) {
    console.error('Error converting base64 to file:', error);
    return null;
  }
};

export default function GameSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const { currentGame, fetchGame, generateAISummary, deleteGame, adjustStat } = useGameStore();
  
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<GameMedia | null>(null);
  const [showEditStats, setShowEditStats] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editingStat, setEditingStat] = useState<{ type: string; label: string } | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    if (token && id) {
      fetchGame(id, token);
    }
  }, [token, id]);

  // Save media to device
  const handleSaveMedia = async (media: GameMedia) => {
    setSavingMedia(true);
    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant access to save media to your device.');
        setSavingMedia(false);
        return;
      }

      const extension = media.type === 'video' ? 'mp4' : 'jpg';
      const filename = `hoopstats_${media.id || Date.now()}.${extension}`;
      let fileUri: string | null = null;

      // If URL-based media, download it first
      if (media.url) {
        const fullUrl = `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}${media.url}`;
        // For URL-based media, we can use MediaLibrary directly with the URL
        // or download it first - let's download for consistency
        try {
          const response = await fetch(fullUrl);
          const blob = await response.blob();
          const reader = new FileReader();
          
          // Convert blob to base64
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          
          fileUri = await base64ToFileUri(base64, filename);
        } catch (err) {
          console.error('Error downloading media:', err);
          Alert.alert('Error', 'Failed to download media');
          setSavingMedia(false);
          return;
        }
      } else if (media.data) {
        // Legacy base64 data
        fileUri = await base64ToFileUri(media.data, filename);
      }
      
      if (!fileUri) {
        Alert.alert('Error', 'Failed to save media');
        setSavingMedia(false);
        return;
      }

      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      
      // Optionally create an album
      const album = await MediaLibrary.getAlbumAsync('HoopStats');
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await MediaLibrary.createAlbumAsync('HoopStats', asset, false);
      }

      Alert.alert('Saved!', `${media.type === 'video' ? 'Video' : 'Photo'} saved to your device.`);
    } catch (error) {
      console.error('Error saving media:', error);
      Alert.alert('Error', 'Failed to save media to device');
    } finally {
      setSavingMedia(false);
    }
  };

  // Helper to get media source URL
  const getMediaSource = (media: GameMedia): string => {
    // If URL exists (new file-based storage), use full API URL
    if (media.url) {
      return `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}${media.url}`;
    }
    // Fallback to legacy base64 data
    return media.data || '';
  };

  // Prepare video for playback
  useEffect(() => {
    const prepareVideo = async () => {
      if (selectedMedia?.type === 'video') {
        setVideoLoading(true);
        try {
          // If URL-based media, use the URL directly
          if (selectedMedia.url) {
            const fullUrl = `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}${selectedMedia.url}`;
            setVideoUri(fullUrl);
            setVideoLoading(false);
            return;
          }
          
          // Legacy: Convert base64 to file
          if (selectedMedia.data && typeof selectedMedia.data === 'string') {
            const filename = `video_${selectedMedia.id || Date.now()}.mp4`;
            const fileUri = await base64ToFileUri(selectedMedia.data, filename);
            
            if (fileUri) {
              setVideoUri(fileUri);
            } else {
              Alert.alert('Error', 'Failed to prepare video');
            }
          } else {
            console.error('No video data available');
            Alert.alert('Error', 'Video data not available');
          }
        } catch (error) {
          console.error('Error preparing video:', error);
          Alert.alert('Error', 'Failed to load video');
        } finally {
          setVideoLoading(false);
        }
      } else {
        setVideoUri(null);
      }
    };

    prepareVideo();
  }, [selectedMedia]);

  // Cleanup video URI when modal closes
  const handleCloseMediaModal = () => {
    setSelectedMedia(null);
    setVideoUri(null);
  };

  const handleGenerateSummary = async () => {
    if (!token || !id) return;
    
    if (user?.subscription_tier === 'free') {
      Alert.alert('Pro Feature', 'AI summaries require a Pro subscription');
      return;
    }

    setGeneratingSummary(true);
    try {
      await generateAISummary(id, token);
      Alert.alert('Success', 'AI summary generated!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleEditStat = (playerId: string, statType: string, statLabel: string) => {
    setEditingPlayer(playerId);
    setEditingStat({ type: statType, label: statLabel });
  };

  const handleAdjustStat = async (adjustment: number) => {
    if (!token || !id || !editingPlayer || !editingStat) return;
    await adjustStat(id, editingPlayer, editingStat.type, adjustment, token);
    // Refresh the game data
    await fetchGame(id, token);
    setEditingStat(null);
    setEditingPlayer(null);
  };

  const handleShare = async () => {
    if (!currentGame) return;
    
    const isWin = currentGame.our_score > currentGame.opponent_score;
    const message = `${isWin ? 'W' : 'L'} vs ${currentGame.opponent_name}\nFinal: ${currentGame.our_score} - ${currentGame.opponent_score}\n\n${currentGame.ai_summary || ''}`;
    
    try {
      await Share.share({ message });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Game',
      'Are you sure you want to delete this game? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (token && id) {
              await deleteGame(id, token);
              router.replace('/(tabs)/games');
            }
          },
        },
      ]
    );
  };

  if (!currentGame) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isWin = currentGame.our_score > currentGame.opponent_score;
  const photos = currentGame.media.filter(m => m.type === 'photo');
  const videos = currentGame.media.filter(m => m.type === 'video');
  const allShots = currentGame.player_stats.flatMap(ps => ps.shots || []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Game Result Header */}
      <View style={[styles.resultCard, isWin ? styles.resultWin : styles.resultLoss]}>
        <Text style={styles.resultLabel}>{isWin ? 'VICTORY' : 'DEFEAT'}</Text>
        <View style={styles.teamsRow}>
          <View style={styles.teamColumn}>
            <Text style={styles.teamName}>{currentGame.home_team_name || 'My Team'}</Text>
            <Text style={styles.bigScore}>{currentGame.our_score}</Text>
          </View>
          <Text style={styles.scoreDash}>-</Text>
          <View style={styles.teamColumn}>
            <Text style={styles.teamName}>{currentGame.opponent_name}</Text>
            <Text style={styles.bigScore}>{currentGame.opponent_score}</Text>
          </View>
        </View>
        <Text style={styles.gameDate}>
          {new Date(currentGame.game_date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        {currentGame.location && (
          <View style={styles.locationRow}>
            <Ionicons name="location" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.locationText}>
              {currentGame.location === 'home' ? 'Home Game' : 'Away Game'}
              {currentGame.venue && ` • ${currentGame.venue}`}
            </Text>
          </View>
        )}
      </View>

      {/* AI Summary */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Game Summary</Text>
          {user?.subscription_tier !== 'free' && (
            <TouchableOpacity onPress={handleGenerateSummary} disabled={generatingSummary}>
              <Ionicons 
                name="sparkles" 
                size={20} 
                color={generatingSummary ? colors.textSecondary : colors.primary} 
              />
            </TouchableOpacity>
          )}
        </View>
        
        {currentGame.ai_summary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>{currentGame.ai_summary}</Text>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Ionicons name="share-social" size={18} color={colors.primary} />
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noSummary}>
            <Ionicons name="sparkles-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.noSummaryText}>No AI summary yet</Text>
            {user?.subscription_tier === 'free' ? (
              <Text style={styles.proRequired}>Pro subscription required</Text>
            ) : (
              <Button
                title="Generate Summary"
                onPress={handleGenerateSummary}
                loading={generatingSummary}
                size="small"
                style={{ marginTop: spacing.md }}
              />
            )}
          </View>
        )}
      </View>

      {/* Player Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Player Statistics</Text>
        {currentGame.player_stats.map((ps) => (
          <View key={ps.player_id} style={styles.playerStatCard}>
            <View style={styles.playerHeader}>
              <View style={styles.playerAvatar}>
                <Text style={styles.avatarText}>{ps.player_name.charAt(0)}</Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{ps.player_name}</Text>
                <Text style={styles.playerPts}>{ps.stats.points || 0} PTS</Text>
              </View>
            </View>
            <View style={styles.statsGrid}>
              <StatItem label="PTS" value={ps.stats.points || 0} color={colors.points} />
              <StatItem label="REB" value={ps.stats.rebounds || 0} color={colors.rebounds} />
              <StatItem label="AST" value={ps.stats.assists || 0} color={colors.assists} />
              <StatItem label="STL" value={ps.stats.steals || 0} color={colors.steals} />
              <StatItem label="BLK" value={ps.stats.blocks || 0} color={colors.blocks} />
              <StatItem label="TO" value={ps.stats.turnovers || 0} color={colors.turnovers} />
            </View>
            <View style={styles.shootingStats}>
              <Text style={styles.shootingText}>
                FG: {ps.stats.fg_made || 0}/{ps.stats.fg_attempted || 0}
                {ps.stats.fg_attempted ? ` (${Math.round((ps.stats.fg_made / ps.stats.fg_attempted) * 100)}%)` : ''}
              </Text>
              <Text style={styles.shootingText}>
                3PT: {ps.stats.three_pt_made || 0}/{ps.stats.three_pt_attempted || 0}
              </Text>
              <Text style={styles.shootingText}>
                FT: {ps.stats.ft_made || 0}/{ps.stats.ft_attempted || 0}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Shot Chart */}
      {allShots.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shot Chart</Text>
          <View style={styles.shotChartContainer}>
            <ShotChart shots={allShots} width={320} height={300} />
            <View style={styles.shotLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.shotMade }]} />
                <Text style={styles.legendText}>Made</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.shotMissed }]} />
                <Text style={styles.legendText}>Missed</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos ({photos.length})</Text>
            {photos.length > 4 && (
              <TouchableOpacity onPress={() => setShowAllPhotos(!showAllPhotos)}>
                <Text style={styles.seeAllText}>
                  {showAllPhotos ? 'Show Less' : 'See All'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.photoGrid}>
            {(showAllPhotos ? photos : photos.slice(0, 4)).map((photo, index) => (
              <TouchableOpacity 
                key={photo.id} 
                style={styles.photoItem}
                onPress={() => setSelectedMedia(photo)}
              >
                <Image source={{ uri: getMediaSource(photo) }} style={styles.photo} />
                <View style={styles.mediaPlayOverlay}>
                  <Ionicons name="expand" size={24} color="white" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Videos ({videos.length})</Text>
          </View>
          <View style={styles.videoList}>
            {videos.map((video, index) => (
              <TouchableOpacity 
                key={video.id} 
                style={styles.videoItem}
                onPress={() => setSelectedMedia(video)}
              >
                <View style={styles.videoThumbnail}>
                  <Ionicons name="play-circle" size={64} color="white" />
                  <Text style={styles.videoTapLabel}>Tap to play</Text>
                </View>
                <View style={styles.videoOverlay}>
                  <Ionicons name="videocam" size={20} color="white" />
                  <Text style={styles.videoLabel}>Clip {index + 1}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Full Screen Media Viewer Modal */}
      <Modal visible={selectedMedia !== null} animationType="fade" transparent>
        <View style={styles.mediaViewerOverlay}>
          <View style={styles.mediaViewerActions}>
            <TouchableOpacity 
              style={styles.mediaViewerClose}
              onPress={handleCloseMediaModal}
            >
              <Ionicons name="close" size={32} color="white" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.mediaViewerSave}
              onPress={() => selectedMedia && handleSaveMedia(selectedMedia)}
              disabled={savingMedia}
            >
              {savingMedia ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="download" size={28} color="white" />
              )}
            </TouchableOpacity>
          </View>
          
          {selectedMedia?.type === 'photo' ? (
            <Image 
              source={{ uri: getMediaSource(selectedMedia) }} 
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          ) : selectedMedia?.type === 'video' ? (
            <View style={styles.videoContainer}>
              {videoLoading ? (
                <View style={styles.videoLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.videoLoadingText}>Loading video...</Text>
                </View>
              ) : videoUri ? (
                <Video
                  ref={videoRef}
                  source={{ uri: videoUri }}
                  style={styles.fullScreenVideo}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping={false}
                  onError={(error) => {
                    console.error('Video playback error:', error);
                    Alert.alert('Error', 'Failed to play video');
                  }}
                />
              ) : (
                <View style={styles.videoLoadingContainer}>
                  <Ionicons name="alert-circle" size={48} color={colors.error} />
                  <Text style={styles.videoLoadingText}>Failed to load video</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Game Notes */}
      {currentGame.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <View style={styles.notesCard}>
            <Text style={styles.notesText}>{currentGame.notes}</Text>
          </View>
        </View>
      )}

      {/* Tags */}
      {currentGame.tags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tags</Text>
          <View style={styles.tagsRow}>
            {currentGame.tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title="Edit Stats"
          onPress={() => setShowEditStats(!showEditStats)}
          variant={showEditStats ? 'primary' : 'outline'}
          icon={<Ionicons name="pencil" size={20} color={showEditStats ? colors.text : colors.primary} />}
        />
        <Button
          title="Share Game"
          onPress={handleShare}
          variant="outline"
          icon={<Ionicons name="share-social" size={20} color={colors.primary} />}
        />
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color={colors.error} />
          <Text style={styles.deleteBtnText}>Delete Game</Text>
        </TouchableOpacity>
      </View>

      {/* Edit Stats Section */}
      {showEditStats && (
        <View style={styles.editStatsSection}>
          <Text style={styles.editStatsTitle}>Tap any stat to adjust (+/-)</Text>
          {currentGame.player_stats.map((ps) => (
            <View key={ps.player_id} style={styles.editPlayerCard}>
              <Text style={styles.editPlayerName}>{ps.player_name}</Text>
              <View style={styles.editStatsGrid}>
                <TouchableOpacity 
                  style={styles.editStatItem}
                  onPress={() => handleEditStat(ps.player_id, 'points', 'Points')}
                >
                  <Text style={styles.editStatValue}>{ps.stats.points || 0}</Text>
                  <Text style={styles.editStatLabel}>PTS</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.editStatItem}
                  onPress={() => handleEditStat(ps.player_id, 'rebounds', 'Rebounds')}
                >
                  <Text style={styles.editStatValue}>{ps.stats.rebounds || 0}</Text>
                  <Text style={styles.editStatLabel}>REB</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.editStatItem}
                  onPress={() => handleEditStat(ps.player_id, 'assists', 'Assists')}
                >
                  <Text style={styles.editStatValue}>{ps.stats.assists || 0}</Text>
                  <Text style={styles.editStatLabel}>AST</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.editStatItem}
                  onPress={() => handleEditStat(ps.player_id, 'steals', 'Steals')}
                >
                  <Text style={styles.editStatValue}>{ps.stats.steals || 0}</Text>
                  <Text style={styles.editStatLabel}>STL</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.editStatItem}
                  onPress={() => handleEditStat(ps.player_id, 'blocks', 'Blocks')}
                >
                  <Text style={styles.editStatValue}>{ps.stats.blocks || 0}</Text>
                  <Text style={styles.editStatLabel}>BLK</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.editStatItem}
                  onPress={() => handleEditStat(ps.player_id, 'turnovers', 'Turnovers')}
                >
                  <Text style={styles.editStatValue}>{ps.stats.turnovers || 0}</Text>
                  <Text style={styles.editStatLabel}>TO</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.editStatItem}
                  onPress={() => handleEditStat(ps.player_id, 'fouls', 'Fouls')}
                >
                  <Text style={styles.editStatValue}>{ps.stats.fouls || 0}</Text>
                  <Text style={styles.editStatLabel}>FOUL</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Edit Stat Modal */}
      <Modal visible={editingStat !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>Adjust {editingStat?.label}</Text>
            <Text style={styles.editModalSubtitle}>
              Current: {editingPlayer && currentGame?.player_stats.find(ps => ps.player_id === editingPlayer)?.stats[editingStat?.type as keyof typeof currentGame.player_stats[0]['stats']] || 0}
            </Text>
            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={styles.editModalBtn}
                onPress={() => handleAdjustStat(-1)}
              >
                <Ionicons name="remove-circle" size={56} color={colors.error} />
                <Text style={styles.editModalBtnLabel}>-1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editModalBtn}
                onPress={() => handleAdjustStat(1)}
              >
                <Ionicons name="add-circle" size={56} color={colors.success} />
                <Text style={styles.editModalBtnLabel}>+1</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.editModalClose}
              onPress={() => { setEditingStat(null); setEditingPlayer(null); }}
            >
              <Text style={styles.editModalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const StatItem = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View style={styles.statItem}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.text,
  },
  resultCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  resultWin: {
    backgroundColor: colors.success,
  },
  resultLoss: {
    backgroundColor: colors.error,
  },
  resultLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  teamColumn: {
    alignItems: 'center',
    flex: 1,
  },
  teamName: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  bigScore: {
    color: colors.text,
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreDash: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 32,
    marginHorizontal: spacing.md,
  },
  opponentName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  gameDate: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  locationText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
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
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  seeAllText: {
    color: colors.primary,
    fontSize: 14,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  summaryText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  shareBtnText: {
    color: colors.primary,
    fontWeight: '500',
  },
  noSummary: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  noSummaryText: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  proRequired: {
    color: colors.warning,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  playerStatCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 18,
  },
  playerInfo: {
    marginLeft: spacing.md,
  },
  playerName: {
    color: colors.text,
    fontWeight: '600',
  },
  playerPts: {
    color: colors.primary,
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  shootingStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  shootingText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  shotChartContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  shotLegend: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoItem: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  videoList: {
    gap: spacing.md,
  },
  videoItem: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    position: 'relative',
  },
  video: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
  },
  videoOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  videoLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  mediaPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumbnail: {
    width: '100%',
    height: 180,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTapLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: spacing.sm,
  },
  mediaViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaViewerActions: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  mediaViewerClose: {
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  mediaViewerSave: {
    padding: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  fullScreenImage: {
    width: screenWidth,
    height: screenHeight * 0.8,
  },
  fullScreenVideo: {
    width: screenWidth,
    height: screenHeight * 0.7,
  },
  videoContainer: {
    width: screenWidth,
    height: screenHeight * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLoadingText: {
    color: colors.text,
    marginTop: spacing.md,
    fontSize: 16,
  },
  notesCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  notesText: {
    color: colors.text,
    fontSize: 14,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  tagText: {
    color: colors.text,
    fontSize: 12,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  deleteBtnText: {
    color: colors.error,
    fontWeight: '500',
  },
  // Edit Stats Styles
  editStatsSection: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  editStatsTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  editPlayerCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  editPlayerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  editStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  editStatItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    minWidth: 55,
  },
  editStatValue: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  editStatLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '80%',
    maxWidth: 320,
    alignItems: 'center',
  },
  editModalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: spacing.sm,
  },
  editModalSubtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  editModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: spacing.lg,
  },
  editModalBtn: {
    alignItems: 'center',
    padding: spacing.md,
  },
  editModalBtnLabel: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.xs,
  },
  editModalClose: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: borderRadius.lg,
  },
  editModalCloseText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
