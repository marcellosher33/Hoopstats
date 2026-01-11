import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  AppState,
  Animated,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius } from '../../src/utils/theme';
import { Game, ShotAttempt } from '../../src/types';
import { FullCourtShotChart } from '../../src/components/FullCourtShotChart';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width: screenWidth } = Dimensions.get('window');

// Play-by-play action interface
interface PlayByPlayAction {
  id: string;
  text: string;
  timestamp: number;
  type: 'score' | 'foul' | 'turnover' | 'rebound' | 'steal' | 'block' | 'assist' | 'miss' | 'timeout' | 'other';
}

export default function LiveGameViewer() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const appState = useRef(AppState.currentState);
  
  // Local clock state for smooth countdown
  const [localClockSeconds, setLocalClockSeconds] = useState<number | null>(null);
  const [isClockRunning, setIsClockRunning] = useState(false);
  const clockSyncRef = useRef<number | null>(null);
  
  // Refs to track current state values for use in callbacks
  const isClockRunningRef = useRef(false);
  const localClockSecondsRef = useRef<number | null>(null);
  
  // Keep refs in sync with state
  useEffect(() => {
    isClockRunningRef.current = isClockRunning;
  }, [isClockRunning]);
  
  useEffect(() => {
    localClockSecondsRef.current = localClockSeconds;
  }, [localClockSeconds]);
  
  // Play-by-play state
  const [playByPlay, setPlayByPlay] = useState<PlayByPlayAction[]>([]);
  const lastProcessedStats = useRef<string>('');
  
  // Shot chart popup state
  const [showShotPopup, setShowShotPopup] = useState(false);
  const [lastShotLocation, setLastShotLocation] = useState<{x: number, y: number, playerName?: string} | null>(null);
  const shotPopupOpacity = useRef(new Animated.Value(0)).current;
  const lastProcessedShot = useRef<string | null>(null);
  
  // Timeout tracking for play-by-play
  const lastHomeTimeouts = useRef<number | null>(null);
  const lastAwayTimeouts = useRef<number | null>(null);

  const fetchGame = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch(`${API_URL}/api/live/${token}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('Game not found or sharing has been disabled');
        } else {
          // Only set error if we don't have game data yet (initial load)
          // Don't show errors during refresh if we already have data
          if (!game) {
            setError('Failed to load game');
          }
        }
        return;
      }
      const data = await response.json();
      
      // Get the server clock running state
      const serverClockRunning = data.clock_running === true;
      const wasClockRunning = isClockRunningRef.current;
      const currentLocalClock = localClockSecondsRef.current;
      
      // DEBUG: Log what we're receiving from server
      console.log('[LiveView] Server data:', {
        clock_running: data.clock_running,
        game_clock_seconds: data.game_clock_seconds,
        serverClockRunning,
        wasClockRunning,
        currentLocalClock
      });
      
      // CLOCK SYNC LOGIC:
      // 1. First load (localClockSeconds is null) - always sync
      // 2. Clock just STOPPED (was running, now stopped) - sync to server time
      // 3. Clock is paused and was paused - sync to server time
      // 4. Clock is RUNNING - do NOT sync, let local countdown run independently
      if (currentLocalClock === null && data.game_clock_seconds !== undefined) {
        // First load - initialize local clock from server
        console.log('[LiveView] First load - syncing clock to:', data.game_clock_seconds);
        setLocalClockSeconds(data.game_clock_seconds);
        clockSyncRef.current = data.game_clock_seconds;
      } else if (!serverClockRunning && wasClockRunning && data.game_clock_seconds !== undefined) {
        // Clock just stopped - sync to server's authoritative time
        console.log('[LiveView] Clock stopped - syncing to:', data.game_clock_seconds);
        setLocalClockSeconds(data.game_clock_seconds);
        clockSyncRef.current = data.game_clock_seconds;
      } else if (!serverClockRunning && !wasClockRunning && data.game_clock_seconds !== undefined) {
        // Clock is paused and was paused - sync to keep in sync during pauses
        console.log('[LiveView] Clock paused - syncing to:', data.game_clock_seconds);
        setLocalClockSeconds(data.game_clock_seconds);
        clockSyncRef.current = data.game_clock_seconds;
      } else if (serverClockRunning) {
        console.log('[LiveView] Clock running - NOT syncing, letting local countdown run');
      }
      
      // Update running state - this will trigger/stop the local countdown
      if (serverClockRunning !== wasClockRunning) {
        console.log('[LiveView] Clock running state CHANGED:', wasClockRunning, '->', serverClockRunning);
      }
      setIsClockRunning(serverClockRunning);
      
      // Check for new made shot - show popup
      if (data.last_made_shot) {
        const shotKey = `${data.last_made_shot.player_id}_${data.last_made_shot.timestamp}`;
        if (shotKey !== lastProcessedShot.current) {
          lastProcessedShot.current = shotKey;
          // Find player name
          const playerName = data.player_stats?.find((ps: any) => ps.player_id === data.last_made_shot.player_id)?.player_name || 'Player';
          setLastShotLocation({ 
            x: data.last_made_shot.x, 
            y: data.last_made_shot.y,
            playerName
          });
          showShotAnimation();
          
          // Add to play-by-play
          const shotType = data.last_made_shot.is_three_pointer ? 'three' : 'two';
          addPlayByPlay({
            id: shotKey,
            text: `${playerName} for ${shotType}!`,
            timestamp: Date.now(),
            type: 'score'
          });
        }
      }
      
      // Detect timeout changes
      if (data.last_timeout_team) {
        const currentHomeTimeouts = data.home_timeouts || 0;
        const currentAwayTimeouts = data.away_timeouts || 0;
        
        // Check if home timeout count increased
        if (lastHomeTimeouts.current !== null && currentHomeTimeouts > lastHomeTimeouts.current) {
          const teamName = data.home_team_name || 'Home';
          addPlayByPlay({
            id: `timeout_home_${Date.now()}`,
            text: `${teamName} timeout`,
            timestamp: Date.now(),
            type: 'timeout'
          });
        }
        
        // Check if away timeout count increased
        if (lastAwayTimeouts.current !== null && currentAwayTimeouts > lastAwayTimeouts.current) {
          const teamName = data.opponent_name || 'Away';
          addPlayByPlay({
            id: `timeout_away_${Date.now()}`,
            text: `${teamName} timeout`,
            timestamp: Date.now(),
            type: 'timeout'
          });
        }
        
        // Update refs
        lastHomeTimeouts.current = currentHomeTimeouts;
        lastAwayTimeouts.current = currentAwayTimeouts;
      } else {
        // Initialize timeout refs on first load
        if (lastHomeTimeouts.current === null) {
          lastHomeTimeouts.current = data.home_timeouts || 0;
        }
        if (lastAwayTimeouts.current === null) {
          lastAwayTimeouts.current = data.away_timeouts || 0;
        }
      }
      
      // Generate play-by-play from stat changes
      if (game && data) {
        generatePlayByPlay(game, data);
      }
      
      setGame(data);
      setLastUpdate(new Date());
      setError(null); // Clear any previous errors on success
    } catch (err) {
      // Only show network error if we don't have game data yet
      // Silent fail during refresh to avoid flickering errors
      if (!game) {
        setError('Network error - check your connection');
      }
      console.log('Live view fetch error (will retry):', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, game]);
  
  // Add play-by-play action
  const addPlayByPlay = (action: PlayByPlayAction) => {
    setPlayByPlay(prev => {
      // Only keep last 5 actions
      const updated = [action, ...prev].slice(0, 5);
      return updated;
    });
  };
  
  // Generate play-by-play from stat changes
  const generatePlayByPlay = (oldGame: Game, newGame: Game) => {
    if (!oldGame.player_stats || !newGame.player_stats) return;
    
    const currentStatsKey = JSON.stringify(newGame.player_stats.map(ps => ({
      id: ps.player_id,
      pts: ps.stats.points,
      fouls: ps.stats.fouls,
      to: ps.stats.turnovers,
      stl: ps.stats.steals,
      blk: ps.stats.blocks,
      ast: ps.stats.assists,
      fga: ps.stats.fg_attempted,
      reb: (ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0)
    })));
    
    if (currentStatsKey === lastProcessedStats.current) return;
    lastProcessedStats.current = currentStatsKey;
    
    newGame.player_stats.forEach((newPs) => {
      const oldPs = oldGame.player_stats.find(p => p.player_id === newPs.player_id);
      if (!oldPs) return;
      
      const playerName = newPs.player_name.split(' ')[0]; // First name only
      
      // Check for steals
      if ((newPs.stats.steals || 0) > (oldPs.stats.steals || 0)) {
        addPlayByPlay({
          id: `stl_${newPs.player_id}_${Date.now()}`,
          text: `Steal by ${playerName}!`,
          timestamp: Date.now(),
          type: 'steal'
        });
      }
      
      // Check for blocks
      if ((newPs.stats.blocks || 0) > (oldPs.stats.blocks || 0)) {
        addPlayByPlay({
          id: `blk_${newPs.player_id}_${Date.now()}`,
          text: `Block by ${playerName}!`,
          timestamp: Date.now(),
          type: 'block'
        });
      }
      
      // Check for assists
      if ((newPs.stats.assists || 0) > (oldPs.stats.assists || 0)) {
        addPlayByPlay({
          id: `ast_${newPs.player_id}_${Date.now()}`,
          text: `Assist by ${playerName}`,
          timestamp: Date.now(),
          type: 'assist'
        });
      }
      
      // Check for missed shots (FGA increased but FGM didn't)
      const newFGA = (newPs.stats.fg_attempted || 0);
      const oldFGA = (oldPs.stats.fg_attempted || 0);
      const newFGM = (newPs.stats.fg_made || 0);
      const oldFGM = (oldPs.stats.fg_made || 0);
      if (newFGA > oldFGA && newFGM === oldFGM) {
        addPlayByPlay({
          id: `miss_${newPs.player_id}_${Date.now()}`,
          text: `${playerName} misses`,
          timestamp: Date.now(),
          type: 'miss'
        });
      }
      
      // Check for fouls
      if ((newPs.stats.fouls || 0) > (oldPs.stats.fouls || 0)) {
        addPlayByPlay({
          id: `foul_${newPs.player_id}_${Date.now()}`,
          text: `Foul on ${playerName}`,
          timestamp: Date.now(),
          type: 'foul'
        });
      }
      
      // Check for turnovers
      if ((newPs.stats.turnovers || 0) > (oldPs.stats.turnovers || 0)) {
        addPlayByPlay({
          id: `to_${newPs.player_id}_${Date.now()}`,
          text: `Turnover by ${playerName}`,
          timestamp: Date.now(),
          type: 'turnover'
        });
      }
      
      // Check for rebounds
      const newReb = (newPs.stats.offensive_rebounds || 0) + (newPs.stats.defensive_rebounds || 0);
      const oldReb = (oldPs.stats.offensive_rebounds || 0) + (oldPs.stats.defensive_rebounds || 0);
      if (newReb > oldReb) {
        addPlayByPlay({
          id: `reb_${newPs.player_id}_${Date.now()}`,
          text: `Rebound by ${playerName}`,
          timestamp: Date.now(),
          type: 'rebound'
        });
      }
    });
  };
  
  // Ref for clock interval
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Local clock countdown effect - runs when clock is running
  useEffect(() => {
    console.log('[LiveView] Clock useEffect triggered, isClockRunning:', isClockRunning);
    
    // Clear any existing interval first
    if (clockIntervalRef.current) {
      console.log('[LiveView] Clearing existing interval');
      clearInterval(clockIntervalRef.current);
      clockIntervalRef.current = null;
    }
    
    // Start countdown if clock is running
    if (isClockRunning) {
      console.log('[LiveView] Starting clock interval, current seconds:', localClockSeconds);
      clockIntervalRef.current = setInterval(() => {
        setLocalClockSeconds(prev => {
          if (prev === null || prev <= 0) {
            // Stop the interval when time runs out
            if (clockIntervalRef.current) {
              clearInterval(clockIntervalRef.current);
              clockIntervalRef.current = null;
            }
            return prev;
          }
          console.log('[LiveView] Tick:', prev, '->', prev - 1);
          return prev - 1;
        });
      }, 1000);
    } else {
      console.log('[LiveView] Clock is NOT running, no interval started');
    }
    
    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
    };
  }, [isClockRunning]);
  
  // Show shot popup animation
  const showShotAnimation = () => {
    setShowShotPopup(true);
    Animated.sequence([
      Animated.timing(shotPopupOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1500),
      Animated.timing(shotPopupOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowShotPopup(false);
    });
  };

  // Format seconds to MM:SS
  const formatClock = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get period status text
  const getPeriodStatusText = (): string | null => {
    if (!game) return null;
    
    const isQuarters = game.period_type === 'quarters';
    const currentPeriod = game.current_period || 1;
    const totalPeriods = isQuarters ? 4 : 2;
    const clockSeconds = game.game_clock_seconds || 0;
    
    // Only show status if clock is at 0 and game is not completed
    if (game.status === 'completed') {
      return 'FINAL';
    }
    
    if (clockSeconds > 0) return null;
    
    if (currentPeriod >= totalPeriods) {
      return 'FINAL';
    } else if (isQuarters) {
      if (currentPeriod === 2) return 'HALFTIME';
      return `END OF Q${currentPeriod}`;
    } else {
      return currentPeriod === 1 ? 'END OF 1ST HALF' : 'FINAL';
    }
  };

  // Format time for player minutes
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    fetchGame();
    
    // Refresh every 3 seconds for real-time updates (balanced between responsiveness and stability)
    const interval = setInterval(fetchGame, 3000);
    
    // Handle app state changes (pause when backgrounded)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchGame(); // Refresh immediately when coming back to foreground
      }
      appState.current = nextAppState;
    });
    
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [fetchGame]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGame();
  }, [fetchGame]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading live game...</Text>
      </View>
    );
  }

  if (error || !game) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle" size={64} color={colors.error} />
        <Text style={styles.errorText}>{error || 'Game not found'}</Text>
      </View>
    );
  }

  const isLive = game.status === 'in_progress';
  const isCompleted = game.status === 'completed';
  const periodStatus = getPeriodStatusText();

  return (
    <View style={styles.container}>
      {/* Live Header */}
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={styles.header}
      >
        {/* Period Status Overlay */}
        {periodStatus && (
          <View style={styles.periodStatusOverlay}>
            <Text style={styles.periodStatusText}>{periodStatus}</Text>
          </View>
        )}
        
        {isLive && !periodStatus && (
          <View style={styles.liveBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {isCompleted && !periodStatus && (
          <View style={styles.finalBadge}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.finalText}>FINAL</Text>
          </View>
        )}
        
        <View style={styles.scoreboard}>
          <View style={styles.teamSection}>
            <Text style={styles.teamName}>{game.home_team_name}</Text>
            <Text style={styles.score}>{game.our_score}</Text>
          </View>
          
          <View style={styles.gameInfo}>
            <Text style={styles.periodText}>
              {game.period_type === 'halves' ? `H${game.current_period}` : `Q${game.current_period}`}
            </Text>
            {/* Game Clock - uses local countdown for smooth display */}
            {localClockSeconds !== null && (
              <View style={styles.gameClockContainer}>
                <Text style={[
                  styles.gameClock, 
                  localClockSeconds <= 60 && styles.gameClockLow
                ]}>
                  {formatClock(localClockSeconds)}
                </Text>
                {isClockRunning && (
                  <View style={styles.clockRunningIndicator} />
                )}
              </View>
            )}
          </View>
          
          <View style={styles.teamSection}>
            <Text style={styles.teamName}>{game.opponent_name}</Text>
            <Text style={styles.score}>{game.opponent_score}</Text>
          </View>
        </View>
        
        {/* Play-by-Play Feed */}
        {playByPlay.length > 0 && (
          <View style={styles.playByPlayContainer}>
            {playByPlay.slice(0, 2).map((action, index) => (
              <Text 
                key={action.id} 
                style={[
                  styles.playByPlayText,
                  index > 0 && styles.playByPlayTextOlder
                ]}
              >
                {action.type === 'score' && '🏀 '}
                {action.type === 'foul' && '⚠️ '}
                {action.type === 'turnover' && '❌ '}
                {action.type === 'rebound' && '📊 '}
                {action.type === 'steal' && '🔥 '}
                {action.type === 'block' && '🚫 '}
                {action.type === 'assist' && '🎯 '}
                {action.type === 'miss' && '❌ '}
                {action.type === 'timeout' && '⏱️ '}
                {action.text}
              </Text>
            ))}
          </View>
        )}
        
        <Text style={styles.lastUpdate}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Player Stats - In/Out Format */}
        {game.status === 'in_progress' && (
          <>
            {/* Players In */}
            <View style={styles.playersSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.inBadge}>
                  <Text style={styles.inBadgeText}>IN</Text>
                </View>
                <Text style={styles.sectionTitle}>On Court</Text>
              </View>
              {game.player_stats
                .filter(ps => (game.active_player_ids || []).includes(ps.player_id))
                .map((ps) => (
                  <View key={ps.player_id} style={[styles.playerCard, styles.playerCardIn]}>
                    <View style={styles.playerHeader}>
                      <View style={styles.playerAvatar}>
                        <Text style={styles.playerAvatarText}>{ps.player_name.charAt(0)}</Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={styles.playerName}>{ps.player_name}</Text>
                        <Text style={styles.playerPoints}>{ps.stats.points || 0} PTS</Text>
                      </View>
                    </View>
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{ps.stats.points || 0}</Text>
                        <Text style={styles.statLabel}>PTS</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>
                          {(ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0)}
                        </Text>
                        <Text style={styles.statLabel}>REB</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{ps.stats.assists || 0}</Text>
                        <Text style={styles.statLabel}>AST</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{ps.stats.steals || 0}</Text>
                        <Text style={styles.statLabel}>STL</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{ps.stats.blocks || 0}</Text>
                        <Text style={styles.statLabel}>BLK</Text>
                      </View>
                    </View>
                    {/* Complete Stats Row */}
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{ps.stats.turnovers || 0}</Text>
                        <Text style={styles.statLabel}>TO</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{ps.stats.fouls || 0}</Text>
                        <Text style={styles.statLabel}>PF</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>
                          {ps.stats.fg_made || 0}/{ps.stats.fg_attempted || 0}
                        </Text>
                        <Text style={styles.statLabel}>FG</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>
                          {ps.stats.three_pt_made || 0}/{ps.stats.three_pt_attempted || 0}
                        </Text>
                        <Text style={styles.statLabel}>3PT</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{formatTime(ps.stats.minutes_played || 0)}</Text>
                        <Text style={styles.statLabel}>MIN</Text>
                      </View>
                    </View>
                  </View>
                ))}
              {game.player_stats.filter(ps => (game.active_player_ids || []).includes(ps.player_id)).length === 0 && (
                <Text style={styles.emptyText}>No players on court</Text>
              )}
            </View>

            {/* Players Out / Bench */}
            <View style={styles.playersSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.outBadge}>
                  <Text style={styles.outBadgeText}>OUT</Text>
                </View>
                <Text style={styles.sectionTitle}>Bench</Text>
              </View>
              {game.player_stats
                .filter(ps => !(game.active_player_ids || []).includes(ps.player_id))
                .map((ps) => (
                  <View key={ps.player_id} style={[styles.playerCard, styles.playerCardOut]}>
                    <View style={styles.playerHeader}>
                      <View style={[styles.playerAvatar, styles.playerAvatarOut]}>
                        <Text style={styles.playerAvatarText}>{ps.player_name.charAt(0)}</Text>
                      </View>
                      <View style={styles.playerInfo}>
                        <Text style={[styles.playerName, styles.playerNameOut]}>{ps.player_name}</Text>
                        <Text style={styles.playerPointsOut}>{ps.stats.points || 0} PTS</Text>
                      </View>
                    </View>
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.points || 0}</Text>
                        <Text style={styles.statLabel}>PTS</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>
                          {(ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0)}
                        </Text>
                        <Text style={styles.statLabel}>REB</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.assists || 0}</Text>
                        <Text style={styles.statLabel}>AST</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.steals || 0}</Text>
                        <Text style={styles.statLabel}>STL</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.blocks || 0}</Text>
                        <Text style={styles.statLabel}>BLK</Text>
                      </View>
                    </View>
                    {/* Complete Stats Row */}
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.turnovers || 0}</Text>
                        <Text style={styles.statLabel}>TO</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{ps.stats.fouls || 0}</Text>
                        <Text style={styles.statLabel}>PF</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>
                          {ps.stats.fg_made || 0}/{ps.stats.fg_attempted || 0}
                        </Text>
                        <Text style={styles.statLabel}>FG</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>
                          {ps.stats.three_pt_made || 0}/{ps.stats.three_pt_attempted || 0}
                        </Text>
                        <Text style={styles.statLabel}>3PT</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statValueOut}>{formatTime(ps.stats.minutes_played || 0)}</Text>
                        <Text style={styles.statLabel}>MIN</Text>
                      </View>
                    </View>
                  </View>
                ))}
            </View>
          </>
        )}

        {/* All Player Stats (shown when game is completed) */}
        {game.status === 'completed' && (
          <View style={styles.playersSection}>
            <Text style={styles.sectionTitle}>Player Stats</Text>
            {game.player_stats.map((ps) => (
              <View key={ps.player_id} style={styles.playerCard}>
                <View style={styles.playerHeader}>
                  <View style={styles.playerAvatar}>
                    <Text style={styles.playerAvatarText}>{ps.player_name.charAt(0)}</Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{ps.player_name}</Text>
                    <Text style={styles.playerPoints}>{ps.stats.points || 0} PTS</Text>
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{ps.stats.points || 0}</Text>
                    <Text style={styles.statLabel}>PTS</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {(ps.stats.offensive_rebounds || 0) + (ps.stats.defensive_rebounds || 0)}
                    </Text>
                    <Text style={styles.statLabel}>REB</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{ps.stats.assists || 0}</Text>
                    <Text style={styles.statLabel}>AST</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{ps.stats.steals || 0}</Text>
                    <Text style={styles.statLabel}>STL</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{ps.stats.blocks || 0}</Text>
                    <Text style={styles.statLabel}>BLK</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {ps.stats.fg_attempted ? Math.round((ps.stats.fg_made || 0) / ps.stats.fg_attempted * 100) : 0}%
                    </Text>
                    <Text style={styles.statLabel}>FG%</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* AI Summary (shown when game is completed) */}
        {game.status === 'completed' && game.ai_summary && (
          <View style={styles.summarySection}>
            <View style={styles.summaryHeader}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
              <Text style={styles.summaryTitle}>Game Summary</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{game.ai_summary}</Text>
            </View>
          </View>
        )}

        {/* Final Score Card (shown when game is completed) */}
        {game.status === 'completed' && (
          <View style={styles.finalScoreSection}>
            <Text style={styles.finalScoreTitle}>Final Score</Text>
            <View style={styles.finalScoreCard}>
              <View style={styles.finalTeam}>
                <Text style={styles.finalTeamName}>{game.home_team_name}</Text>
                <Text style={[styles.finalScore, game.our_score > game.opponent_score && styles.winningScore]}>
                  {game.our_score}
                </Text>
              </View>
              <Text style={styles.finalDash}>-</Text>
              <View style={styles.finalTeam}>
                <Text style={styles.finalTeamName}>{game.opponent_name}</Text>
                <Text style={[styles.finalScore, game.opponent_score > game.our_score && styles.winningScore]}>
                  {game.opponent_score}
                </Text>
              </View>
            </View>
            <Text style={styles.gameResult}>
              {game.our_score > game.opponent_score ? '🏆 Victory!' : game.our_score < game.opponent_score ? 'Defeat' : 'Tie Game'}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Ionicons name="basketball" size={20} color={colors.textSecondary} />
          <Text style={styles.footerText}>Powered by HoopStats</Text>
        </View>
        
        {/* Scroll down message for game summary when game is in progress */}
        {game.status === 'in_progress' && game.player_stats && game.player_stats.length > 0 && (
          <View style={styles.scrollHintContainer}>
            <Ionicons name="chevron-down" size={24} color={colors.textSecondary} />
            <Text style={styles.scrollHintText}>Scroll down for player stats</Text>
          </View>
        )}
      </ScrollView>

      {/* Shot Chart Popup - Using the same FullCourtShotChart as the main game */}
      {showShotPopup && lastShotLocation && (
        <Animated.View 
          style={[
            styles.shotPopupOverlay,
            { opacity: shotPopupOpacity }
          ]}
        >
          <View style={styles.shotPopupContainer}>
            {/* Player name who made the shot */}
            {lastShotLocation.playerName && (
              <Text style={styles.shotPopupPlayerName}>{lastShotLocation.playerName} scores!</Text>
            )}
            
            {/* Use FullCourtShotChart to match the main game's coordinate system */}
            <View style={styles.shotChartWrapper}>
              <FullCourtShotChart
                shots={[{
                  id: 'live-shot',
                  x: lastShotLocation.x, // Already in 0-1 range
                  y: lastShotLocation.y,
                  made: true,
                  is_three_pointer: false,
                  timestamp: new Date().toISOString(),
                }]}
                width={screenWidth * 0.35}
                height={screenWidth * 0.55}
                interactive={false}
              />
            </View>
            
            <Text style={styles.shotPopupText}>MADE SHOT!</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  header: {
    padding: spacing.lg,
    paddingTop: spacing.xl + 20,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
    marginRight: spacing.xs,
  },
  liveText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: 'bold',
  },
  scoreboard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  score: {
    color: colors.text,
    fontSize: 48,
    fontWeight: 'bold',
  },
  gameInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  vsText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  periodText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Game Clock Styles
  gameClockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginVertical: spacing.xs,
  },
  gameClock: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  gameClockLow: {
    color: colors.error,
  },
  clockRunningIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginLeft: spacing.sm,
  },
  // Play-by-Play Feed
  playByPlayContainer: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  playByPlayText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  playByPlayTextOlder: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  // Period Status Overlay
  periodStatusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  periodStatusText: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Shot Popup Styles - Now uses FullCourtShotChart
  shotPopupOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  shotPopupContainer: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  shotPopupPlayerName: {
    color: colors.success,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  shotChartWrapper: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  shotPopupText: {
    color: colors.success,
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
  },
  // Scroll Hint Styles
  scrollHintContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  scrollHintText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  lastUpdate: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  playersSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  inBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: 'bold',
  },
  outBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  outBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: spacing.md,
  },
  playerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  playerCardIn: {
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  playerCardOut: {
    opacity: 0.7,
    borderLeftWidth: 3,
    borderLeftColor: colors.surfaceLight,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  playerAvatarOut: {
    backgroundColor: colors.surfaceLight,
  },
  playerAvatarText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  playerNameOut: {
    color: colors.textSecondary,
  },
  playerPoints: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  playerPointsOut: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  statValueOut: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  // Final badge styles
  finalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  finalText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  // AI Summary styles
  summarySection: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  summaryText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  // Final Score section styles
  finalScoreSection: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  finalScoreTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  finalScoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  finalTeam: {
    alignItems: 'center',
    flex: 1,
  },
  finalTeamName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  finalScore: {
    color: colors.text,
    fontSize: 36,
    fontWeight: 'bold',
  },
  winningScore: {
    color: colors.success,
  },
  finalDash: {
    color: colors.textSecondary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  gameResult: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: spacing.md,
  },
});
