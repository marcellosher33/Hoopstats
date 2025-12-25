import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Game, Player, Team, StatType } from '../types';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface GameState {
  games: Game[];
  currentGame: Game | null;
  players: Player[];
  teams: Team[];
  isLoading: boolean;
  offlineQueue: any[];

  // Games
  fetchGames: (token: string) => Promise<void>;
  fetchGame: (gameId: string, token: string) => Promise<Game | null>;
  createGame: (gameData: any, token: string) => Promise<Game>;
  updateGame: (gameId: string, data: any, token: string) => Promise<void>;
  deleteGame: (gameId: string, token: string) => Promise<void>;
  setCurrentGame: (game: Game | null) => void;

  // Stats
  recordStat: (gameId: string, playerId: string, statType: StatType, token: string, shotLocation?: { x: number; y: number }) => Promise<void>;
  undoLastStat: (gameId: string, token: string) => Promise<boolean>;
  adjustStat: (gameId: string, playerId: string, statType: string, adjustment: number, token: string) => Promise<void>;

  // Media
  addMedia: (gameId: string, mediaType: string, data: string, token: string, options?: any) => Promise<void>;

  // AI
  generateAISummary: (gameId: string, token: string) => Promise<string>;

  // Players
  fetchPlayers: (token: string, teamId?: string) => Promise<void>;
  createPlayer: (playerData: any, token: string) => Promise<Player>;
  updatePlayer: (playerId: string, playerData: any, token: string) => Promise<void>;
  deletePlayer: (playerId: string, token: string) => Promise<void>;

  // Teams
  fetchTeams: (token: string) => Promise<void>;
  createTeam: (teamData: any, token: string) => Promise<Team>;
  updateTeam: (teamId: string, teamData: any, token: string) => Promise<void>;
  deleteTeam: (teamId: string, token: string) => Promise<void>;

  // Offline
  syncOfflineData: (token: string) => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  games: [],
  currentGame: null,
  players: [],
  teams: [],
  isLoading: false,
  offlineQueue: [],

  fetchGames: async (token: string) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${API_URL}/api/games`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const games = await response.json();
        set({ games });
        await AsyncStorage.setItem('cachedGames', JSON.stringify(games));
      }
    } catch (error) {
      // Load from cache if offline
      const cached = await AsyncStorage.getItem('cachedGames');
      if (cached) {
        set({ games: JSON.parse(cached) });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchGame: async (gameId: string, token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/games/${gameId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const game = await response.json();
        set({ currentGame: game });
        return game;
      }
    } catch (error) {
      console.error('Failed to fetch game:', error);
    }
    return null;
  },

  createGame: async (gameData: any, token: string) => {
    const response = await fetch(`${API_URL}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(gameData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create game');
    }
    
    const game = await response.json();
    set((state) => ({ games: [game, ...state.games], currentGame: game }));
    return game;
  },

  updateGame: async (gameId: string, data: any, token: string) => {
    const response = await fetch(`${API_URL}/api/games/${gameId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    
    if (response.ok) {
      const updatedGame = await response.json();
      set((state) => ({
        games: state.games.map((g) => (g.id === gameId ? updatedGame : g)),
        currentGame: state.currentGame?.id === gameId ? updatedGame : state.currentGame,
      }));
    }
  },

  deleteGame: async (gameId: string, token: string) => {
    const response = await fetch(`${API_URL}/api/games/${gameId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      set((state) => ({
        games: state.games.filter((g) => g.id !== gameId),
        currentGame: state.currentGame?.id === gameId ? null : state.currentGame,
      }));
    }
  },

  setCurrentGame: (game: Game | null) => set({ currentGame: game }),

  recordStat: async (gameId: string, playerId: string, statType: StatType, token: string, shotLocation?: { x: number; y: number }) => {
    try {
      const body: any = {
        player_id: playerId,
        stat_type: statType,
        value: 1,
      };
      
      // Only include shot_location if it's provided
      if (shotLocation) {
        body.shot_location = shotLocation;
      }
      
      console.log('[GameStore] Recording stat:', { gameId, playerId, statType, body });
      console.log('[GameStore] API URL:', `${API_URL}/api/games/${gameId}/stats`);
      
      const response = await fetch(`${API_URL}/api/games/${gameId}/stats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      
      console.log('[GameStore] Response status:', response.status);
      
      if (response.ok) {
        const updatedGame = await response.json();
        console.log('[GameStore] Stat recorded successfully, new score:', updatedGame.our_score);
        set((state) => ({
          currentGame: updatedGame,
          games: state.games.map((g) => (g.id === gameId ? updatedGame : g)),
        }));
      } else {
        const errorText = await response.text();
        console.error('[GameStore] Failed to record stat:', response.status, errorText);
      }
    } catch (error) {
      console.error('[GameStore] Network error recording stat:', error);
      // Queue for offline sync
      const queue = get().offlineQueue;
      queue.push({ type: 'stat', gameId, playerId, statType, shotLocation });
      set({ offlineQueue: queue });
      await AsyncStorage.setItem('offlineQueue', JSON.stringify(queue));
    }
  },

  addMedia: async (gameId: string, mediaType: string, data: string, token: string, options?: any) => {
    const formData = new FormData();
    formData.append('media_type', mediaType);
    formData.append('data', data);
    if (options?.description) formData.append('description', options.description);
    if (options?.is_highlight) formData.append('is_highlight', 'true');
    if (options?.quarter) formData.append('quarter', options.quarter.toString());

    const response = await fetch(`${API_URL}/api/games/${gameId}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to add media');
    }
    
    // Refresh game data
    await get().fetchGame(gameId, token);
  },

  generateAISummary: async (gameId: string, token: string) => {
    const response = await fetch(`${API_URL}/api/games/${gameId}/ai-summary`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to generate summary');
    }
    
    const data = await response.json();
    await get().fetchGame(gameId, token);
    return data.summary;
  },

  fetchPlayers: async (token: string, teamId?: string) => {
    const url = teamId ? `${API_URL}/api/players?team_id=${teamId}` : `${API_URL}/api/players`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      const players = await response.json();
      set({ players });
    }
  },

  createPlayer: async (playerData: any, token: string) => {
    const response = await fetch(`${API_URL}/api/players`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(playerData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create player');
    }
    
    const player = await response.json();
    set((state) => ({ players: [...state.players, player] }));
    return player;
  },

  updatePlayer: async (playerId: string, playerData: any, token: string) => {
    const response = await fetch(`${API_URL}/api/players/${playerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(playerData),
    });
    
    if (response.ok) {
      const player = await response.json();
      set((state) => ({
        players: state.players.map((p) => (p.id === playerId ? player : p)),
      }));
    }
  },

  deletePlayer: async (playerId: string, token: string) => {
    const response = await fetch(`${API_URL}/api/players/${playerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      set((state) => ({
        players: state.players.filter((p) => p.id !== playerId),
      }));
    }
  },

  fetchTeams: async (token: string) => {
    const response = await fetch(`${API_URL}/api/teams`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      const teams = await response.json();
      set({ teams });
    }
  },

  createTeam: async (teamData: any, token: string) => {
    const response = await fetch(`${API_URL}/api/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(teamData),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create team');
    }
    
    const team = await response.json();
    set((state) => ({ teams: [...state.teams, team] }));
    return team;
  },

  updateTeam: async (teamId: string, teamData: any, token: string) => {
    const response = await fetch(`${API_URL}/api/teams/${teamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(teamData),
    });
    
    if (response.ok) {
      const team = await response.json();
      set((state) => ({
        teams: state.teams.map((t) => (t.id === teamId ? team : t)),
      }));
    }
  },

  deleteTeam: async (teamId: string, token: string) => {
    const response = await fetch(`${API_URL}/api/teams/${teamId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      set((state) => ({
        teams: state.teams.filter((t) => t.id !== teamId),
      }));
    }
  },

  syncOfflineData: async (token: string) => {
    const queueStr = await AsyncStorage.getItem('offlineQueue');
    if (!queueStr) return;
    
    const queue = JSON.parse(queueStr);
    const { recordStat } = get();
    
    for (const item of queue) {
      if (item.type === 'stat') {
        try {
          await recordStat(item.gameId, item.playerId, item.statType, token, item.shotLocation);
        } catch (error) {
          console.error('Failed to sync:', error);
        }
      }
    }
    
    await AsyncStorage.removeItem('offlineQueue');
    set({ offlineQueue: [] });
  },
}));
