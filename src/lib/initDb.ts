import { supabase } from '../lib/supabase'

export async function initializeDatabase() {
  try {
    console.log('Checking database...')
    
    // Check if gold_prices has data
    const { data: priceData, error: priceError } = await supabase
      .from('gold_prices')
      .select('*')
      .limit(1)
      .single()

    if (priceError && priceError.code === 'PGRST116') {
      console.log('No gold prices found, inserting initial price...')
      const { error: insertError } = await supabase
        .from('gold_prices')
        .insert([{ price: 2000, change: 0 }])

      if (insertError) {
        console.error('Error inserting initial price:', insertError)
      } else {
        console.log('Initial price inserted successfully')
      }
    } else {
      console.log('Gold price already exists:', priceData)
    }

    // Check if there's an active round
    const { data: roundData, error: roundError } = await supabase
      .from('rounds')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single()

    if (roundError && roundError.code === 'PGRST116') {
      console.log('No active round found, creating one...')
      const { error: insertRoundError } = await supabase
        .from('rounds')
        .insert([{
          round_number: 1,
          start_price: 2000,
          status: 'active'
        }])

      if (insertRoundError) {
        console.error('Error creating initial round:', insertRoundError)
      } else {
        console.log('Initial round created successfully')
      }
    } else {
      console.log('Active round already exists:', roundData)
    }

    return true
  } catch (error) {
    console.error('Database initialization error:', error)
    return false
  }
}
