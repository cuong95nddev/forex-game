import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
