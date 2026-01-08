
import { useEffect, useRef, useState } from 'react';

interface TradingChartProps {
  prices: Array<{
    time: number;
    value: number;
  }>;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function TradingChart({ prices }: TradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'neutral'>('neutral');

  // Convert prices to candlesticks (group by time intervals)
  const createCandles = (priceData: typeof prices): Candle[] => {
    if (priceData.length === 0) return [];
    
    const candles: Candle[] = [];
    const intervalSeconds = 2; // 2-second candles
    
    let currentCandle: Candle | null = null;
    
    priceData.forEach((price) => {
      const candleTime = Math.floor(price.time / intervalSeconds) * intervalSeconds;
      
      if (!currentCandle || currentCandle.time !== candleTime) {
        if (currentCandle) {
          candles.push(currentCandle);
        }
        currentCandle = {
          time: candleTime,
          open: price.value,
          high: price.value,
          low: price.value,
          close: price.value
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, price.value);
        currentCandle.low = Math.min(currentCandle.low, price.value);
        currentCandle.close = price.value;
      }
    });
    
    if (currentCandle) {
      candles.push(currentCandle);
    }
    
    return candles;
  };

  useEffect(() => {
    if (prices.length > 0) {
      const currentPrice = prices[prices.length - 1].value;
      if (lastPrice !== null) {
        if (currentPrice > lastPrice) {
          setPriceDirection('up');
        } else if (currentPrice < lastPrice) {
          setPriceDirection('down');
        }
      }
      setLastPrice(currentPrice);
      
      const timer = setTimeout(() => setPriceDirection('neutral'), 500);
      return () => clearTimeout(timer);
    }
  }, [prices, lastPrice]);

  useEffect(() => {
    if (!canvasRef.current || prices.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Clear canvas with professional dark background
    ctx.fillStyle = '#0b0f13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create candlesticks from price data
    const candles = createCandles(prices);
    if (candles.length === 0) return;

    // Get price range
    const allPrices = candles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice || 1;
    const padding = priceRange * 0.1; // 10% padding

    // Draw horizontal grid lines with better visibility
    ctx.strokeStyle = '#1e2632';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = (canvas.height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw vertical grid lines
    const numVerticalLines = 8;
    for (let i = 0; i <= numVerticalLines; i++) {
      const x = (canvas.width / numVerticalLines) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Calculate candle width
    const candleWidth = Math.max(4, (canvas.width / candles.length) * 0.7);
    const candleSpacing = canvas.width / candles.length;

    // Draw candlesticks with vibrant colors
    candles.forEach((candle, index) => {
      const x = (index + 0.5) * candleSpacing;
      
      const openY = canvas.height - ((candle.open - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const closeY = canvas.height - ((candle.close - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const highY = canvas.height - ((candle.high - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const lowY = canvas.height - ((candle.low - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;

      const isGreen = candle.close >= candle.open;
      const color = isGreen ? '#10b981' : '#ef4444'; // Vibrant green and red

      // Draw wick (high-low line) with better visibility
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Draw body (open-close rectangle) with solid fill
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 2;
      
      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      
      // Add subtle border for better definition
      ctx.strokeStyle = isGreen ? '#059669' : '#dc2626';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // Draw price labels on the right with better visibility
    ctx.font = 'bold 13px "Inter", sans-serif';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= 5; i++) {
      const price = maxPrice + padding - (i / 5) * (priceRange + 2 * padding);
      const y = (canvas.height / 5) * i;
      
      // Draw label background with rounded corners effect
      ctx.fillStyle = 'rgba(26, 32, 44, 0.95)';
      ctx.fillRect(8, y - 10, 75, 22);
      
      // Draw label border
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 1;
      ctx.strokeRect(8, y - 10, 75, 22);
      
      // Draw label text with better color
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`$${price.toFixed(2)}`, 14, y + 5);
    }

    // Draw current price indicator with glow effect
    if (candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const lastY = canvas.height - ((lastCandle.close - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const lineColor = lastCandle.close >= lastCandle.open ? '#10b981' : '#ef4444';
      
      // Draw glowing dashed line for current price
      ctx.shadowBlur = 10;
      ctx.shadowColor = lineColor;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(canvas.width, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      
      // Draw current price label with bold styling
      const priceText = `$${lastCandle.close.toFixed(2)}`;
      ctx.font = 'bold 14px "Inter", sans-serif';
      const textWidth = ctx.measureText(priceText).width;
      const padding2 = 8;
      const labelX = canvas.width - textWidth - padding2 * 2 - 12;
      const labelY = lastY - 10;
      
      // Draw label background with gradient effect
      const gradient = ctx.createLinearGradient(labelX - padding2, 0, labelX + textWidth + padding2, 0);
      gradient.addColorStop(0, lineColor);
      gradient.addColorStop(1, lastCandle.close >= lastCandle.open ? '#059669' : '#dc2626');
      ctx.fillStyle = gradient;
      ctx.fillRect(labelX - padding2, labelY - 14, textWidth + padding2 * 2, 24);
      
      // Draw label border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX - padding2, labelY - 14, textWidth + padding2 * 2, 24);
      
      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(priceText, labelX, labelY + 1);
      
      // Draw pulse animation on price change with glow
      if (priceDirection !== 'neutral') {
        ctx.shadowBlur = 15;
        ctx.shadowColor = priceDirection === 'up' ? '#10b981' : '#ef4444';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = priceDirection === 'up' ? '#10b981' : '#ef4444';
        ctx.beginPath();
        ctx.arc(canvas.width - 25, lastY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    }

  }, [prices, priceDirection]);

  return (
    <div className="relative bg-gradient-to-br from-[#0b0f13] to-[#0f1419] rounded-xl overflow-hidden border-2 border-[#1e2632] shadow-2xl">
      <canvas 
        ref={canvasRef} 
        className="w-full h-[500px]"
        style={{ display: 'block' }}
      />
      {priceDirection !== 'neutral' && (
        <div 
          className={`absolute top-6 right-6 px-5 py-3 rounded-lg text-white font-extrabold text-base shadow-2xl border-2 flex items-center gap-2 ${
            priceDirection === 'up' 
              ? 'bg-gradient-to-br from-[#10b981] to-[#059669] border-[#10b981]/50 glow-green' 
              : 'bg-gradient-to-br from-[#ef4444] to-[#dc2626] border-[#ef4444]/50 glow-red'
          }`}
        >
          <span className="text-2xl">{priceDirection === 'up' ? '↑' : '↓'}</span>
          <span>{priceDirection === 'up' ? 'TĂNG' : 'GIẢM'}</span>
        </div>
      )}
    </div>
  );
}
