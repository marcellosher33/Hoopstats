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
  Clipboard,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/stores/authStore';
import { useGameStore } from '../../../src/stores/gameStore';
import { Button } from '../../../src/components/Button';
import { FullCourtShotChart } from '../../../src/components/FullCourtShotChart';
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
  const { currentGame, fetchGame, generateAISummary, deleteGame, adjustStat, updateGame } = useGameStore();
  
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<GameMedia | null>(null);
  const [showEditStats, setShowEditStats] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editingStat, setEditingStat] = useState<{ type: string; label: string } | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all'); // 'all', 'h1', 'h2', or 'q1', 'q2', 'q3', 'q4'
  const [subscriptionTier, setSubscriptionTier] = useState<string>('free');
  const videoRef = useRef<Video>(null);
  
  // Notes editing state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // API URL with fallback
  import { requireApiBaseUrl } from '../../../src/services/apiBase';

const API_URL = requireApiBaseUrl();

  useEffect(() => {
    if (token && id) {
      fetchGame(id, token);
    }
  }, [token, id]);

  // Fetch subscription status
  useEffect(() => {
    const fetchSubscription = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${API_URL}/api/subscriptions/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setSubscriptionTier(data.effective_tier || data.tier || 'free');
        }
      } catch (error) {
        console.error('Failed to fetch subscription status:', error);
      }
    };
    fetchSubscription();
  }, [token]);

  // Sync notes text when game loads
  useEffect(() => {
    if (currentGame) {
      setNotesText(currentGame.notes || '');
    }
  }, [currentGame?.id, currentGame?.notes]);

  // Save notes to the game
  const handleSaveNotes = async () => {
    if (!token || !id) return;
    
    setSavingNotes(true);
    try {
      await updateGame(id, { notes: notesText.trim() || null }, token);
      await fetchGame(id, token);
      setEditingNotes(false);
      Alert.alert('Saved', 'Notes saved successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  // Cancel notes editing
  const handleCancelNotesEdit = () => {
    setNotesText(currentGame?.notes || '');
    setEditingNotes(false);
  };

  // Generate and share PDF report
  const handleExportPdf = async () => {
    if (!currentGame) return;
    
    setExportingPdf(true);
    try {
      // Format game date
      const gameDate = new Date(currentGame.game_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      // Calculate team totals
      const teamTotals = {
        points: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.points || 0), 0),
        rebounds: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0), 0),
        assists: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.assists || 0), 0),
        steals: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.steals || 0), 0),
        blocks: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.blocks || 0), 0),
        turnovers: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.turnovers || 0), 0),
        fgMade: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.fg_made || 0), 0),
        fgAttempted: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.fg_attempted || 0), 0),
        threePtMade: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.three_pt_made || 0), 0),
        threePtAttempted: currentGame.player_stats.reduce((sum, ps) => sum + (ps.stats.three_pt_attempted || 0), 0),
      };
      
      const teamFgPct = teamTotals.fgAttempted > 0 ? Math.round((teamTotals.fgMade / teamTotals.fgAttempted) * 100) : 0;
      const team3PtPct = teamTotals.threePtAttempted > 0 ? Math.round((teamTotals.threePtMade / teamTotals.threePtAttempted) * 100) : 0;
      
      // Generate player rows for box score
      const playerRows = currentGame.player_stats.map(ps => {
        const reb = (ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0);
        const fgPct = ps.stats.fg_attempted ? Math.round((ps.stats.fg_made || 0) / ps.stats.fg_attempted * 100) : 0;
        return `
          <tr>
            <td style="text-align: left; font-weight: 600;">${ps.player_name}</td>
            <td>${ps.stats.points || 0}</td>
            <td>${reb}</td>
            <td>${ps.stats.assists || 0}</td>
            <td>${ps.stats.steals || 0}</td>
            <td>${ps.stats.blocks || 0}</td>
            <td>${ps.stats.turnovers || 0}</td>
            <td>${ps.stats.fg_made || 0}/${ps.stats.fg_attempted || 0}</td>
            <td>${fgPct}%</td>
          </tr>
        `;
      }).join('');
      
      // Result styling
      const isWin = currentGame.our_score > currentGame.opponent_score;
      const isTie = currentGame.our_score === currentGame.opponent_score;
      const resultText = isWin ? 'WIN' : (isTie ? 'TIE' : 'LOSS');
      const resultColor = isWin ? '#10B981' : (isTie ? '#F59E0B' : '#EF4444');
      
      // Generate HTML for PDF
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Game Report - ${currentGame.home_team_name} vs ${currentGame.opponent_name}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #f5f5f5;
              padding: 20px;
              color: #1a1a2e;
            }
            .header {
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              color: white;
              padding: 30px;
              border-radius: 16px;
              margin-bottom: 20px;
              text-align: center;
            }
            .header h1 { font-size: 28px; margin-bottom: 8px; }
            .header .date { opacity: 0.8; font-size: 14px; }
            .scoreboard {
              display: flex;
              justify-content: space-around;
              align-items: center;
              margin: 24px 0;
            }
            .team {
              text-align: center;
            }
            .team-name {
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 8px;
            }
            .score {
              font-size: 48px;
              font-weight: bold;
            }
            .result-badge {
              background: ${resultColor};
              color: white;
              padding: 8px 24px;
              border-radius: 20px;
              font-weight: bold;
              font-size: 18px;
            }
            .section {
              background: white;
              border-radius: 12px;
              padding: 20px;
              margin-bottom: 20px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }
            .section h2 {
              font-size: 18px;
              margin-bottom: 16px;
              color: #1a1a2e;
              border-bottom: 2px solid #8B5CF6;
              padding-bottom: 8px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
            }
            th, td {
              padding: 10px 8px;
              text-align: center;
              border-bottom: 1px solid #e5e5e5;
            }
            th {
              background: #f8f8f8;
              font-weight: 600;
              color: #666;
              font-size: 11px;
              text-transform: uppercase;
            }
            .totals-row {
              font-weight: bold;
              background: #f0f0ff;
            }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 16px;
            }
            .stat-box {
              text-align: center;
              padding: 16px;
              background: #f8f8f8;
              border-radius: 8px;
            }
            .stat-value {
              font-size: 28px;
              font-weight: bold;
              color: #8B5CF6;
            }
            .stat-label {
              font-size: 12px;
              color: #666;
              margin-top: 4px;
            }
            .ai-summary {
              background: linear-gradient(135deg, #f0f0ff 0%, #fff 100%);
              border-left: 4px solid #8B5CF6;
              padding: 16px;
              line-height: 1.6;
              font-size: 14px;
            }
            .footer {
              text-align: center;
              color: #999;
              font-size: 12px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Game Report</h1>
            <div class="date">${gameDate}</div>
            
            <div class="scoreboard">
              <div class="team">
                <div class="team-name">${currentGame.home_team_name}</div>
                <div class="score">${currentGame.our_score}</div>
              </div>
              <div class="result-badge">${resultText}</div>
              <div class="team">
                <div class="team-name">${currentGame.opponent_name}</div>
                <div class="score">${currentGame.opponent_score}</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h2>Team Statistics</h2>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-value">${teamTotals.points}</div>
                <div class="stat-label">Points</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${teamTotals.rebounds}</div>
                <div class="stat-label">Rebounds</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${teamTotals.assists}</div>
                <div class="stat-label">Assists</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${teamFgPct}%</div>
                <div class="stat-label">FG%</div>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h2>Box Score</h2>
            <table>
              <thead>
                <tr>
                  <th style="text-align: left;">Player</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>AST</th>
                  <th>STL</th>
                  <th>BLK</th>
                  <th>TO</th>
                  <th>FG</th>
                  <th>FG%</th>
                </tr>
              </thead>
              <tbody>
                ${playerRows}
                <tr class="totals-row">
                  <td style="text-align: left;">TOTALS</td>
                  <td>${teamTotals.points}</td>
                  <td>${teamTotals.rebounds}</td>
                  <td>${teamTotals.assists}</td>
                  <td>${teamTotals.steals}</td>
                  <td>${teamTotals.blocks}</td>
                  <td>${teamTotals.turnovers}</td>
                  <td>${teamTotals.fgMade}/${teamTotals.fgAttempted}</td>
                  <td>${teamFgPct}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          ${currentGame.ai_summary ? `
            <div class="section">
              <h2>AI Game Summary</h2>
              <div class="ai-summary">
                ${currentGame.ai_summary.replace(/\n/g, '<br>')}
              </div>
            </div>
          ` : ''}
          
          <div class="footer">
            Generated by CourtClock • ${new Date().toLocaleDateString()}
          </div>
        </body>
        </html>
      `;
      
      // Generate PDF
      const { uri } = await Print.printToFileAsync({ html });
      
      // Share the PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Game Report - ${currentGame.home_team_name} vs ${currentGame.opponent_name}`,
          UTI: 'com.adobe.pdf'
        });
      } else {
        Alert.alert('Success', 'PDF saved to: ' + uri);
      }
    } catch (error) {
      console.error('PDF export error:', error);
      Alert.alert('Error', 'Failed to generate PDF report');
    } finally {
      setExportingPdf(false);
    }
  };

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
    const resultEmoji = isWin ? '🏆' : '📊';
    const resultText = isWin ? 'VICTORY' : 'Game Result';
    
    // Build the full share message
    let message = `${resultEmoji} ${resultText}\n`;
    message += `${currentGame.home_team_name || 'Our Team'} vs ${currentGame.opponent_name}\n`;
    message += `Final Score: ${currentGame.our_score} - ${currentGame.opponent_score}\n\n`;
    
    // Add AI summary if available
    if (currentGame.ai_summary) {
      message += `${currentGame.ai_summary}\n\n`;
    }
    
    // Add hashtags
    message += `#Basketball #HoopStats`;
    
    // Show share options
    Alert.alert(
      'Share Game Summary',
      'How would you like to share?',
      [
        {
          text: 'Copy to Clipboard',
          onPress: () => {
            Clipboard.setString(message);
            Alert.alert('Copied!', 'Game summary copied to clipboard. You can now paste it anywhere including Facebook.');
          },
        },
        {
          text: 'Share via Apps',
          onPress: async () => {
            try {
              await Share.share({ 
                message,
                title: `${currentGame.home_team_name || 'Game'} vs ${currentGame.opponent_name} - ${isWin ? 'Win' : 'Result'}`
              });
            } catch (error) {
              console.error('Share error:', error);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
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
  
  // Helper to format minutes from seconds
  const formatMinutes = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Get period options based on period_type
  const periodType = currentGame.period_type || 'halves';
  const periodOptions = periodType === 'quarters' 
    ? ['all', 'h1', 'h2', 'q1', 'q2', 'q3', 'q4'] 
    : ['all', 'h1', 'h2'];

  // Helper to filter shots by period
  const filterShotsByPeriod = (shots: any[]) => {
    if (selectedPeriod === 'all') return shots;
    if (selectedPeriod === 'h1') {
      return periodType === 'quarters' 
        ? shots.filter(s => s.period === 1 || s.period === 2)
        : shots.filter(s => s.period === 1);
    }
    if (selectedPeriod === 'h2') {
      return periodType === 'quarters'
        ? shots.filter(s => s.period === 3 || s.period === 4)
        : shots.filter(s => s.period === 2);
    }
    // q1, q2, q3, q4
    const qNum = parseInt(selectedPeriod.substring(1));
    return shots.filter(s => s.period === qNum);
  };

  // Helper to filter stat_events by period
  const filterStatEventsByPeriod = (events: any[] | undefined) => {
    if (!events || selectedPeriod === 'all') return events || [];
    if (selectedPeriod === 'h1') {
      return periodType === 'quarters'
        ? events.filter(e => e.period === 1 || e.period === 2)
        : events.filter(e => e.period === 1);
    }
    if (selectedPeriod === 'h2') {
      return periodType === 'quarters'
        ? events.filter(e => e.period === 3 || e.period === 4)
        : events.filter(e => e.period === 2);
    }
    const qNum = parseInt(selectedPeriod.substring(1));
    return events.filter(e => e.period === qNum);
  };

  // Calculate stats from shots for a period
  const calculateShotsStats = (shots: any[]) => {
    const filteredShots = filterShotsByPeriod(shots);
    let points = 0;
    let fgMade = 0;
    let fgAttempted = 0;
    let threePtMade = 0;
    let threePtAttempted = 0;
    
    filteredShots.forEach(shot => {
      if (shot.shot_type === '3pt') {
        threePtAttempted++;
        fgAttempted++;
        if (shot.made) {
          threePtMade++;
          fgMade++;
          points += 3;
        }
      } else if (shot.shot_type === '2pt') {
        fgAttempted++;
        if (shot.made) {
          fgMade++;
          points += 2;
        }
      }
    });
    
    return { points, fgMade, fgAttempted, threePtMade, threePtAttempted };
  };

  // Calculate non-shot stats from stat_events for a period
  const calculateEventStats = (events: any[] | undefined) => {
    const filteredEvents = filterStatEventsByPeriod(events);
    const stats: { [key: string]: number } = {};
    
    filteredEvents.forEach(event => {
      const type = event.stat_type;
      stats[type] = (stats[type] || 0) + (event.value || 1);
    });
    
    return stats;
  };

  // Get player stats filtered by period
  const getFilteredPlayerStats = (ps: any) => {
    if (selectedPeriod === 'all') {
      return ps.stats;
    }
    
    // Calculate from shots and stat_events
    const shotStats = calculateShotsStats(ps.shots || []);
    const eventStats = calculateEventStats(ps.stat_events);
    
    return {
      points: shotStats.points + (eventStats.ft_made || 0),
      rebounds: (eventStats.offensive_rebounds || 0) + (eventStats.defensive_rebounds || 0),
      offensive_rebounds: eventStats.offensive_rebounds || 0,
      defensive_rebounds: eventStats.defensive_rebounds || 0,
      assists: eventStats.assists || 0,
      steals: eventStats.steals || 0,
      blocks: eventStats.blocks || 0,
      turnovers: eventStats.turnovers || 0,
      fouls: eventStats.fouls || 0,
      fg_made: shotStats.fgMade,
      fg_attempted: shotStats.fgAttempted,
      three_pt_made: shotStats.threePtMade,
      three_pt_attempted: shotStats.threePtAttempted,
      ft_made: eventStats.ft_made || 0,
      ft_attempted: eventStats.ft_attempted || 0,
    };
  };

  const allShots = currentGame.player_stats.flatMap(ps => filterShotsByPeriod(ps.shots || []));

  // Calculate team totals using filtered stats
  const teamStats = currentGame.player_stats.reduce((totals, ps) => {
    const stats = getFilteredPlayerStats(ps);
    const playerOreb = stats.offensive_rebounds || 0;
    const playerDreb = stats.defensive_rebounds || 0;
    const playerTotalReb = stats.rebounds || (playerOreb + playerDreb);
    return {
      points: totals.points + (stats.points || 0),
      rebounds: totals.rebounds + playerTotalReb,
      offensive_rebounds: totals.offensive_rebounds + playerOreb,
      defensive_rebounds: totals.defensive_rebounds + playerDreb,
      assists: totals.assists + (stats.assists || 0),
      steals: totals.steals + (stats.steals || 0),
      blocks: totals.blocks + (stats.blocks || 0),
      turnovers: totals.turnovers + (stats.turnovers || 0),
      fouls: totals.fouls + (stats.fouls || 0),
      fg_made: totals.fg_made + (stats.fg_made || 0),
      fg_attempted: totals.fg_attempted + (stats.fg_attempted || 0),
      three_pt_made: totals.three_pt_made + (stats.three_pt_made || 0),
      three_pt_attempted: totals.three_pt_attempted + (stats.three_pt_attempted || 0),
      ft_made: totals.ft_made + (stats.ft_made || 0),
      ft_attempted: totals.ft_attempted + (stats.ft_attempted || 0),
    };
  }, {
    points: 0, rebounds: 0, offensive_rebounds: 0, defensive_rebounds: 0,
    assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0,
    fg_made: 0, fg_attempted: 0, three_pt_made: 0, three_pt_attempted: 0,
    ft_made: 0, ft_attempted: 0
  });

  const fgPct = teamStats.fg_attempted > 0 ? Math.round((teamStats.fg_made / teamStats.fg_attempted) * 100) : 0;
  const threePct = teamStats.three_pt_attempted > 0 ? Math.round((teamStats.three_pt_made / teamStats.three_pt_attempted) * 100) : 0;
  const ftPct = teamStats.ft_attempted > 0 ? Math.round((teamStats.ft_made / teamStats.ft_attempted) * 100) : 0;
  const isTeamMode = currentGame.player_stats.length > 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Game Result Header */}
      <View style={[styles.resultCard, isWin ? styles.resultWin : styles.resultLoss]}>
        <Text style={styles.resultLabel}>{isWin ? 'VICTORY' : 'DEFEAT'}</Text>
        <View style={styles.teamsRow}>
          <View style={styles.teamColumn}>
            <Text style={styles.teamName}>{currentGame.home_team_name || 'Home Team'}</Text>
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

      {/* Period Filter */}
      <View style={styles.periodFilterContainer}>
        <Text style={styles.periodFilterLabel}>View Stats:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodFilterScroll}>
          {periodOptions.map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodFilterBtn,
                selectedPeriod === period && styles.periodFilterBtnActive,
              ]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={[
                  styles.periodFilterBtnText,
                  selectedPeriod === period && styles.periodFilterBtnTextActive,
                ]}
              >
                {period === 'all' ? 'Full Game' : period.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* AI Summary */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Game Summary</Text>
          {subscriptionTier !== 'free' && (
            <TouchableOpacity onPress={handleGenerateSummary} disabled={generatingSummary}>
              <Ionicons 
                name="sparkles" 
                size={20} 
                color={generatingSummary ? colors.textSecondary : colors.primary} 
              />
            </TouchableOpacity>
          )}
        </View>
        
        {subscriptionTier === 'free' ? (
          <View style={styles.lockedFeature}>
            <Ionicons name="lock-closed" size={32} color={colors.textSecondary} />
            <Text style={styles.lockedFeatureTitle}>AI Game Summary</Text>
            <Text style={styles.lockedFeatureText}>
              Get AI-powered game summaries with a Pro or Team subscription
            </Text>
            <Button
              title="Upgrade to Unlock"
              onPress={() => router.push('/subscription')}
              size="small"
              style={{ marginTop: spacing.md }}
            />
          </View>
        ) : currentGame.ai_summary ? (
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
            <Button
              title="Generate Summary"
              onPress={handleGenerateSummary}
              loading={generatingSummary}
              size="small"
              style={{ marginTop: spacing.md }}
            />
          </View>
        )}
      </View>

      {/* Team Statistics (for team mode) */}
      {isTeamMode && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Team Statistics</Text>
          <View style={styles.teamStatsCard}>
            <Text style={styles.teamStatsTeamName}>{currentGame.home_team_name || 'Team'} Totals</Text>
            
            {/* Main Stats Row */}
            <View style={styles.teamStatsMainRow}>
              <View style={styles.teamStatBig}>
                <Text style={[styles.teamStatBigValue, { color: colors.points }]}>{teamStats.points}</Text>
                <Text style={styles.teamStatBigLabel}>PTS</Text>
              </View>
              <View style={styles.teamStatBig}>
                <Text style={[styles.teamStatBigValue, { color: colors.rebounds }]}>{teamStats.rebounds}</Text>
                <Text style={styles.teamStatBigLabel}>REB</Text>
              </View>
              <View style={styles.teamStatBig}>
                <Text style={[styles.teamStatBigValue, { color: colors.assists }]}>{teamStats.assists}</Text>
                <Text style={styles.teamStatBigLabel}>AST</Text>
              </View>
              <View style={styles.teamStatBig}>
                <Text style={[styles.teamStatBigValue, { color: colors.steals }]}>{teamStats.steals}</Text>
                <Text style={styles.teamStatBigLabel}>STL</Text>
              </View>
            </View>
            
            {/* Secondary Stats */}
            <View style={styles.teamStatsSecondaryRow}>
              <View style={styles.teamStatSmall}>
                <Text style={styles.teamStatSmallValue}>{teamStats.blocks}</Text>
                <Text style={styles.teamStatSmallLabel}>BLK</Text>
              </View>
              <View style={styles.teamStatSmall}>
                <Text style={styles.teamStatSmallValue}>{teamStats.offensive_rebounds}</Text>
                <Text style={styles.teamStatSmallLabel}>OREB</Text>
              </View>
              <View style={styles.teamStatSmall}>
                <Text style={styles.teamStatSmallValue}>{teamStats.defensive_rebounds}</Text>
                <Text style={styles.teamStatSmallLabel}>DREB</Text>
              </View>
              <View style={styles.teamStatSmall}>
                <Text style={[styles.teamStatSmallValue, { color: colors.turnovers }]}>{teamStats.turnovers}</Text>
                <Text style={styles.teamStatSmallLabel}>TO</Text>
              </View>
              <View style={styles.teamStatSmall}>
                <Text style={styles.teamStatSmallValue}>{teamStats.fouls}</Text>
                <Text style={styles.teamStatSmallLabel}>FOULS</Text>
              </View>
            </View>
            
            {/* Shooting Percentages */}
            <View style={styles.teamShootingRow}>
              <View style={styles.teamShootingItem}>
                <Text style={styles.teamShootingPct}>{fgPct}%</Text>
                <Text style={styles.teamShootingLabel}>FG ({teamStats.fg_made}/{teamStats.fg_attempted})</Text>
              </View>
              <View style={styles.teamShootingItem}>
                <Text style={styles.teamShootingPct}>{threePct}%</Text>
                <Text style={styles.teamShootingLabel}>3PT ({teamStats.three_pt_made}/{teamStats.three_pt_attempted})</Text>
              </View>
              <View style={styles.teamShootingItem}>
                <Text style={styles.teamShootingPct}>{ftPct}%</Text>
                <Text style={styles.teamShootingLabel}>FT ({teamStats.ft_made}/{teamStats.ft_attempted})</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Player Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Player Statistics</Text>
        {currentGame.player_stats.map((ps) => {
          const filteredStats = getFilteredPlayerStats(ps);
          const playerFgPct = filteredStats.fg_attempted > 0 ? Math.round((filteredStats.fg_made / filteredStats.fg_attempted) * 100) : 0;
          const playerThreePct = filteredStats.three_pt_attempted > 0 ? Math.round((filteredStats.three_pt_made / filteredStats.three_pt_attempted) * 100) : 0;
          const playerFtPct = filteredStats.ft_attempted > 0 ? Math.round((filteredStats.ft_made / filteredStats.ft_attempted) * 100) : 0;
          const playerOreb = filteredStats.offensive_rebounds || 0;
          const playerDreb = filteredStats.defensive_rebounds || 0;
          const playerTotalReb = filteredStats.rebounds || (playerOreb + playerDreb);
          const filteredShots = filterShotsByPeriod(ps.shots || []);
          const minutesPlayed = ps.stats.minutes_played || 0;
          
          return (
          <View key={ps.player_id} style={styles.playerStatCard}>
            <View style={styles.playerHeader}>
              <View style={styles.playerAvatar}>
                <Text style={styles.avatarText}>{ps.player_name.charAt(0)}</Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{ps.player_name}</Text>
                <View style={styles.playerSubInfo}>
                  <Text style={styles.playerPts}>{filteredStats.points || 0} PTS</Text>
                  {minutesPlayed > 0 && (
                    <Text style={styles.playerMins}>{formatMinutes(minutesPlayed)} MIN</Text>
                  )}
                </View>
              </View>
            </View>
            
            {/* All Stats Grid */}
            <View style={styles.statsGrid}>
              <StatItem label="PTS" value={filteredStats.points || 0} color={colors.points} />
              <StatItem label="REB" value={playerTotalReb} color={colors.rebounds} />
              <StatItem label="AST" value={filteredStats.assists || 0} color={colors.assists} />
              <StatItem label="STL" value={filteredStats.steals || 0} color={colors.steals} />
              <StatItem label="BLK" value={filteredStats.blocks || 0} color={colors.blocks} />
              <StatItem label="TO" value={filteredStats.turnovers || 0} color={colors.turnovers} />
            </View>
            
            {/* Rebounds Breakdown */}
            <View style={styles.reboundsRow}>
              <View style={styles.reboundItem}>
                <Text style={styles.reboundValue}>{playerOreb}</Text>
                <Text style={styles.reboundLabel}>OREB</Text>
              </View>
              <View style={styles.reboundItem}>
                <Text style={styles.reboundValue}>{playerDreb}</Text>
                <Text style={styles.reboundLabel}>DREB</Text>
              </View>
              <View style={styles.reboundItem}>
                <Text style={styles.reboundValue}>{filteredStats.fouls || 0}</Text>
                <Text style={styles.reboundLabel}>FOULS</Text>
              </View>
            </View>
            
            {/* Shooting Percentages */}
            <View style={styles.shootingPercentages}>
              <View style={styles.shootingPctItem}>
                <Text style={styles.shootingPctValue}>{playerFgPct}%</Text>
                <Text style={styles.shootingPctLabel}>FG</Text>
                <Text style={styles.shootingPctDetail}>{filteredStats.fg_made || 0}/{filteredStats.fg_attempted || 0}</Text>
              </View>
              <View style={styles.shootingPctItem}>
                <Text style={styles.shootingPctValue}>{playerThreePct}%</Text>
                <Text style={styles.shootingPctLabel}>3PT</Text>
                <Text style={styles.shootingPctDetail}>{filteredStats.three_pt_made || 0}/{filteredStats.three_pt_attempted || 0}</Text>
              </View>
              <View style={styles.shootingPctItem}>
                <Text style={styles.shootingPctValue}>{playerFtPct}%</Text>
                <Text style={styles.shootingPctLabel}>FT</Text>
                <Text style={styles.shootingPctDetail}>{filteredStats.ft_made || 0}/{filteredStats.ft_attempted || 0}</Text>
              </View>
            </View>
            
            {/* Individual Player Shot Chart */}
            {filteredShots.length > 0 && (
              <View style={styles.playerShotChartContainer}>
                <Text style={styles.playerShotChartTitle}>Shot Chart ({filteredShots.length} shots)</Text>
                <FullCourtShotChart 
                  shots={filteredShots} 
                  width={screenWidth - 80} 
                  height={(screenWidth - 80) * 1.5} 
                />
                <View style={styles.shotLegendSmall}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDotSmall, { backgroundColor: colors.shotMade }]} />
                    <Text style={styles.legendTextSmall}>
                      Made ({filteredShots.filter(s => s.made).length})
                    </Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDotSmall, { backgroundColor: colors.shotMissed }]} />
                    <Text style={styles.legendTextSmall}>
                      Missed ({filteredShots.filter(s => !s.made).length})
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
          );
        })}
      </View>

      {/* Shot Chart - Only show if team mode (single player mode shows chart in player section) */}
      {allShots.length > 0 && currentGame?.game_mode !== 'pro' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shot Chart</Text>
          <View style={styles.shotChartContainer}>
            <FullCourtShotChart shots={allShots} width={screenWidth - 40} height={(screenWidth - 40) * 1.5} />
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

      {/* Game Notes - Shows pre-game goals and allows post-game notes */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {currentGame.notes ? 'Game Goals & Notes' : 'Private Notes'}
          </Text>
          {!editingNotes ? (
            <TouchableOpacity onPress={() => setEditingNotes(true)}>
              <Ionicons name="pencil" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.notesActionButtons}>
              <TouchableOpacity 
                onPress={handleCancelNotesEdit}
                style={styles.notesCancelBtn}
              >
                <Text style={styles.notesCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleSaveNotes}
                style={styles.notesSaveBtn}
                disabled={savingNotes}
              >
                {savingNotes ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={styles.notesSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        {editingNotes ? (
          <View style={styles.notesEditCard}>
            <TextInput
              style={styles.notesInput}
              value={notesText}
              onChangeText={setNotesText}
              placeholder="Add private notes about this game (strategy, observations, goals for next game...)"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={styles.notesPrivacyNote}>
              <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
              <Text style={styles.notesPrivacyText}>Only you can see these notes</Text>
            </View>
          </View>
        ) : (
          <View style={styles.notesCard}>
            {currentGame.notes ? (
              <View>
                <View style={styles.preGameGoalsHeader}>
                  <Ionicons name="flag" size={16} color={colors.primary} />
                  <Text style={styles.preGameGoalsLabel}>Pre-Game Goals / Notes</Text>
                </View>
                <Text style={styles.notesText}>{currentGame.notes}</Text>
              </View>
            ) : (
              <TouchableOpacity 
                style={styles.emptyNotesCard}
                onPress={() => setEditingNotes(true)}
              >
                <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} />
                <Text style={styles.emptyNotesText}>Tap to add private notes</Text>
                <Text style={styles.emptyNotesHint}>Strategy, observations, goals for next game...</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

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
        {subscriptionTier === 'free' ? (
          <Button
            title="Export PDF Report"
            onPress={() => Alert.alert(
              'Pro Feature',
              'PDF export is available with a Pro or Team subscription.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Upgrade', onPress: () => router.push('/subscription') }
              ]
            )}
            variant="outline"
            icon={<Ionicons name="lock-closed" size={20} color={colors.textSecondary} />}
          />
        ) : (
          <Button
            title={exportingPdf ? "Generating PDF..." : "Export PDF Report"}
            onPress={handleExportPdf}
            loading={exportingPdf}
            disabled={exportingPdf}
            variant="primary"
            icon={<Ionicons name="document-text" size={20} color={colors.text} />}
          />
        )}
        <Button
          title="Edit Stats"
          onPress={() => setShowEditStats(!showEditStats)}
          variant={showEditStats ? 'primary' : 'outline'}
          icon={<Ionicons name="pencil" size={20} color={showEditStats ? colors.text : colors.primary} />}
        />
        {subscriptionTier === 'free' ? (
          <Button
            title="Share Game"
            onPress={() => Alert.alert(
              'Pro Feature',
              'Sharing game summaries is available with a Pro or Team subscription.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Upgrade', onPress: () => router.push('/subscription') }
              ]
            )}
            variant="outline"
            icon={<Ionicons name="lock-closed" size={20} color={colors.textSecondary} />}
          />
        ) : (
          <Button
            title="Share Game"
            onPress={handleShare}
            variant="outline"
            icon={<Ionicons name="share-social" size={20} color={colors.primary} />}
          />
        )}
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
  lockedFeature: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceLight,
    borderStyle: 'dashed',
  },
  lockedFeatureTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: spacing.sm,
  },
  lockedFeatureText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
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
  playerSubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  playerPts: {
    color: colors.primary,
    fontSize: 12,
  },
  playerMins: {
    color: colors.textSecondary,
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
    lineHeight: 22,
  },
  preGameGoalsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  preGameGoalsLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesEditCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  notesInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  notesPrivacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  notesPrivacyText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  notesActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notesCancelBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  notesCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  notesSaveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    minWidth: 60,
    alignItems: 'center',
  },
  notesSaveText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyNotesCard: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  emptyNotesText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  emptyNotesHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
    opacity: 0.7,
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
  // Team Statistics Styles
  teamStatsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  teamStatsTeamName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  teamStatsMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  teamStatBig: {
    alignItems: 'center',
  },
  teamStatBigValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  teamStatBigLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  teamStatsSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
    marginBottom: spacing.md,
  },
  teamStatSmall: {
    alignItems: 'center',
  },
  teamStatSmallValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  teamStatSmallLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  teamShootingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  teamShootingItem: {
    alignItems: 'center',
  },
  teamShootingPct: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  teamShootingLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  // Player Stats Enhancements
  reboundsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  reboundItem: {
    alignItems: 'center',
  },
  reboundValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  reboundLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  shootingPercentages: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
  },
  shootingPctItem: {
    alignItems: 'center',
  },
  shootingPctValue: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  shootingPctLabel: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  shootingPctDetail: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  // Individual Player Shot Chart Styles
  playerShotChartContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceLight,
    alignItems: 'center',
  },
  playerShotChartTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  shotLegendSmall: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  legendDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTextSmall: {
    color: colors.textSecondary,
    fontSize: 11,
    marginLeft: 4,
  },
  // Period Filter Styles
  periodFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  periodFilterLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    marginRight: spacing.sm,
  },
  periodFilterScroll: {
    flexGrow: 0,
  },
  periodFilterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.surfaceLight,
  },
  periodFilterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodFilterBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  periodFilterBtnTextActive: {
    color: colors.text,
  },
});
