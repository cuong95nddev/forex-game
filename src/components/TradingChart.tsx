
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

    // Draw price line
    ctx.strokeStyle = '#26a69a';
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

    // Draw area under line
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(38, 166, 154, 0.2)';
    ctx.fill();

    // Draw price labels
    ctx.fillStyle = '#d1d4dc';
    ctx.font = '12px sans-serif';
    ctx.fillText(`$${maxPrice.toFixed(2)}`, 10, 15);
    ctx.fillText(`$${minPrice.toFixed(2)}`, 10, canvas.height - 5);

  }, [prices]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-[400px]"
      style={{ display: 'block' }}
    />
  );
}
