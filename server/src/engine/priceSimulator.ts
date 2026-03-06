let lastTrend = 0

export function resetTrend() {
  lastTrend = 0
}

export function nextPrice(currentPrice: number): { price: number; change: number } {
  let latestPrice = currentPrice

  // Safety check
  if (latestPrice < 1000 || latestPrice > 10000 || isNaN(latestPrice)) {
    latestPrice = 2000
  }

  // 1. Update trend (smooth random walk)
  const trendAdjustment = (Math.random() - 0.5) * 0.1
  lastTrend = (lastTrend * 0.95) + trendAdjustment

  // Clamp trend
  if (lastTrend > 1.5) lastTrend = 1.5
  if (lastTrend < -1.5) lastTrend = -1.5

  // 2. Volatility (Box-Muller normal distribution)
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2.0 * Math.log(u1 || 0.00001)) * Math.cos(2.0 * Math.PI * u2)
  const volatility = 2.0
  const noise = z * volatility

  // 3. Calculate change
  let change = lastTrend + noise

  // 4. Mean reversion to 2000
  if (latestPrice > 2500) change -= 0.5
  if (latestPrice < 1500) change += 0.5

  const newPrice = latestPrice + change

  return { price: newPrice, change }
}
