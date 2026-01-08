
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

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
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

    // Draw grid lines
    ctx.strokeStyle = '#2a2e39';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = (canvas.height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw vertical grid lines
    const numVerticalLines = 6;
    for (let i = 0; i <= numVerticalLines; i++) {
      const x = (canvas.width / numVerticalLines) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Calculate candle width
    const candleWidth = Math.max(3, (canvas.width / candles.length) * 0.6);
    const candleSpacing = canvas.width / candles.length;

    // Draw candlesticks
    candles.forEach((candle, index) => {
      const x = (index + 0.5) * candleSpacing;
      
      const openY = canvas.height - ((candle.open - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const closeY = canvas.height - ((candle.close - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const highY = canvas.height - ((candle.high - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const lowY = canvas.height - ((candle.low - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;

      const isGreen = candle.close >= candle.open;
      const color = isGreen ? '#26a69a' : '#ef5350';

      // Draw wick (high-low line)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Draw body (open-close rectangle)
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.abs(closeY - openY) || 1;
      
      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      
      // Draw border for hollow effect on green candles
      if (isGreen) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }
    });

    // Draw price labels on the right
    ctx.fillStyle = '#d1d4dc';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    
    for (let i = 0; i <= 5; i++) {
      const price = maxPrice + padding - (i / 5) * (priceRange + 2 * padding);
      const y = (canvas.height / 5) * i;
      ctx.fillText(`$${price.toFixed(2)}`, 5, y + 12);
    }

    // Draw current price indicator
    if (candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const lastY = canvas.height - ((lastCandle.close - minPrice + padding) / (priceRange + 2 * padding)) * canvas.height;
      const lineColor = lastCandle.close >= lastCandle.open ? '#26a69a' : '#ef5350';
      
      // Draw dashed line for current price
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(canvas.width, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw current price label with background
      const priceText = `$${lastCandle.close.toFixed(2)}`;
      const textWidth = ctx.measureText(priceText).width;
      const padding2 = 6;
      const labelX = canvas.width - textWidth - padding2 * 2 - 10;
      const labelY = lastY - 8;
      
      // Draw label background
      ctx.fillStyle = lineColor;
      ctx.fillRect(labelX - padding2, labelY - 12, textWidth + padding2 * 2, 20);
      
      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(priceText, labelX, labelY);
      
      // Draw pulse animation on price change
      if (priceDirection !== 'neutral') {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = priceDirection === 'up' ? '#26a69a' : '#ef5350';
        ctx.beginPath();
        ctx.arc(canvas.width - 20, lastY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

  }, [prices, priceDirection]);

  return (
    <div className="relative">
      <canvas 
        ref={canvasRef} 
        className="w-full h-[400px]"
        style={{ display: 'block' }}
      />
      {priceDirection !== 'neutral' && (
        <div 
          className={`absolute top-4 right-4 px-3 py-1 rounded-full text-white font-bold text-sm animate-pulse ${
            priceDirection === 'up' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {priceDirection === 'up' ? '↑ Tăng' : '↓ Giảm'}
        </div>
      )}
    </div>
  );
}
