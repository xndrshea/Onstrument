import { createChart, ColorType, IChartApi, ISeriesApi, LineData } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { TokenRecord } from '../../../shared/types/token';

interface PriceChartProps {
    token: TokenRecord;
    width?: number;
    height?: number;
}

export function PriceChart({ token, width = 600, height = 300 }: PriceChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chart = useRef<IChartApi | null>(null);
    const series = useRef<ISeriesApi<"Line"> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Initialize chart
        chart.current = createChart(chartContainerRef.current, {
            layout: {
                background: { color: '#232427' },
                textColor: 'rgba(255, 255, 255, 0.9)',
            },
            width: width,
            height: height,
            grid: {
                vertLines: { color: '#334158' },
                horzLines: { color: '#334158' },
            },
            crosshair: {
                mode: 0,
            },
            rightPriceScale: {
                borderColor: '#485c7b',
            },
            timeScale: {
                borderColor: '#485c7b',
                timeVisible: true,
                secondsVisible: true,
                tickMarkFormatter: (time: number) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleTimeString();
                }
            },
        });

        // Create line series
        series.current = chart.current.addLineSeries({
            color: '#4CAF50',
            lineWidth: 2,
            priceFormat: {
                type: 'price',
                precision: 6,
                minMove: 0.000001,
            },
        });

        return () => {
            if (chart.current) {
                chart.current.remove();
            }
        };
    }, []);

    useEffect(() => {
        if (!series.current) return;

        const fetchPriceHistory = async () => {
            try {
                const response = await fetch(`/api/price-history/${token.mintAddress}`);
                if (!response.ok) throw new Error('Failed to fetch price history');

                const history = await response.json();
                const data: LineData[] = history.map((point: any) => ({
                    // Convert seconds to milliseconds for the chart
                    time: point.timestamp * 1000,
                    value: Number(point.price)
                }));

                // Configure series for real-time data
                series.current?.applyOptions({
                    priceFormat: {
                        type: 'price',
                        precision: 9,
                        minMove: 0.000000001,
                    },
                    lastValueVisible: true,
                    priceLineVisible: true,
                });

                series.current?.setData(data);
            } catch (error) {
                console.error('Error fetching price history:', error);
            }
        };

        fetchPriceHistory();
    }, [token.mintAddress]);

    // Handle window resize
    useEffect(() => {
        const handleResize = () => {
            if (chart.current) {
                chart.current.applyOptions({
                    width: chartContainerRef.current?.clientWidth || width
                });
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [width]);

    return (
        <div className="price-chart-container" ref={chartContainerRef} />
    );
}
