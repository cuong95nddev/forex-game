const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY || ''

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_API_KEY,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API error ${res.status}`)
  }
  return res.json()
}

// Game lifecycle
export function getGameStatus() {
  return apiFetch('/api/game/status')
}

export function startGame(config: {
  roundDuration: number
  priceUpdateInterval: number
  winRate: number
  defaultUserBalance: number
  minBetAmount: number
  maxBetAmount: number
  noBetPenalty: number
  maxRound: number | null
}) {
  return apiFetch('/api/game/start', { method: 'POST', body: JSON.stringify(config) })
}

export function stopGame() {
  return apiFetch('/api/game/stop', { method: 'POST' })
}

export function resumeGame() {
  return apiFetch('/api/game/resume', { method: 'POST' })
}

export function deleteGame() {
  return apiFetch('/api/game/delete', { method: 'POST' })
}

export function prepareNewGame() {
  return apiFetch('/api/game/prepare-new', { method: 'POST' })
}

export function endGame() {
  return apiFetch('/api/game/end', { method: 'POST' })
}

// Settings
export function getSettings() {
  return apiFetch('/api/settings')
}

export function updateSettings(settings: {
  round_duration: number
  price_update_interval: number
  win_rate: number
  default_user_balance: number
  min_bet_amount: number
  max_bet_amount: number
  no_bet_penalty: number
  max_round: number | null
  game_status: string
}) {
  return apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) })
}

// Users
export function getUsers() {
  return apiFetch('/api/users')
}

export function updateUserBalance(userId: string, balance: number) {
  return apiFetch(`/api/users/${userId}/balance`, {
    method: 'PUT',
    body: JSON.stringify({ balance }),
  })
}

export function deleteUser(userId: string) {
  return apiFetch(`/api/users/${userId}`, { method: 'DELETE' })
}

// Data
export function resetAllData() {
  return apiFetch('/api/data/reset', { method: 'POST' })
}

export function cleanPriceHistory() {
  return apiFetch('/api/data/clean-prices', { method: 'POST' })
}

export function cleanOldRounds() {
  return apiFetch('/api/data/clean-rounds', { method: 'POST' })
}
