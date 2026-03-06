import { supabase } from '../config.js'
import type { Round, GameSettings } from '../types.js'
import { broadcastGameCompleted, broadcastNoBetPenalty } from '../services/broadcast.js'

export async function startNewRound(startPrice: number, settings: GameSettings): Promise<Round | null> {
  const { data: lastRound } = await supabase
    .from('rounds')
    .select('round_number')
    .order('round_number', { ascending: false })
    .limit(1)
    .single()

  const newRoundNumber = (lastRound?.round_number || 0) + 1

  // Check max round limit
  if (settings.max_round && newRoundNumber > settings.max_round) {
    console.log(`Cannot start round ${newRoundNumber}: max round ${settings.max_round} reached`)
    return null
  }

  console.log(`Starting round ${newRoundNumber}`)

  // Clear expired frozen users
  await supabase
    .from('frozen_users')
    .delete()
    .lt('frozen_until_round', newRoundNumber)

  // Clear expired double win buffs
  await supabase
    .from('active_double_win')
    .delete()
    .lt('next_round', newRoundNumber)

  // Get online users (active in last 1 second)
  const { data: presenceData } = await supabase
    .from('presence')
    .select('user_id')
    .eq('session_type', 'user')
    .gte('last_seen', new Date(Date.now() - 1000).toISOString())

  const allowedUsers = presenceData
    ? [...new Set(presenceData.map(p => p.user_id).filter((id): id is string => !!id))]
    : []

  console.log('Allowed users:', allowedUsers.length)

  const { data: newRound } = await supabase
    .from('rounds')
    .insert({
      round_number: newRoundNumber,
      start_price: startPrice,
      start_time: new Date().toISOString(),
      status: 'active',
      allowed_users: allowedUsers,
    })
    .select()
    .single()

  return newRound as Round | null
}

export async function completeRound(round: Round, settings: GameSettings): Promise<{ endPrice: number; shouldEndGame: boolean }> {
  // Get latest price
  const { data: latestPrice } = await supabase
    .from('gold_prices')
    .select('price')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  if (!latestPrice) return { endPrice: 2000, shouldEndGame: false }

  let endPrice = latestPrice.price
  if (endPrice < 1000 || endPrice > 10000 || isNaN(endPrice)) {
    endPrice = 2000
  }

  // Update round
  await supabase
    .from('rounds')
    .update({
      end_price: endPrice,
      end_time: new Date().toISOString(),
      status: 'completed',
    })
    .eq('id', round.id)

  // Process bets
  const { data: bets } = await supabase
    .from('bets')
    .select('*, users(*)')
    .eq('round_id', round.id)
    .eq('result', 'pending')

  if (bets) {
    for (const bet of bets) {
      const priceWentUp = endPrice > round.start_price
      const userWon =
        (bet.prediction === 'up' && priceWentUp) ||
        (bet.prediction === 'down' && !priceWentUp)

      const result = userWon ? 'won' : 'lost'
      let profit = userWon ? bet.bet_amount * settings.win_rate : 0

      // Check double win
      if (userWon) {
        const { data: doubleWin } = await supabase
          .from('active_double_win')
          .select('*')
          .eq('user_id', bet.user_id)
          .eq('next_round', round.round_number)
          .eq('used', false)
          .maybeSingle()

        if (doubleWin) {
          profit = profit * 2
          await supabase
            .from('active_double_win')
            .update({ used: true })
            .eq('id', doubleWin.id)

          console.log(`Double win applied for ${bet.user_id}: profit ${profit / 2} -> ${profit}`)

          await supabase.from('skill_signals').insert({
            signal_type: 'skill_effect',
            from_user_id: bet.user_id,
            target_user_id: bet.user_id,
            skill_id: 'double_win',
            amount: profit,
            round_number: round.round_number,
            processed: true
          })
        }
      }

      // Update bet result
      await supabase
        .from('bets')
        .update({ result, profit })
        .eq('id', bet.id)

      // Update balance if won
      if (userWon) {
        const balanceChange = bet.bet_amount + profit
        const newBalance = bet.users.balance + balanceChange
        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('id', bet.user_id)

        // Reward winner with random skill
        const { data: userSkills } = await supabase
          .from('user_skills')
          .select('*')
          .eq('user_id', bet.user_id)

        if (userSkills && userSkills.length > 0) {
          const randomSkill = userSkills[Math.floor(Math.random() * userSkills.length)]
          await supabase
            .from('user_skills')
            .update({ quantity: randomSkill.quantity + 1 })
            .eq('id', randomSkill.id)

          await supabase.from('skill_signals').insert({
            signal_type: 'skill_reward',
            from_user_id: bet.user_id,
            target_user_id: bet.user_id,
            skill_id: randomSkill.skill_id,
            amount: 1,
            round_number: round.round_number,
            processed: true
          })
        }
      }
    }
  }

  // No-bet penalty
  if (settings.no_bet_penalty > 0) {
    const { data: allUsers } = await supabase.from('users').select('id, balance, name')
    const { data: allBetsForRound } = await supabase
      .from('bets')
      .select('user_id')
      .eq('round_id', round.id)

    if (allUsers) {
      const userIdsWithBets = allBetsForRound?.map(bet => bet.user_id) || []
      const usersWithoutBets = allUsers.filter(user => !userIdsWithBets.includes(user.id))

      for (const user of usersWithoutBets) {
        const newBalance = Math.max(0, user.balance - settings.no_bet_penalty)
        await supabase.from('users').update({ balance: newBalance }).eq('id', user.id)
      }

      if (usersWithoutBets.length > 0) {
        broadcastNoBetPenalty(
          usersWithoutBets.map(u => u.id),
          settings.no_bet_penalty,
          round.round_number
        )
      }
    }
  }

  // Check max round
  const { data: latestSettings } = await supabase
    .from('game_settings')
    .select('max_round')
    .single()

  const currentMaxRound = latestSettings?.max_round || null
  const shouldEndGame = !!(currentMaxRound && round.round_number >= currentMaxRound)

  return { endPrice, shouldEndGame }
}

export async function endGame(settings: GameSettings) {
  // Update game status
  await supabase
    .from('game_settings')
    .update({
      game_status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', settings.id)

  // Wait for DB updates to propagate
  await new Promise(resolve => setTimeout(resolve, 500))

  // Get leaderboard
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .order('balance', { ascending: false })

  if (users && users.length > 0) {
    broadcastGameCompleted(users, settings.max_round)
    console.log(`Game completed! ${users.length} players on leaderboard`)
  }

  return users || []
}
