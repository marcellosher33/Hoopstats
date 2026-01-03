export interface User {
  id: string;
  email: string;
  username: string;
  subscription_tier: 'free' | 'pro' | 'team';
  subscription_expires?: string;
  created_at: string;
}

export interface PlayerStats {
  points: number;
  rebounds: number;
  offensive_rebounds: number;
  defensive_rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  fg_made: number;
  fg_attempted: number;
  three_pt_made: number;
  three_pt_attempted: number;
  ft_made: number;
  ft_attempted: number;
  plus_minus: number;
  minutes_played: number;
}

export interface ShotAttempt {
  x: number;
  y: number;
  made: boolean;
  shot_type: '2pt' | '3pt' | 'ft';
  period?: number;
  quarter?: number;  // Legacy support
  timestamp: string;
}

export interface Player {
  id: string;
  user_id: string;
  team_id?: string;
  name: string;
  number?: number;
  position?: string;
  height?: string;  // e.g., "6'2" or "188cm"
  weight?: number;  // in lbs
  photo?: string;
  created_at: string;
}

export interface Team {
  id: string;
  user_id: string;
  name: string;
  logo?: string;
  color_primary: string;
  color_secondary: string;
  created_at: string;
}

export interface StatEvent {
  id: string;
  stat_type: string;
  value: number;
  period: number;
  timestamp: string;
}

export interface GamePlayerStats {
  player_id: string;
  player_name: string;
  stats: PlayerStats;
  shots: ShotAttempt[];
  stat_events?: StatEvent[];
}

export interface GameMedia {
  id: string;
  type: 'photo' | 'video';
  data?: string;  // Legacy base64 data (for backward compatibility)
  url?: string;   // New URL-based media
  timestamp: string;
  description?: string;
  is_highlight?: boolean;
  quarter?: number;
  filename?: string;
}

export interface Game {
  id: string;
  user_id: string;
  team_id?: string;
  home_team_name: string;
  opponent_name: string;
  game_date: string;
  location?: 'home' | 'away';
  game_type?: 'preseason' | 'tournament' | 'regular_season' | 'playoffs';
  venue?: string;
  period_type: 'quarters' | 'halves';
  our_score: number;
  opponent_score: number;
  status: 'in_progress' | 'completed';
  current_period: number;
  active_player_ids?: string[];  // Players currently "in" the game
  court_side?: 'top' | 'bottom';  // Which side is 1st half
  player_stats: GamePlayerStats[];
  media: GameMedia[];
  scoreboard_photo?: string;
  notes?: string;
  tags: string[];
  ai_summary?: string;
  created_at: string;
  completed_at?: string;
}

export interface HighlightReel {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  game_ids: string[];
  media_ids: string[];
  season?: string;
  created_at: string;
  ai_description?: string;
}

export type StatType = 
  | 'points_2' | 'points_3' | 'ft_made' | 'ft_missed'
  | 'miss_2' | 'miss_3'
  | 'rebounds' | 'offensive_rebounds' | 'defensive_rebounds'
  | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'fouls'
  | 'plus_minus' | 'minutes';
