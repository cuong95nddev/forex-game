export interface User {
  id: string
  fingerprint: string
  name: string
  balance: number
  created_at: string
}

export interface GoldPrice {
  id: string
  price: number
  timestamp: string
  change: number
}

export interface GameSettings {
  id: string
  round_duration: number
  price_update_interval: number
  win_rate: number
  default_user_balance: number
  min_bet_amount: number
  max_bet_amount: number
  no_bet_penalty: number
  max_round: number | null
  game_status: 'running' | 'completed'
}

export interface Round {
  id: string
  round_number: number
  start_price: number
  end_price: number | null
  start_time: string
  end_time: string | null
  status: 'active' | 'completed'
  allowed_users: string[]
}

export interface Bet {
  id: string
  user_id: string
  round_id: string
  prediction: 'up' | 'down'
  bet_amount: number
  result: 'pending' | 'won' | 'lost'
  profit: number
  created_at: string
  users?: User
}

export interface SkillSignal {
  id: string
  signal_type: 'skill_request' | 'skill_executed' | 'skill_success' | 'skill_effect' | 'skill_reward'
  from_user_id: string
  target_user_id: string | null
  skill_id: string
  amount: number
  round_number: number | null
  processed: boolean
  created_at: string
}

export interface GameState {
  isRunning: boolean
  currentRound: Round | null
  currentPrice: number
  priceChange: number
  countdown: number
  settings: GameSettings | null
}
