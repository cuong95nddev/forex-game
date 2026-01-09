import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

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

export interface Trade {
  id: string
  user_id: string
  type: 'buy' | 'sell'
  amount: number
  price: number
  gold_quantity: number
  timestamp: string
}

export interface Position {
  id: string
  user_id: string
  gold_quantity: number
  average_price: number
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  icon: string
  cooldown_rounds: number
}

export interface UserSkill {
  id: string
  user_id: string
  skill_id: string
  quantity: number
  last_used_round: number | null
  created_at: string
  skill_definitions?: SkillDefinition
}

export interface SkillSignal {
  id: string
  signal_type: 'skill_request' | 'skill_executed' | 'skill_success' | 'skill_effect'
  from_user_id: string
  target_user_id: string | null
  skill_id: string
  amount: number
  round_number: number | null
  processed: boolean
  created_at: string
}

export interface SkillUsageLog {
  id: string
  user_id: string
  target_user_id: string | null
  skill_id: string
  round_number: number
  amount: number
  created_at: string
}
