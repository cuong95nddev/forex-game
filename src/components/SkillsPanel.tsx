import { useState, useEffect } from 'react'
import { Sparkles, Target, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useStore } from '../store/useStore'
import { toast } from 'sonner'

interface Skill {
  id: string
  name: string
  description: string
  skill_type: string
  cooldown_rounds: number
  parameters: {
    min_steal_percentage?: number
    max_steal_percentage?: number
  }
}

interface UserSkill {
  id: string
  skill_id: string
  last_used_round: number
  is_active: boolean
  skill?: Skill
}

export default function SkillsPanel() {
  const { user, allUsers, currentRound, useSkill, loadUserSkills, userSkills, activeSkillEffects, loadActiveSkillEffects } = useStore()
  const [selectedSkill, setSelectedSkill] = useState<UserSkill | null>(null)
  const [showTargetDialog, setShowTargetDialog] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      loadUserSkills()
      loadActiveSkillEffects()
    }
  }, [user, loadUserSkills, loadActiveSkillEffects])

  const handleSkillClick = (skill: UserSkill) => {
    if (!skill.is_active) {
      toast.error('This skill is not active')
      return
    }

    const cooldownRemaining = getCooldownRemaining(skill)
    if (cooldownRemaining > 0) {
      toast.error(`Skill is on cooldown. ${cooldownRemaining} round${cooldownRemaining > 1 ? 's' : ''} remaining.`)
      return
    }

    // For steal money skill, show target selection
    if (skill.skill?.skill_type === 'steal') {
      setSelectedSkill(skill)
      setShowTargetDialog(true)
    } 
    // For double skill, use directly
    else if (skill.skill?.skill_type === 'double') {
      handleUseDoubleSkill(skill)
    }
  }

  const handleUseDoubleSkill = async (skill: UserSkill) => {
    if (!currentRound) {
      toast.error('No active round')
      return
    }

    // Check if already active
    if (activeSkillEffects.some(e => e.skill_type === 'double')) {
      toast.error('Double profit is already active!')
      return
    }

    await useSkill(skill.skill_id, '', currentRound.round_number)
  }

  const handleUseSkill = async () => {
    if (!selectedSkill || !selectedTarget) {
      toast.error('Please select a target')
      return
    }

    if (!currentRound) {
      toast.error('No active round')
      return
    }

    const success = await useSkill(selectedSkill.skill_id, selectedTarget, currentRound.round_number)
    
    if (success) {
      setShowTargetDialog(false)
      setSelectedSkill(null)
      setSelectedTarget(null)
      loadUserSkills() // Refresh skills to update cooldown
      loadActiveSkillEffects() // Refresh active effects
    }
  }

  const getCooldownRemaining = (skill: UserSkill): number => {
    if (!currentRound || !skill.skill) return 0
    const roundsSinceUse = currentRound.round_number - skill.last_used_round
    const remaining = skill.skill.cooldown_rounds - roundsSinceUse
    return Math.max(0, remaining)
  }

  const getTargetableUsers = () => {
    return allUsers.filter(u => u.id !== user?.id && u.balance >= 100)
  }

  const getStealAmountRange = (targetBalance: number): string => {
    if (!selectedSkill?.skill?.parameters) return '$0'
    
    const minPct = selectedSkill.skill.parameters.min_steal_percentage || 0.05
    const maxPct = selectedSkill.skill.parameters.max_steal_percentage || 0.15
    
    const minAmount = Math.max(50, Math.round(targetBalance * minPct))
    const maxAmount = Math.round(targetBalance * maxPct)
    
    return `$${minAmount.toLocaleString()} - $${maxAmount.toLocaleString()}`
  }

  if (!user) return null

  return (
    <>
      <div className="bg-[#0f172a] border-t border-[#1e293b] p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#a855f7]" />
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">Skills</h3>
          </div>
          <Badge variant="outline" className="text-xs border-[#334155] text-[#94a3b8]">
            {userSkills.length} Available
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {userSkills.map((userSkill) => {
            const cooldownRemaining = getCooldownRemaining(userSkill)
            const isOnCooldown = cooldownRemaining > 0
            const isDoubleActive = userSkill.skill?.skill_type === 'double' && activeSkillEffects.some(e => e.skill_type === 'double')
            
            return (
              <Card
                key={userSkill.id}
                className={`relative overflow-hidden border transition-all cursor-pointer ${
                  isOnCooldown
                    ? 'bg-[#1e293b]/50 border-[#334155] opacity-60 cursor-not-allowed'
                    : isDoubleActive
                    ? 'bg-gradient-to-br from-[#1e293b] to-[#2d691b] border-[#10b981] animate-pulse'
                    : 'bg-gradient-to-br from-[#1e293b] to-[#2d1b69] border-[#a855f7]/30 hover:border-[#a855f7] hover:shadow-lg hover:shadow-[#a855f7]/20'
                }`}
                onClick={() => !isOnCooldown && !isDoubleActive && handleSkillClick(userSkill)}
              >
                <div className="p-4">
                  {/* Skill Icon */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      isDoubleActive 
                        ? 'bg-gradient-to-br from-[#10b981] to-[#059669]'
                        : 'bg-gradient-to-br from-[#a855f7] to-[#7c3aed]'
                    }`}>
                      {userSkill.skill?.skill_type === 'double' ? (
                        <Sparkles className="h-5 w-5 text-white" />
                      ) : (
                        <Target className="h-5 w-5 text-white" />
                      )}
                    </div>
                    {isOnCooldown && (
                      <Badge className="bg-[#334155] text-[#94a3b8] text-xs border-0">
                        <Clock className="h-3 w-3 mr-1" />
                        {cooldownRemaining}R
                      </Badge>
                    )}
                    {isDoubleActive && (
                      <Badge className="bg-[#10b981] text-white text-xs border-0 animate-pulse">
                        ACTIVE
                      </Badge>
                    )}
                  </div>

                  {/* Skill Info */}
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">
                      {userSkill.skill?.name || 'Unknown Skill'}
                    </h4>
                    <p className="text-xs text-[#94a3b8] line-clamp-2 mb-2">
                      {userSkill.skill?.description || 'No description'}
                    </p>
                    
                    {userSkill.skill && (
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="border-[#a855f7]/50 text-[#a855f7] text-[10px]">
                          Cooldown: {userSkill.skill.cooldown_rounds}R
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cooldown Overlay */}
                {isOnCooldown && (
                  <div className="absolute inset-0 bg-[#0f172a]/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <Clock className="h-6 w-6 text-[#94a3b8] mx-auto mb-1" />
                      <p className="text-xs text-[#94a3b8] font-bold">
                        {cooldownRemaining} Round{cooldownRemaining > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>

        {userSkills.length === 0 && (
          <div className="text-center py-8 text-[#64748b]">
            <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No skills available</p>
          </div>
        )}
      </div>

      {/* Target Selection Dialog */}
      <Dialog open={showTargetDialog} onOpenChange={setShowTargetDialog}>
        <DialogContent className="bg-[#0f172a] border-[#334155] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-[#a855f7]" />
              Select Target
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Choose a player to use "{selectedSkill?.skill?.name}" on
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[400px] pr-4">
            <div className="space-y-2">
              {getTargetableUsers().map((targetUser) => {
                const isSelected = selectedTarget === targetUser.id
                const stealRange = getStealAmountRange(targetUser.balance)
                
                return (
                  <button
                    key={targetUser.id}
                    onClick={() => setSelectedTarget(targetUser.id)}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'bg-[#a855f7]/20 border-[#a855f7]'
                        : 'bg-[#1e293b] border-[#334155] hover:border-[#a855f7]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border border-[#334155]">
                          <AvatarFallback className="bg-[#1e293b] text-[#94a3b8] text-xs">
                            {targetUser.name.substring(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-white">{targetUser.name}</p>
                          <p className="text-xs text-[#94a3b8]">
                            Balance: ${targetUser.balance.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#64748b]">Steal</p>
                        <p className="text-sm font-bold text-[#a855f7]">{stealRange}</p>
                      </div>
                    </div>
                  </button>
                )
              })}

              {getTargetableUsers().length === 0 && (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-[#64748b] mx-auto mb-2" />
                  <p className="text-sm text-[#94a3b8]">No valid targets available</p>
                  <p className="text-xs text-[#64748b] mt-1">
                    Players need at least $100 to be targetable
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowTargetDialog(false)
                setSelectedSkill(null)
                setSelectedTarget(null)
              }}
              className="flex-1 border-[#334155] text-[#94a3b8] hover:bg-[#1e293b]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUseSkill}
              disabled={!selectedTarget}
              className="flex-1 bg-[#a855f7] hover:bg-[#9333ea] text-white disabled:opacity-50"
            >
              Use Skill
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
