import { createChart, ColorType, BaselineSeries } from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

interface TradingChartProps {
  prices: Array<{
    time: number;
    value: number;
  }>;
}

interface LineData {
  time: Time;
  value: number;
}

export default function TradingChart({ prices }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<any>(null);
  const baselineValueRef = useRef<number | null>(null);

  // Convert prices to line data format
  const createLineData = (priceData: typeof prices): LineData[] => {
    if (priceData.length === 0) return [];
    
    // Sort by time and convert to line data format
    const sortedData = [...priceData].sort((a, b) => a.time - b.time);
    
    // Deduplicate by time - keep the last value for each timestamp
    // lightweight-charts requires strictly ascending unique timestamps
    const uniqueData = new Map<number, number>();
    sortedData.forEach((price) => {
      uniqueData.set(price.time, price.value);
    });
    
    return Array.from(uniqueData.entries()).map(([time, value]) => ({
      time: time as Time,
      value
    }));
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

    const baselineSeries = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 0 }, // Will be updated with first price
      topLineColor: '#10b981', // Green for up
      topFillColor1: 'rgba(16, 185, 129, 0.28)',
      topFillColor2: 'rgba(16, 185, 129, 0.05)',
      bottomLineColor: '#ef4444', // Red for down
      bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
      bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lastValueVisible: true,
      priceLineVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = baselineSeries;

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
      const lineData = createLineData(prices);
      if (lineData.length > 0) {
        // Set baseline to the first price value (starting point)
        if (baselineValueRef.current === null) {
          baselineValueRef.current = lineData[0].value;
          seriesRef.current.applyOptions({
            baseValue: { type: 'price', price: baselineValueRef.current },
          });
        }
        seriesRef.current.setData(lineData);
      }
    }
  }, [prices]);

  return (
    <div ref={chartContainerRef} className="w-full h-full min-h-[400px]" />
  );
}
