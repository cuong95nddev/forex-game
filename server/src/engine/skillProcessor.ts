import { supabase } from '../config.js'
import type { SkillSignal } from '../types.js'

let skillSubscription: any = null

export function startSkillProcessor() {
  if (skillSubscription) return

  const channelSuffix = Date.now()
  skillSubscription = supabase
    .channel(`server-skills-${channelSuffix}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'skill_signals',
      },
      async (payload: any) => {
        const signal = payload.new as SkillSignal
        if (signal.signal_type === 'skill_request' && !signal.processed) {
          await processSkillRequest(signal)
        }
      }
    )
    .subscribe()

  console.log('Skill processor started')
}

export function stopSkillProcessor() {
  if (skillSubscription) {
    skillSubscription.unsubscribe()
    skillSubscription = null
  }
}

async function processSkillRequest(signal: SkillSignal) {
  try {
    const { skill_id, from_user_id, target_user_id, round_number } = signal

    if (skill_id === 'steal_money') {
      await handleStealMoney(signal, from_user_id, target_user_id!, round_number!)
    } else if (skill_id === 'freezer') {
      await handleFreezer(signal, from_user_id, target_user_id!, round_number!)
    } else if (skill_id === 'double_win') {
      await handleDoubleWin(signal, from_user_id, round_number!)
    } else if (skill_id === 'bank_loan') {
      await handleBankLoan(signal, from_user_id, round_number!)
    }
  } catch (error) {
    console.error('Failed to process skill request:', error)
  }
}

async function decrementSkillQuantity(userId: string, skillId: string) {
  const { data: userSkill } = await supabase
    .from('user_skills')
    .select('*')
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .single()

  if (userSkill) {
    await supabase
      .from('user_skills')
      .update({ quantity: Math.max(0, userSkill.quantity - 1) })
      .eq('id', userSkill.id)
  }
}

async function markSignalProcessed(signalId: string) {
  await supabase
    .from('skill_signals')
    .update({ processed: true })
    .eq('id', signalId)
}

async function handleStealMoney(signal: SkillSignal, fromUserId: string, targetUserId: string, roundNumber: number) {
  const { data: fromUser } = await supabase.from('users').select('*').eq('id', fromUserId).single()
  const { data: targetUser } = await supabase.from('users').select('*').eq('id', targetUserId).single()

  if (!fromUser || !targetUser) return

  const stealAmount = Math.min(Math.max(Math.floor(targetUser.balance * 0.1), 100), 1000)

  await supabase.from('users').update({ balance: fromUser.balance + stealAmount }).eq('id', fromUserId)
  await supabase.from('users').update({ balance: Math.max(0, targetUser.balance - stealAmount) }).eq('id', targetUserId)

  await decrementSkillQuantity(fromUserId, 'steal_money')

  await supabase.from('skill_usage_log').insert({
    user_id: fromUserId,
    target_user_id: targetUserId,
    skill_id: 'steal_money',
    round_number: roundNumber,
    amount: stealAmount
  })

  await supabase.from('skill_signals').insert({
    signal_type: 'skill_executed',
    from_user_id: fromUserId,
    target_user_id: targetUserId,
    skill_id: 'steal_money',
    amount: stealAmount,
    round_number: roundNumber,
    processed: true
  })

  await supabase.from('skill_signals').insert({
    signal_type: 'skill_success',
    from_user_id: fromUserId,
    target_user_id: fromUserId,
    skill_id: 'steal_money',
    amount: stealAmount,
    round_number: roundNumber,
    processed: true
  })

  await markSignalProcessed(signal.id)
  console.log(`Skill: steal_money ${stealAmount} from ${targetUser.name} to ${fromUser.name}`)
}

async function handleFreezer(signal: SkillSignal, fromUserId: string, targetUserId: string, roundNumber: number) {
  const { data: fromUser } = await supabase.from('users').select('*').eq('id', fromUserId).single()
  const { data: targetUser } = await supabase.from('users').select('*').eq('id', targetUserId).single()

  if (!fromUser || !targetUser) return

  const freezeUntilRound = roundNumber

  await supabase.from('frozen_users').delete().eq('user_id', targetUserId)
  await supabase.from('frozen_users').insert({
    user_id: targetUserId,
    frozen_until_round: freezeUntilRound,
    frozen_by_user_id: fromUserId
  })

  await decrementSkillQuantity(fromUserId, 'freezer')

  await supabase.from('skill_usage_log').insert({
    user_id: fromUserId,
    target_user_id: targetUserId,
    skill_id: 'freezer',
    round_number: roundNumber,
    amount: 0
  })

  await supabase.from('skill_signals').insert({
    signal_type: 'skill_executed',
    from_user_id: fromUserId,
    target_user_id: targetUserId,
    skill_id: 'freezer',
    amount: 0,
    round_number: roundNumber,
    processed: true
  })

  await supabase.from('skill_signals').insert({
    signal_type: 'skill_success',
    from_user_id: fromUserId,
    target_user_id: fromUserId,
    skill_id: 'freezer',
    amount: 0,
    round_number: roundNumber,
    processed: true
  })

  await markSignalProcessed(signal.id)
  console.log(`Skill: freezer - ${fromUser.name} froze ${targetUser.name} until round ${freezeUntilRound}`)
}

async function handleDoubleWin(signal: SkillSignal, fromUserId: string, roundNumber: number) {
  const { data: fromUser } = await supabase.from('users').select('*').eq('id', fromUserId).single()
  if (!fromUser) return

  // Check if already has active double win for this round
  const { data: existing } = await supabase
    .from('active_double_win')
    .select('*')
    .eq('user_id', fromUserId)
    .eq('next_round', roundNumber)
    .eq('used', false)
    .maybeSingle()

  if (existing) {
    await markSignalProcessed(signal.id)
    return
  }

  await supabase.from('active_double_win').delete().eq('user_id', fromUserId)
  await supabase.from('active_double_win').insert({
    user_id: fromUserId,
    activated_round: roundNumber,
    next_round: roundNumber,
    used: false
  })

  await decrementSkillQuantity(fromUserId, 'double_win')

  await supabase.from('skill_usage_log').insert({
    user_id: fromUserId,
    target_user_id: null,
    skill_id: 'double_win',
    round_number: roundNumber,
    amount: 0
  })

  await supabase.from('skill_signals').insert({
    signal_type: 'skill_success',
    from_user_id: fromUserId,
    target_user_id: fromUserId,
    skill_id: 'double_win',
    amount: 0,
    round_number: roundNumber,
    processed: true
  })

  await markSignalProcessed(signal.id)
  console.log(`Skill: double_win activated by ${fromUser.name} for round ${roundNumber}`)
}

async function handleBankLoan(signal: SkillSignal, fromUserId: string, roundNumber: number) {
  const { data: fromUser } = await supabase.from('users').select('*').eq('id', fromUserId).single()
  if (!fromUser) return

  const loanAmount = 500
  await supabase.from('users').update({ balance: fromUser.balance + loanAmount }).eq('id', fromUserId)

  await decrementSkillQuantity(fromUserId, 'bank_loan')

  await supabase.from('skill_usage_log').insert({
    user_id: fromUserId,
    target_user_id: null,
    skill_id: 'bank_loan',
    round_number: roundNumber,
    amount: loanAmount
  })

  await supabase.from('skill_signals').insert({
    signal_type: 'skill_success',
    from_user_id: fromUserId,
    target_user_id: fromUserId,
    skill_id: 'bank_loan',
    amount: loanAmount,
    round_number: roundNumber,
    processed: true
  })

  await markSignalProcessed(signal.id)
  console.log(`Skill: bank_loan ${loanAmount} to ${fromUser.name}`)
}
