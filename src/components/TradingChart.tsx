import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

interface TradingChartProps {
  prices: Array<{
    time: number;
    value: number;
  }>;
}

interface Candle {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function TradingChart({ prices }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<any>(null);

  // Convert prices to candlesticks (group by time intervals)
  // We'll use this helper to process the incoming raw price stream
  const createCandles = (priceData: typeof prices): Candle[] => {
    if (priceData.length === 0) return [];
    
    const candles: Candle[] = [];
    const intervalSeconds = 2; // 2-second candles
    
    let currentCandle: Candle | null = null;
    
    // Sort by time just in case
    const sortedData = [...priceData].sort((a, b) => a.time - b.time);

    sortedData.forEach((price) => {
      // time is in seconds
      const candleTime = (Math.floor(price.time / intervalSeconds) * intervalSeconds) as Time;
      
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
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f13' }, // Matches --chart-bg
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#1e293b',
      },
      rightPriceScale: {
        borderColor: '#1e293b',
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', // --green
      downColor: '#ef4444', // --red
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && prices.length > 0) {
      const candles = createCandles(prices);
      if (candles.length > 0) {
        seriesRef.current.setData(candles);
        
        // Ensure the last candle is visible
        // You might want to adjust fitContent behavior
        // chartRef.current?.timeScale().fitContent(); 
      }
    }
  }, [prices]);

  return (
    <div ref={chartContainerRef} className="w-full h-full min-h-[400px]" />
  );
}
