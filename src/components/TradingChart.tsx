
import { useEffect, useRef } from 'react';

interface TradingChartProps {
  prices: Array<{
    time: number;
    value: number;
  }>;
}

export default function TradingChart({ prices }: TradingChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    // Get price range
    const values = prices.map(p => p.value);
    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const priceRange = maxPrice - minPrice || 1;

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

    // Determine line color based on trend (last vs first price)
    const isUpTrend = prices.length > 1 && prices[prices.length - 1].value > prices[0].value;
    const lineColor = isUpTrend ? '#26a69a' : '#ef5350'; // Green if up, red if down

    // Draw price line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();

    prices.forEach((point, index) => {
      const x = (canvas.width / (prices.length - 1)) * index;
      const y = canvas.height - ((point.value - minPrice) / priceRange) * canvas.height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw area under line with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    if (isUpTrend) {
      gradient.addColorStop(0, 'rgba(38, 166, 154, 0.3)');
      gradient.addColorStop(1, 'rgba(38, 166, 154, 0.0)');
    } else {
      gradient.addColorStop(0, 'rgba(239, 83, 80, 0.3)');
      gradient.addColorStop(1, 'rgba(239, 83, 80, 0.0)');
    }
    
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw price labels
    ctx.fillStyle = '#d1d4dc';
    ctx.font = '12px sans-serif';
    ctx.fillText(`$${maxPrice.toFixed(2)}`, 10, 15);
    ctx.fillText(`$${minPrice.toFixed(2)}`, 10, canvas.height - 5);

    // Draw current price line (last point)
    if (prices.length > 0) {
      const lastPoint = prices[prices.length - 1];
      const lastY = canvas.height - ((lastPoint.value - minPrice) / priceRange) * canvas.height;
      
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(canvas.width, lastY);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw current price label
      ctx.fillStyle = lineColor;
      ctx.fillText(`$${lastPoint.value.toFixed(2)}`, canvas.width - 80, lastY - 5);
    }

  }, [prices]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-[400px]"
      style={{ display: 'block' }}
    />
  );
}
