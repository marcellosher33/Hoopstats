import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  Modal,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Share,
  Clipboard,
  Keyboard,
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

import { requireApiBaseUrl } from '../../src/services/apiBase';

const API_URL = requireApiBaseUrl();
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
  const [pendingShotPlayerId, setPendingShotPlayerId] = useState<string | null>(null); // Track player for shot chart in team mode
  const [showEndGameModal, setShowEndGameModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [opponentScore, setOpponentScore] = useState('0');
  const [ourScore, setOurScore] = useState('0');
  const [teamMode, setTeamMode] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustStatType, setAdjustStatType] = useState<string | null>(null);
  const [adjustStatLabel, setAdjustStatLabel] = useState<string>('');
  
  // Pro mode flag - determined by game's game_mode field
  // In pro mode: single player only, simplified team scoring (+1,+2,+3,-1)
  const isProModeGame = currentGame?.game_mode === 'pro' || currentGame?.game_mode === undefined;
  
  // New state for minutes tracking and active players
  const [playerMinutes, setPlayerMinutes] = useState<Record<string, number>>({});
  const [activePlayerIds, setActivePlayerIds] = useState<Set<string>>(new Set());
  const [isClockRunning, setIsClockRunning] = useState(false); // Master clock running state
  const [isPlayerMinutesRunning, setIsPlayerMinutesRunning] = useState(false); // Independent player minutes clock for pro mode
  const minutesIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Game Clock state
  const [gameClockSeconds, setGameClockSeconds] = useState<number>(0);
  const [showClockEditModal, setShowClockEditModal] = useState(false);
  const [editClockMinutes, setEditClockMinutes] = useState('0');
  const [editClockSeconds, setEditClockSeconds] = useState('0');
  const gameClockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Minutes editing
  const [showMinutesModal, setShowMinutesModal] = useState(false);
  const [editingMinutesPlayerId, setEditingMinutesPlayerId] = useState<string | null>(null);
  const [editingMinutesValue, setEditingMinutesValue] = useState<string>('0');
  
  // Stats filter by period (null = all periods)
  const [statsFilterPeriod, setStatsFilterPeriod] = useState<number | null>(null);
  
  // Timeout state
  const [homeTimeouts, setHomeTimeouts] = useState(0);
  const [awayTimeouts, setAwayTimeouts] = useState(0);
  const [isTimeout, setIsTimeout] = useState(false);
  const [timeoutTeam, setTimeoutTeam] = useState<'home' | 'away' | null>(null);
  
  // Court side selection: 'top' means top of screen is 1st half, 'bottom' means bottom is 1st half
  const [firstHalfCourtSide, setFirstHalfCourtSide] = useState<'top' | 'bottom'>('top');
  const [showCourtSideModal, setShowCourtSideModal] = useState(false);
  
  // Show opponent score adjustment modal
  const [showOpponentScoreAdjust, setShowOpponentScoreAdjust] = useState(false);
  
  // Final Score Modal for Pro Mode
  const [showFinalScoreModal, setShowFinalScoreModal] = useState(false);
  const [finalOurScore, setFinalOurScore] = useState('0');
  const [finalOpponentScore, setFinalOpponentScore] = useState('0');
  
  // Share and Undo History
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [showUndoHistory, setShowUndoHistory] = useState(false);
  const [undoHistory, setUndoHistory] = useState<any[]>([]);
  
  // Subscription status
  const [subscriptionTier, setSubscriptionTier] = useState<string>('free');
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [cameraZoom, setCameraZoom] = useState(0);

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

  // Load active players, court side, and game clock from game data when it loads
  useEffect(() => {
    if (currentGame) {
      setOpponentScore(currentGame.opponent_score.toString());
      setOurScore(currentGame.our_score.toString());
      
      // Restore active players from saved game state
      if (currentGame.active_player_ids && currentGame.active_player_ids.length > 0) {
        setActivePlayerIds(new Set(currentGame.active_player_ids));
      }
      
      // Restore court side preference
      if (currentGame.court_side) {
        setFirstHalfCourtSide(currentGame.court_side as 'top' | 'bottom');
      }
      
      // Initialize game clock from saved state
      if (currentGame.game_clock_seconds !== undefined) {
        setGameClockSeconds(currentGame.game_clock_seconds);
      } else if (currentGame.period_time_minutes) {
        setGameClockSeconds(currentGame.period_time_minutes * 60);
      }
      
      // Initialize minutes for all players from saved backend data
      // This ensures minutes are continuous across periods (halves, quarters, OT)
      const initialMinutes: Record<string, number> = {};
      currentGame.player_stats.forEach(ps => {
        // Use saved minutes_played from backend, fallback to current local state, then 0
        initialMinutes[ps.player_id] = ps.stats.minutes_played || playerMinutes[ps.player_id] || 0;
      });
      setPlayerMinutes(initialMinutes);
    }
  }, [currentGame?.id]); // Only run when game ID changes to avoid resetting on every update

  // Game clock countdown effect
  useEffect(() => {
    if (gameClockRef.current) {
      clearInterval(gameClockRef.current);
      gameClockRef.current = null;
    }
    
    if (isClockRunning && gameClockSeconds > 0) {
      gameClockRef.current = setInterval(() => {
        setGameClockSeconds(prev => {
          if (prev <= 1) {
            // Clock reached 0 - stop the clock and auto-advance to next period
            setIsClockRunning(false);
            
            // Auto-advance to next period after a short delay
            setTimeout(() => {
              if (currentGame) {
                const periodType = currentGame.period_type || 'quarters';
                const currentPeriod = currentGame.current_period || 1;
                const maxPeriods = periodType === 'halves' ? 2 : 4;
                
                if (currentPeriod < maxPeriods) {
                  // Advance to next regular period
                  const nextPeriod = currentPeriod + 1;
                  const periodLength = currentGame.period_length || (periodType === 'halves' ? 20 : 12);
                  const newClockSeconds = periodLength * 60;
                  
                  // Update game with next period
                  if (token && id) {
                    updateGame(id, {
                      current_period: nextPeriod,
                      game_clock_seconds: newClockSeconds,
                      clock_running: false,
                    }, token);
                  }
                  
                  // Update local state
                  setGameClockSeconds(newClockSeconds);
                  
                  Alert.alert(
                    periodType === 'halves' ? `Half ${currentPeriod} Complete` : `Quarter ${currentPeriod} Complete`,
                    periodType === 'halves' ? `Starting Half ${nextPeriod}` : `Starting Quarter ${nextPeriod}`,
                    [{ text: 'OK' }]
                  );
                } else {
                  // End of regulation - ask about overtime
                  Alert.alert(
                    'End of Regulation',
                    'Would you like to start Overtime?',
                    [
                      { text: 'End Game', style: 'cancel' },
                      { 
                        text: 'Start OT', 
                        onPress: () => {
                          const otPeriod = currentPeriod + 1;
                          const otClockSeconds = 5 * 60; // 5 minutes for OT
                          
                          if (token && id) {
                            updateGame(id, {
                              current_period: otPeriod,
                              game_clock_seconds: otClockSeconds,
                              clock_running: false,
                            }, token);
                          }
                          
                          setGameClockSeconds(otClockSeconds);
                        }
                      }
                    ]
                  );
                }
              }
            }, 500);
            
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (gameClockRef.current) {
        clearInterval(gameClockRef.current);
        gameClockRef.current = null;
      }
    };
  }, [isClockRunning, gameClockSeconds > 0, currentGame, token, id]);

  // Save game clock to backend periodically when running
  const saveClockDebounced = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!token || !id || !currentGame) return;
    
    if (saveClockDebounced.current) {
      clearTimeout(saveClockDebounced.current);
    }
    
    saveClockDebounced.current = setTimeout(() => {
      updateGame(id, { 
        game_clock_seconds: gameClockSeconds,
        clock_running: isClockRunning,
        player_minutes: playerMinutes // Save player minutes with clock state
      }, token);
    }, 2000); // Save every 2 seconds
    
    return () => {
      if (saveClockDebounced.current) {
        clearTimeout(saveClockDebounced.current);
      }
    };
  }, [gameClockSeconds, isClockRunning, playerMinutes, token, id, currentGame]);

  // Save clock running state IMMEDIATELY when it changes (for live view sync)
  const prevIsClockRunning = useRef(isClockRunning);
  useEffect(() => {
    if (!token || !id || !currentGame) return;
    
    // Only save immediately when clock running state actually changes
    if (prevIsClockRunning.current !== isClockRunning) {
      prevIsClockRunning.current = isClockRunning;
      console.log('[Game] Clock running state changed to:', isClockRunning, '- saving immediately');
      updateGame(id, { 
        game_clock_seconds: gameClockSeconds,
        clock_running: isClockRunning,
      }, token);
    }
  }, [isClockRunning, token, id, currentGame, gameClockSeconds]);

  // Format seconds to MM:SS
  const formatClock = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Toggle master clock (starts/stops both game clock and player minutes)
  const toggleMasterClock = () => {
    setIsClockRunning(prev => !prev);
  };

  // Open clock edit modal
  const openClockEdit = () => {
    const mins = Math.floor(gameClockSeconds / 60);
    const secs = gameClockSeconds % 60;
    setEditClockMinutes(mins.toString());
    setEditClockSeconds(secs.toString());
    setShowClockEditModal(true);
  };

  // Save edited clock time
  const saveClockEdit = () => {
    const mins = parseInt(editClockMinutes) || 0;
    const secs = parseInt(editClockSeconds) || 0;
    const totalSeconds = (mins * 60) + Math.min(secs, 59);
    setGameClockSeconds(totalSeconds);
    setShowClockEditModal(false);
  };

  // Reset clock to period time
  const resetClockToPeriodTime = () => {
    if (currentGame?.period_time_minutes) {
      setGameClockSeconds(currentGame.period_time_minutes * 60);
    }
  };

  // Call timeout for a team - stops all clocks automatically
  const callTimeout = (team: 'home' | 'away') => {
    // Stop all clocks
    setIsClockRunning(false);
    
    // Increment timeout count
    const newHomeTimeouts = team === 'home' ? homeTimeouts + 1 : homeTimeouts;
    const newAwayTimeouts = team === 'away' ? awayTimeouts + 1 : awayTimeouts;
    
    if (team === 'home') {
      setHomeTimeouts(newHomeTimeouts);
    } else {
      setAwayTimeouts(newAwayTimeouts);
    }
    
    // Set timeout state for visual feedback
    setIsTimeout(true);
    setTimeoutTeam(team);
    
    // Save timeout to backend for live view sync
    if (token && id) {
      console.log('[Game] Saving timeout to backend:', { home_timeouts: newHomeTimeouts, away_timeouts: newAwayTimeouts, last_timeout_team: team });
      updateGame(id, {
        home_timeouts: newHomeTimeouts,
        away_timeouts: newAwayTimeouts,
        last_timeout_team: team,
        clock_running: false,
      }, token).then(() => {
        console.log('[Game] Timeout saved successfully');
      }).catch((err) => {
        console.error('[Game] Failed to save timeout:', err);
      });
    }
    
    // Show alert
    Alert.alert(
      'TIMEOUT',
      `${team === 'home' ? currentGame?.home_team_name || 'Home' : currentGame?.opponent_name || 'Away'} timeout called.\n\nTimeouts used: ${team === 'home' ? newHomeTimeouts : newAwayTimeouts}`,
      [
        { 
          text: 'Resume Play', 
          onPress: () => {
            setIsTimeout(false);
            setTimeoutTeam(null);
          }
        }
      ]
    );
  };

  // Get period status text
  const getPeriodStatusText = (): string | null => {
    if (!currentGame) return null;
    
    const isQuarters = currentGame.period_type === 'quarters';
    const currentPeriod = currentGame.current_period || 1;
    const totalPeriods = isQuarters ? 4 : 2;
    const isTied = currentGame.our_score === currentGame.opponent_score;
    const isOT = currentPeriod > totalPeriods;
    
    // Only show status if clock is at 0
    if (gameClockSeconds > 0) return null;
    
    // In overtime
    if (isOT) {
      if (isTied) {
        return `END OF OT${currentPeriod - totalPeriods} - TIED`;
      }
      return 'FINAL';
    }
    
    // End of regulation
    if (currentPeriod >= totalPeriods) {
      if (isTied) {
        return 'TIED - TAP OT TO CONTINUE';
      }
      return 'FINAL';
    } else if (isQuarters) {
      if (currentPeriod === 2) return 'HALFTIME';
      return `END OF Q${currentPeriod}`;
    } else {
      return `END OF ${currentPeriod === 1 ? '1ST' : '2ND'} HALF`;
    }
  };

  // Save active players to backend when they change
  const saveActivePlayersDebounced = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActivePlayerIds = useRef<string[]>([]);
  
  useEffect(() => {
    if (!token || !id || !currentGame) return;
    
    const currentIds = Array.from(activePlayerIds).sort().join(',');
    const prevIds = prevActivePlayerIds.current.sort().join(',');
    
    // Only update if the active players actually changed
    if (currentIds === prevIds) return;
    
    prevActivePlayerIds.current = Array.from(activePlayerIds);
    
    // Debounce to avoid too many API calls
    if (saveActivePlayersDebounced.current) {
      clearTimeout(saveActivePlayersDebounced.current);
    }
    
    saveActivePlayersDebounced.current = setTimeout(() => {
      updateGame(id, { active_player_ids: Array.from(activePlayerIds) }, token);
    }, 1000);
    
    return () => {
      if (saveActivePlayersDebounced.current) {
        clearTimeout(saveActivePlayersDebounced.current);
      }
    };
  }, [activePlayerIds, token, id, currentGame?.id]);

  // Save court side preference when it changes
  const prevCourtSide = useRef(firstHalfCourtSide);
  useEffect(() => {
    if (!token || !id || !currentGame) return;
    // Only update if the value actually changed (not on initial load)
    if (prevCourtSide.current !== firstHalfCourtSide) {
      prevCourtSide.current = firstHalfCourtSide;
      updateGame(id, { court_side: firstHalfCourtSide }, token);
    }
  }, [firstHalfCourtSide, token, id, currentGame?.id]);

  // Minutes tracking interval for team mode
  useEffect(() => {
    // Clear any existing interval first
    if (minutesIntervalRef.current) {
      clearInterval(minutesIntervalRef.current);
      minutesIntervalRef.current = null;
    }
    
    if (teamMode && activePlayerIds.size > 0 && isClockRunning) {
      minutesIntervalRef.current = setInterval(() => {
        setPlayerMinutes(prev => {
          const updated = { ...prev };
          activePlayerIds.forEach(playerId => {
            updated[playerId] = (updated[playerId] || 0) + 1;
          });
          return updated;
        });
      }, 1000);
    }

    return () => {
      if (minutesIntervalRef.current) {
        clearInterval(minutesIntervalRef.current);
        minutesIntervalRef.current = null;
      }
    };
  }, [teamMode, activePlayerIds.size, isClockRunning]);

  // Single player mode clock - INDEPENDENT of game clock in pro mode
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    
    // In pro mode (isProModeGame), player minutes runs independently
    // In team mode with single player view, it follows the game clock
    const shouldRunMinutes = isProModeGame 
      ? isPlayerMinutesRunning && selectedPlayer
      : !teamMode && isClockRunning && selectedPlayer;
    
    if (shouldRunMinutes) {
      interval = setInterval(() => {
        setPlayerMinutes(prev => ({
          ...prev,
          [selectedPlayer!]: (prev[selectedPlayer!] || 0) + 1
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [teamMode, isClockRunning, selectedPlayer, isProModeGame, isPlayerMinutesRunning]);

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
    
    // Filter stat events by period
    const filteredStatEvents = (playerStats.stat_events || []).filter(
      event => event.period === statsFilterPeriod
    );
    
    // Calculate shooting stats from shots
    let points = 0;
    let fg_made = 0;
    let fg_attempted = 0;
    let three_pt_made = 0;
    let three_pt_attempted = 0;
    let ft_made = 0;
    let ft_attempted = 0;
    
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
    
    // Calculate other stats from stat events
    let offensive_rebounds = 0;
    let defensive_rebounds = 0;
    let rebounds = 0;
    let assists = 0;
    let steals = 0;
    let blocks = 0;
    let turnovers = 0;
    let fouls = 0;
    
    filteredStatEvents.forEach(event => {
      const value = event.value || 1;
      switch (event.stat_type) {
        case 'offensive_rebounds':
          offensive_rebounds += value;
          rebounds += value;
          break;
        case 'defensive_rebounds':
          defensive_rebounds += value;
          rebounds += value;
          break;
        case 'rebounds':
          rebounds += value;
          break;
        case 'assists':
          assists += value;
          break;
        case 'steals':
          steals += value;
          break;
        case 'blocks':
          blocks += value;
          break;
        case 'turnovers':
          turnovers += value;
          break;
        case 'fouls':
          fouls += value;
          break;
        case 'ft_made':
          ft_made += value;
          ft_attempted += value;
          points += value;
          break;
        case 'ft_missed':
          ft_attempted += value;
          break;
      }
    });
    
    return {
      points,
      fg_made,
      fg_attempted,
      three_pt_made,
      three_pt_attempted,
      ft_made,
      ft_attempted,
      offensive_rebounds,
      defensive_rebounds,
      rebounds,
      assists,
      steals,
      blocks,
      turnovers,
      fouls,
      plus_minus: playerStats.stats.plus_minus || 0, // Keep total (not period-tracked)
      minutes_played: playerStats.stats.minutes_played || 0, // Keep total
    };
  };

  // Get filtered shots for the shot chart
  const getFilteredShots = (shots: any[]) => {
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
    // Use pendingShotPlayerId if available (team mode), otherwise use selectedPlayer
    const playerId = pendingShotPlayerId || selectedPlayer;
    if (!pendingShotType || !playerId) {
      console.log('[handleShotChartPress] Missing data:', { pendingShotType, playerId, pendingShotPlayerId, selectedPlayer });
      return;
    }
    
    let statType: StatType;
    if (pendingShotMade) {
      statType = pendingShotType === '3pt' ? 'points_3' : 'points_2';
    } else {
      statType = pendingShotType === '3pt' ? 'miss_3' : 'miss_2';
    }
    
    // Use handleTeamStatPress with player ID to avoid state timing issues
    handleTeamStatPress(playerId, statType, { x, y });
    setShowShotChart(false);
    setPendingShotType(null);
    setPendingShotMade(true);
    setPendingShotPlayerId(null); // Clear the pending player
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
    const newOpponentScore = Math.max(0, currentGame.opponent_score + points); // Don't go below 0
    await updateGame(id, { opponent_score: newOpponentScore }, token);
  };

  // Handle editing player minutes
  const handleEditMinutes = (playerId: string, playerName: string) => {
    const currentMinutes = playerMinutes[playerId] || 0;
    const mins = Math.floor(currentMinutes / 60);
    const secs = currentMinutes % 60;
    setEditingMinutesPlayerId(playerId);
    setEditingMinutesValue(`${mins}:${secs.toString().padStart(2, '0')}`);
    setShowMinutesModal(true);
  };

  const handleSaveMinutes = () => {
    if (!editingMinutesPlayerId) return;
    
    // Parse the time value (format: MM:SS or just minutes)
    let totalSeconds = 0;
    const value = editingMinutesValue.trim();
    
    if (value.includes(':')) {
      const parts = value.split(':');
      const mins = parseInt(parts[0]) || 0;
      const secs = parseInt(parts[1]) || 0;
      totalSeconds = mins * 60 + secs;
    } else {
      // Assume it's just minutes
      totalSeconds = (parseInt(value) || 0) * 60;
    }
    
    setPlayerMinutes(prev => ({
      ...prev,
      [editingMinutesPlayerId]: totalSeconds
    }));
    
    setShowMinutesModal(false);
    setEditingMinutesPlayerId(null);
  };

  const handleEndGame = async () => {
    if (!token || !id || !currentGame) return;
    
    // Close the end game modal first
    setShowEndGameModal(false);
    
    // For Pro Mode, show final score modal first
    if (isProModeGame) {
      setFinalOurScore((currentGame.our_score || 0).toString());
      setFinalOpponentScore((currentGame.opponent_score || 0).toString());
      setShowFinalScoreModal(true);
      return;
    }
    
    // Use the actual current game scores and include player minutes
    await updateGame(id, { 
      status: 'completed', 
      our_score: currentGame.our_score,
      opponent_score: currentGame.opponent_score,
      player_minutes: playerMinutes, // Save all player minutes
    }, token);
    router.replace(`/game/summary/${id}`);
  };

  const handleConfirmFinalScore = async () => {
    if (!token || !id || !currentGame) return;
    
    const ourFinal = parseInt(finalOurScore) || 0;
    const oppFinal = parseInt(finalOpponentScore) || 0;
    
    await updateGame(id, { 
      status: 'completed', 
      our_score: ourFinal,
      opponent_score: oppFinal,
      player_minutes: playerMinutes,
    }, token);
    setShowFinalScoreModal(false);
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

  // Live Share functionality
  const handleShareGame = async () => {
    if (!token || !id) return;
    
    try {
      // Generate share token from backend
      const response = await fetch(`${API_URL}/api/games/${id}/share`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        Alert.alert('Error', error.detail || 'Failed to create share link');
        return;
      }
      
      const data = await response.json();
      const shareUrl = `${API_URL}/api/live-view/${data.share_token}`;
      
      // Show share options
      Alert.alert(
        'Share Live Game',
        `Anyone with this link can view the game live:\n\n${shareUrl}`,
        [
          {
            text: 'Copy Link',
            onPress: () => {
              Clipboard.setString(shareUrl);
              Alert.alert('Copied!', 'Share link copied to clipboard');
            },
          },
          {
            text: 'Share',
            onPress: async () => {
              try {
                await Share.share({
                  message: `Watch the live game: ${currentGame?.home_team_name || 'Our Team'} vs ${currentGame?.opponent_name}\n\n${shareUrl}`,
                  url: shareUrl,
                });
              } catch (e) {
                console.error('Share error:', e);
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to create share link');
    }
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
      {/* Pro Mode Header - Simple player tracking, no scoreboard */}
      {isProModeGame ? (
        <LinearGradient
          colors={['#1A1A2E', '#16213E']}
          style={styles.proModeHeader}
        >
          <View style={styles.proModeHeaderContent}>
            <Text style={styles.proModeTitle}>Single Player Mode</Text>
            <Text style={styles.proModeSubtitle}>
              {currentGame.home_team_name} vs {currentGame.opponent_name}
            </Text>
            {/* Period Selector */}
            <View style={styles.proModePeriodSelector}>
              {currentGame.period_type === 'halves' ? (
                // Halves mode
                <>
                  {[1, 2].map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.proModePeriodBtn,
                        (currentGame.current_period || 1) === p && styles.proModePeriodBtnActive
                      ]}
                      onPress={async () => {
                        await updateGame(id, { current_period: p }, token);
                      }}
                    >
                      <Text style={[
                        styles.proModePeriodBtnText,
                        (currentGame.current_period || 1) === p && styles.proModePeriodBtnTextActive
                      ]}>H{p}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.proModePeriodBtn,
                      (currentGame.current_period || 1) > 2 && styles.proModePeriodBtnActive
                    ]}
                    onPress={async () => {
                      const otPeriod = Math.max(3, (currentGame.current_period || 1) + 1);
                      await updateGame(id, { current_period: currentGame.current_period > 2 ? currentGame.current_period + 1 : 3 }, token);
                    }}
                  >
                    <Text style={[
                      styles.proModePeriodBtnText,
                      (currentGame.current_period || 1) > 2 && styles.proModePeriodBtnTextActive
                    ]}>OT{(currentGame.current_period || 1) > 2 ? currentGame.current_period - 2 : ''}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                // Quarters mode
                <>
                  {[1, 2, 3, 4].map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.proModePeriodBtn,
                        (currentGame.current_period || 1) === p && styles.proModePeriodBtnActive
                      ]}
                      onPress={async () => {
                        await updateGame(id, { current_period: p }, token);
                      }}
                    >
                      <Text style={[
                        styles.proModePeriodBtnText,
                        (currentGame.current_period || 1) === p && styles.proModePeriodBtnTextActive
                      ]}>Q{p}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.proModePeriodBtn,
                      (currentGame.current_period || 1) > 4 && styles.proModePeriodBtnActive
                    ]}
                    onPress={async () => {
                      await updateGame(id, { current_period: currentGame.current_period > 4 ? currentGame.current_period + 1 : 5 }, token);
                    }}
                  >
                    <Text style={[
                      styles.proModePeriodBtnText,
                      (currentGame.current_period || 1) > 4 && styles.proModePeriodBtnTextActive
                    ]}>OT{(currentGame.current_period || 1) > 4 ? currentGame.current_period - 4 : ''}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          
          {/* Player Minutes Clock - The main clock in pro mode */}
          {selectedPlayer && (
            <View style={styles.proModeClockSection}>
              <TouchableOpacity 
                style={[
                  styles.proModeClockBtn,
                  isPlayerMinutesRunning && styles.proModeClockBtnActive
                ]}
                onPress={() => setIsPlayerMinutesRunning(!isPlayerMinutesRunning)}
              >
                <View style={styles.proModeClockDisplay}>
                  <Text style={styles.proModeClockTime}>
                    {formatTime(playerMinutes[selectedPlayer] || 0)}
                  </Text>
                  <Text style={styles.proModeClockLabel}>MINUTES</Text>
                </View>
                <View style={[
                  styles.proModeClockIndicator,
                  isPlayerMinutesRunning && styles.proModeClockIndicatorActive
                ]}>
                  <Ionicons 
                    name={isPlayerMinutesRunning ? "pause" : "play"} 
                    size={20} 
                    color={isPlayerMinutesRunning ? colors.warning : colors.success} 
                  />
                  <Text style={styles.proModeClockStatus}>
                    {isPlayerMinutesRunning ? 'IN' : 'OUT'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
          
          {/* End Game Button */}
          <View style={styles.proModeActions}>
            <TouchableOpacity
              style={styles.proModeEndBtn}
              onPress={handleEndGame}
            >
              <Ionicons name="flag" size={16} color={colors.error} />
              <Text style={styles.proModeEndBtnText}>End Game</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      ) : (
        /* Team Mode Header - Full Scoreboard */
        <LinearGradient
          colors={['#1A1A2E', '#16213E']}
          style={styles.header}
        >
          {/* Period Status Overlay (FINAL, END OF Q1, etc.) */}
          {getPeriodStatusText() && (
            <View style={styles.periodStatusOverlay} pointerEvents="none">
              <Text style={styles.periodStatusText}>{getPeriodStatusText()}</Text>
              <Text style={styles.periodStatusHint}>Tap clock to edit time</Text>
            </View>
          )}
          
          <TouchableOpacity style={styles.scoreBoard} onPress={() => setShowScoreModal(true)}>
            <View style={styles.teamScore}>
              <Text style={styles.teamLabel}>{currentGame.home_team_name?.toUpperCase() || 'YOUR TEAM'}</Text>
              <Text style={styles.score}>{currentGame.our_score}</Text>
              {/* Quick Score Buttons for Our Team */}
              <View style={styles.quickScoreRow}>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnMinus]}
                  onPress={async () => {
                    if (!token || !id || !currentGame) return;
                    const newScore = Math.max(0, (currentGame.our_score || 0) - 1);
                    await updateGame(id, { our_score: newScore }, token);
                  }}
                >
                  <Text style={styles.quickScoreBtnText}>-1</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnPlus1]}
                  onPress={async () => {
                    if (!token || !id || !currentGame) return;
                    const newScore = (currentGame.our_score || 0) + 1;
                    await updateGame(id, { our_score: newScore }, token);
                  }}
                >
                  <Text style={styles.quickScoreBtnTextLight}>+1</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnPlus2]}
                  onPress={async () => {
                    if (!token || !id || !currentGame) return;
                    const newScore = (currentGame.our_score || 0) + 2;
                    await updateGame(id, { our_score: newScore }, token);
                  }}
                >
                  <Text style={styles.quickScoreBtnTextLight}>+2</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnPlus3]}
                  onPress={async () => {
                    if (!token || !id || !currentGame) return;
                    const newScore = (currentGame.our_score || 0) + 3;
                    await updateGame(id, { our_score: newScore }, token);
                  }}
                >
                  <Text style={styles.quickScoreBtnTextDark}>+3</Text>
                </TouchableOpacity>
              </View>
              {/* Home Team Timeout Button */}
              <TouchableOpacity 
                style={[styles.timeoutBtn, isTimeout && timeoutTeam === 'home' && styles.timeoutBtnActive]}
                onPress={() => callTimeout('home')}
              >
                <Ionicons name="hand-left" size={12} color={colors.text} />
                <Text style={styles.timeoutBtnText}>TO ({homeTimeouts})</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.gameInfo}>
              <View style={styles.quarterBadge}>
                <Text style={styles.quarterText}>
                  {currentGame.period_type === 'halves' 
                    ? `H${currentGame.current_period || 1}` 
                    : `Q${currentGame.current_period || 1}`}
                </Text>
              </View>
              
              {/* Game Clock Display */}
              <TouchableOpacity onPress={openClockEdit} style={styles.gameClockContainer}>
                <Text style={[styles.gameClock, gameClockSeconds <= 60 && styles.gameClockLow]}>
                  {formatClock(gameClockSeconds)}
                </Text>
              </TouchableOpacity>
              
              {/* Master Time In/Out Button */}
              <TouchableOpacity 
                style={[styles.masterClockBtn, isClockRunning && styles.masterClockBtnActive]}
                onPress={toggleMasterClock}
              >
                <Ionicons 
                  name={isClockRunning ? "pause" : "play"} 
                  size={16} 
                  color={isClockRunning ? colors.text : colors.success} 
                />
                <Text style={[styles.masterClockBtnText, isClockRunning && styles.masterClockBtnTextActive]}>
                  {isClockRunning ? 'STOP' : 'START'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.editScoreHint}>
                <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.editHintText}>Tap scores to edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.teamScore}>
              <Text style={styles.teamLabel}>{currentGame.opponent_name.toUpperCase()}</Text>
              <TouchableOpacity 
                onLongPress={() => setShowOpponentScoreAdjust(true)}
                delayLongPress={500}
              >
                <Text style={styles.score}>{currentGame.opponent_score}</Text>
              </TouchableOpacity>
              {/* Quick Score Buttons for Opponent */}
              <View style={styles.quickScoreRow}>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnMinus]}
                  onPress={() => handleOpponentScore(-1)}
                >
                  <Text style={styles.quickScoreBtnText}>-1</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnOpp]}
                  onPress={() => handleOpponentScore(1)}
                >
                  <Text style={styles.quickScoreBtnTextLight}>+1</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnOpp]}
                  onPress={() => handleOpponentScore(2)}
                >
                  <Text style={styles.quickScoreBtnTextLight}>+2</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickScoreBtn, styles.quickScoreBtnOpp]}
                  onPress={() => handleOpponentScore(3)}
                >
                  <Text style={styles.quickScoreBtnTextLight}>+3</Text>
                </TouchableOpacity>
              </View>
              {/* Away Team Timeout Button */}
              <TouchableOpacity 
                style={[styles.timeoutBtn, isTimeout && timeoutTeam === 'away' && styles.timeoutBtnActive]}
                onPress={() => callTimeout('away')}
              >
                <Ionicons name="hand-left" size={12} color={colors.text} />
                <Text style={styles.timeoutBtnText}>TO ({awayTimeouts})</Text>
              </TouchableOpacity>
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
        
        {/* Court Side Selection Button */}
        <TouchableOpacity 
          style={styles.courtSideButton}
          onPress={() => setShowCourtSideModal(true)}
        >
          <Ionicons 
            name={firstHalfCourtSide === 'top' ? 'arrow-up' : 'arrow-down'} 
            size={14} 
            color={colors.primary} 
          />
          <Text style={styles.courtSideButtonText}>
            {firstHalfCourtSide === 'top' ? 'Top' : 'Bottom'} = 1st Half
          </Text>
        </TouchableOpacity>
      </LinearGradient>
      )}

      {/* Mode Toggle - Only show for team mode games */}
      {!isProModeGame && (
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, !teamMode && styles.modeBtnActive]}
            onPress={() => setTeamMode(false)}
          >
            <Ionicons name="person" size={16} color={!teamMode ? colors.text : colors.textSecondary} />
            <Text style={[styles.modeBtnText, !teamMode && styles.modeBtnTextActive]}>Single Player</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, teamMode && styles.modeBtnActive, subscriptionTier !== 'team' && styles.modeBtnDisabled]}
            onPress={() => {
              if (subscriptionTier !== 'team') {
                Alert.alert(
                  'Team Subscription Required',
                  'Team Mode is only available with a Team subscription. Upgrade to unlock this feature.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => router.push('/subscription') }
                  ]
                );
                return;
              }
              setTeamMode(true);
            }}
          >
            <Ionicons name="people" size={16} color={teamMode ? colors.text : colors.textSecondary} />
            <Text style={[styles.modeBtnText, teamMode && styles.modeBtnTextActive]}>Team Mode</Text>
            {subscriptionTier !== 'team' && (
              <Ionicons name="lock-closed" size={12} color={colors.textSecondary} style={{ marginLeft: 4 }} />
            )}
          </TouchableOpacity>
        </View>
      )}

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
                    // Store player ID separately to avoid state timing issues
                    setPendingShotPlayerId(ps.player_id);
                    setSelectedPlayer(ps.player_id);
                    setPendingShotType(shotType);
                    setPendingShotMade(made);
                    setShowShotChart(true);
                  }}
                  onLongPress={(statType, label) => handleLongPressAdjust(statType, label, ps.player_id)}
                  onMinutesPress={() => handleEditMinutes(ps.player_id, ps.player_name)}
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
                  // Store player ID separately to avoid state timing issues
                  setPendingShotPlayerId(ps.player_id);
                  setSelectedPlayer(ps.player_id);
                  setPendingShotType(shotType);
                  setPendingShotMade(made);
                  setShowShotChart(true);
                }}
                onLongPress={(statType, label) => handleLongPressAdjust(statType, label, ps.player_id)}
                onMinutesPress={() => handleEditMinutes(ps.player_id, ps.player_name)}
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
                      {/* Player Minutes - Only show in team mode games, pro mode has the big clock at top */}
                      {!isProModeGame && (
                        <View style={styles.playerStatItem}>
                          <Text style={styles.playerStatValue}>
                            {formatTime(playerMinutes[selectedPlayer] || 0)}
                          </Text>
                          <Text style={styles.playerStatLabel}>MIN</Text>
                        </View>
                      )}
                    </View>
                    {statsFilterPeriod !== null && (
                      <Text style={styles.filterNote}>
                        *MIN shows session total (not period-tracked)
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
            )}}
          </ScrollView>
        </>
      )}

      {/* Bottom Action Bar */}
      <LinearGradient
        colors={['#1A1A2E', '#0F0F1A']}
        style={styles.actionBar}
      >
        <TouchableOpacity style={styles.actionBtn} onPress={handleUndo}>
          <Ionicons name="arrow-undo" size={24} color={colors.primary} />
          <Text style={[styles.actionBtnText, { color: colors.primary }]}>Undo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShareGame}>
          <Ionicons name="share-social" size={24} color={colors.success} />
          <Text style={[styles.actionBtnText, { color: colors.success }]}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openCamera()}>
          <Ionicons name="camera" size={24} color={colors.text} />
          <Text style={styles.actionBtnText}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.endGameBtn} onPress={handleEndGame}>
          <Ionicons name="flag" size={24} color={colors.text} />
          <Text style={styles.endGameBtnText}>End</Text>
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
            <TouchableOpacity 
              style={styles.courtSideToggle}
              onPress={() => setShowCourtSideModal(true)}
            >
              <Ionicons name="swap-vertical" size={16} color={colors.primary} />
              <Text style={styles.courtSideToggleText}>
                {firstHalfCourtSide === 'top' ? 'Top = 1st Half' : 'Bottom = 1st Half'}
              </Text>
            </TouchableOpacity>
            <FullCourtShotChart
              shots={getFilteredShots(selectedPlayerStats?.shots || [])}
              onCourtPress={handleShotChartPress}
              width={screenWidth - 64}
              height={(screenWidth - 64) * 1.6}
              interactive
              firstHalfSide={firstHalfCourtSide}
            />
            <Button
              title="Cancel"
              onPress={() => {
                setShowShotChart(false);
                setPendingShotType(null);
                setPendingShotMade(true);
                setPendingShotPlayerId(null); // Clear the pending player
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

      {/* Opponent Score Adjustment Modal */}
      <Modal visible={showOpponentScoreAdjust} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.adjustModal}>
            <Text style={styles.modalTitle}>Adjust Opponent Score</Text>
            <Text style={styles.modalSubtitle}>Current: {currentGame?.opponent_score || 0}</Text>
            <View style={styles.adjustButtons}>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleOpponentScore(-1)}
              >
                <Ionicons name="remove-circle" size={48} color={colors.error} />
                <Text style={styles.adjustBtnLabel}>-1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleOpponentScore(1)}
              >
                <Ionicons name="add-circle" size={48} color={colors.success} />
                <Text style={styles.adjustBtnLabel}>+1</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.adjustButtons}>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleOpponentScore(-2)}
              >
                <Text style={[styles.adjustBtnLabel, { color: colors.error, fontSize: 24 }]}>-2</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleOpponentScore(2)}
              >
                <Text style={[styles.adjustBtnLabel, { color: colors.success, fontSize: 24 }]}>+2</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleOpponentScore(-3)}
              >
                <Text style={[styles.adjustBtnLabel, { color: colors.error, fontSize: 24 }]}>-3</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustBtn}
                onPress={() => handleOpponentScore(3)}
              >
                <Text style={[styles.adjustBtnLabel, { color: colors.success, fontSize: 24 }]}>+3</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.adjustCloseBtn}
              onPress={() => setShowOpponentScoreAdjust(false)}
            >
              <Text style={styles.adjustCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Final Score Modal - For Pro Mode End Game */}
      <Modal visible={showFinalScoreModal} animationType="fade" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableWithoutFeedback>
              <View style={styles.finalScoreModal}>
                <Text style={styles.modalTitle}>Enter Final Score</Text>
                <Text style={styles.modalSubtitle}>Game Complete</Text>
                
                <View style={styles.finalScoreInputs}>
                  <View style={styles.finalScoreTeam}>
                    <Text style={styles.finalScoreLabel}>{currentGame?.home_team_name || 'Your Team'}</Text>
                    <TextInput
                      style={styles.finalScoreInput}
                      value={finalOurScore}
                      onChangeText={setFinalOurScore}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      selectTextOnFocus
                      autoFocus={false}
                    />
                  </View>
                  
                  <Text style={styles.finalScoreVs}>vs</Text>
                  
                  <View style={styles.finalScoreTeam}>
                    <Text style={styles.finalScoreLabel}>{currentGame?.opponent_name || 'Opponent'}</Text>
                    <TextInput
                      style={styles.finalScoreInput}
                      value={finalOpponentScore}
                      onChangeText={setFinalOpponentScore}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      selectTextOnFocus
                      autoFocus={false}
                    />
                  </View>
                </View>
                
                <View style={styles.finalScoreButtons}>
                  <TouchableOpacity
                    style={styles.finalScoreCancelBtn}
                    onPress={() => setShowFinalScoreModal(false)}
                  >
                    <Text style={styles.finalScoreCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.finalScoreConfirmBtn}
                    onPress={handleConfirmFinalScore}
                  >
                    <Text style={styles.finalScoreConfirmText}>Save & End Game</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Court Side Selection Modal */}
      <Modal visible={showCourtSideModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.courtSideModal}>
            <Text style={styles.modalTitle}>Select Your Court Side</Text>
            <Text style={styles.modalSubtitle}>Which end are you shooting at in the 1st half?</Text>
            <View style={styles.courtSideOptions}>
              <TouchableOpacity
                style={[
                  styles.courtSideOption,
                  firstHalfCourtSide === 'top' && styles.courtSideOptionActive
                ]}
                onPress={() => {
                  setFirstHalfCourtSide('top');
                  setShowCourtSideModal(false);
                }}
              >
                <Ionicons name="arrow-up" size={32} color={firstHalfCourtSide === 'top' ? colors.text : colors.textSecondary} />
                <Text style={[
                  styles.courtSideOptionText,
                  firstHalfCourtSide === 'top' && styles.courtSideOptionTextActive
                ]}>Top of Screen</Text>
                <Text style={styles.courtSideOptionSubtext}>1st Half Basket</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.courtSideOption,
                  firstHalfCourtSide === 'bottom' && styles.courtSideOptionActive
                ]}
                onPress={() => {
                  setFirstHalfCourtSide('bottom');
                  setShowCourtSideModal(false);
                }}
              >
                <Ionicons name="arrow-down" size={32} color={firstHalfCourtSide === 'bottom' ? colors.text : colors.textSecondary} />
                <Text style={[
                  styles.courtSideOptionText,
                  firstHalfCourtSide === 'bottom' && styles.courtSideOptionTextActive
                ]}>Bottom of Screen</Text>
                <Text style={styles.courtSideOptionSubtext}>1st Half Basket</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.adjustCloseBtn}
              onPress={() => setShowCourtSideModal(false)}
            >
              <Text style={styles.adjustCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Minutes Edit Modal */}
      <Modal visible={showMinutesModal} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.scoreModal}>
            <Text style={styles.modalTitle}>Edit Minutes Played</Text>
            <Text style={styles.modalSubtitle}>Enter time as MM:SS or just minutes</Text>
            <TextInput
              style={styles.scoreInput}
              value={editingMinutesValue}
              onChangeText={setEditingMinutesValue}
              placeholder="0:00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => {
                  setShowMinutesModal(false);
                  setEditingMinutesPlayerId(null);
                }}
                variant="ghost"
                style={{ flex: 1 }}
              />
              <Button
                title="Save"
                onPress={handleSaveMinutes}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Clock Edit Modal */}
      <Modal visible={showClockEditModal} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.scoreModal}>
            <Text style={styles.modalTitle}>Edit Game Clock</Text>
            <Text style={styles.modalSubtitle}>Set time remaining in current period</Text>
            <View style={styles.clockEditRow}>
              <View style={styles.clockEditInput}>
                <TextInput
                  style={styles.clockEditField}
                  value={editClockMinutes}
                  onChangeText={setEditClockMinutes}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="00"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={styles.clockEditLabel}>min</Text>
              </View>
              <Text style={styles.clockEditSeparator}>:</Text>
              <View style={styles.clockEditInput}>
                <TextInput
                  style={styles.clockEditField}
                  value={editClockSeconds}
                  onChangeText={setEditClockSeconds}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="00"
                  placeholderTextColor={colors.textSecondary}
                />
                <Text style={styles.clockEditLabel}>sec</Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.resetClockBtn}
              onPress={() => {
                resetClockToPeriodTime();
                setShowClockEditModal(false);
              }}
            >
              <Ionicons name="refresh" size={18} color={colors.primary} />
              <Text style={styles.resetClockBtnText}>Reset to {currentGame?.period_time_minutes || 8}:00</Text>
            </TouchableOpacity>
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                onPress={() => setShowClockEditModal(false)}
                variant="ghost"
                style={{ flex: 1 }}
              />
              <Button
                title="Save"
                onPress={saveClockEdit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
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
  onMinutesPress: () => void;
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
  onMinutesPress,
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
              <Text style={styles.teamModePlayerStatItem}>{(player.stats.offensive_rebounds || 0) + (player.stats.defensive_rebounds || 0)} reb</Text>
              <Text style={styles.teamModePlayerStatItem}>{player.stats.assists || 0} ast</Text>
              <Text style={styles.teamModePlayerStatItem}>{player.stats.steals || 0} stl</Text>
              <Text style={styles.teamModePlayerStatItem}>{player.stats.blocks || 0} blk</Text>
              <Text style={styles.teamModePlayerStatItem}>{player.stats.turnovers || 0} to</Text>
              <TouchableOpacity onPress={onMinutesPress}>
                <Text style={styles.teamModePlayerMinutesEditable}>{formatTime(minutes)}</Text>
              </TouchableOpacity>
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
  // Timeout Button Styles
  timeoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    marginTop: 4,
  },
  timeoutBtnActive: {
    backgroundColor: colors.warning,
  },
  timeoutBtnText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Quick Score Buttons (under team scores)
  quickScoreRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  quickScoreBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    minWidth: 32,
    alignItems: 'center',
  },
  quickScoreBtnMinus: {
    backgroundColor: 'rgba(100, 100, 100, 0.4)',
  },
  quickScoreBtnPlus1: {
    backgroundColor: colors.success,
  },
  quickScoreBtnPlus2: {
    backgroundColor: colors.primary,
  },
  quickScoreBtnPlus3: {
    backgroundColor: colors.warning,
  },
  quickScoreBtnOpp: {
    backgroundColor: colors.error,
  },
  quickScoreBtnText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
  quickScoreBtnTextLight: {
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
  quickScoreBtnTextDark: {
    color: colors.background,
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Game Clock Styles
  gameClockContainer: {
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: borderRadius.md,
  },
  gameClock: {
    color: colors.text,
    fontSize: 28,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  gameClockLow: {
    color: colors.error,
  },
  masterClockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.success,
    marginTop: spacing.xs,
  },
  masterClockBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: colors.error,
  },
  masterClockBtnText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  masterClockBtnTextActive: {
    color: colors.error,
  },
  periodStatusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    pointerEvents: 'none', // Allow touches to pass through to controls
  },
  periodStatusText: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  periodStatusHint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  // Clock Edit Modal
  clockEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  clockEditInput: {
    alignItems: 'center',
  },
  clockEditField: {
    backgroundColor: colors.surfaceLight,
    color: colors.text,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    width: 80,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  clockEditLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  clockEditSeparator: {
    color: colors.text,
    fontSize: 32,
    fontWeight: 'bold',
    marginHorizontal: spacing.sm,
  },
  resetClockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  resetClockBtnText: {
    color: colors.primary,
    fontSize: 14,
  },
  // Final Score Modal
  finalScoreModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  finalScoreInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
    width: '100%',
  },
  finalScoreTeam: {
    alignItems: 'center',
    flex: 1,
  },
  finalScoreLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  finalScoreInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    minWidth: 100,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  finalScoreVs: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  finalScoreButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  finalScoreCancelBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  finalScoreCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  finalScoreConfirmBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
  },
  finalScoreConfirmText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  courtSideModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  courtSideOptions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  courtSideOption: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceLight,
    borderWidth: 2,
    borderColor: 'transparent',
    flex: 1,
  },
  courtSideOptionActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  courtSideOptionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  courtSideOptionTextActive: {
    color: colors.text,
  },
  courtSideOptionSubtext: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
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
  // Court Side Button in Header
  courtSideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
    alignSelf: 'center',
  },
  courtSideButtonText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
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
  playerStatsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  playerStatsTitle: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  periodBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  periodBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
  filterNote: {
    color: colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
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
  minutesDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  minutesClockIndicator: {
    backgroundColor: 'rgba(100, 100, 100, 0.4)',
    borderRadius: 8,
    padding: 2,
  },
  minutesClockRunning: {
    backgroundColor: 'rgba(34, 197, 94, 0.3)',
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
  courtSideToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.sm,
  },
  courtSideToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
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
  modeBtnDisabled: {
    opacity: 0.6,
  },
  modeBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: colors.text,
  },
  // Pro Mode Header (simplified, no scoreboard)
  proModeHeader: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  proModeHeaderContent: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  proModeTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  proModeSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  proModePeriodBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
  },
  proModePeriodText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
  proModePeriodSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  proModePeriodBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  proModePeriodBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  proModePeriodBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  proModePeriodBtnTextActive: {
    color: colors.background,
  },
  proModeClockSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  proModeClockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 50, 0.8)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 2,
    borderColor: 'rgba(100, 100, 100, 0.3)',
  },
  proModeClockBtnActive: {
    borderColor: colors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  proModeClockDisplay: {
    alignItems: 'center',
  },
  proModeClockTime: {
    color: colors.text,
    fontSize: 36,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  proModeClockLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  proModeClockIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(100, 100, 100, 0.3)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    minWidth: 60,
  },
  proModeClockIndicatorActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  proModeClockStatus: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  proModeActions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  proModeEndBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  proModeEndBtnText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  // Pro Mode Label (legacy - keep for backwards compatibility)
  proModeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
  },
  proModeLabelText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  // Pro Mode Team Scoring
  proModeTeamScoring: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  proModeScoreSection: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  proModeScoreLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  proModeScoreButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  proModeScoreBtn: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    minWidth: 36,
    alignItems: 'center',
  },
  proModeScoreBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
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
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  teamModePlayerPoints: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  teamModePlayerStatItem: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  teamModePlayerMinutes: {
    fontSize: 12,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  teamModePlayerMinutesEditable: {
    fontSize: 11,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'underline',
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
