import { createChart, ColorType, IChartApi, ISeriesApi, LineData, UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { PriceService } from '../../services/priceService';
import { connection } from '../../config';

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
                const priceService = PriceService.getInstance(connection);
                console.log('Fetching price history for token:', token.mintAddress);
                const history = await priceService.getPriceHistory(token);
                console.log('Raw price history:', history);

                if (!history || !Array.isArray(history)) {
                    console.warn('Invalid history data received:', history);
                    return;
                }

                // Filter out any invalid data points with detailed logging
                const data: LineData[] = history
                    .filter(point => {
                        const isValid = point &&
                            typeof point.timestamp === 'number' &&
                            typeof point.price === 'number' &&
                            !isNaN(point.price) &&
                            isFinite(point.price);

                        if (!isValid) {
                            console.warn('Invalid price point:', point);
                        }
                        return isValid;
                    })
                    .map(point => ({
                        time: point.timestamp as UTCTimestamp,
                        value: Number(point.price)
                    }));

                console.log('Processed chart data:', data);

                if (data.length > 0) {
                    series.current?.setData(data);
                } else {
                    console.warn('No valid price history data available');
                    // Optionally show user-friendly message
                    if (series.current) {
                        series.current.setData([]); // Clear the chart
                    }
                }
            } catch (error) {
                console.error('Error fetching price history:', error);
                if (series.current) {
                    series.current.setData([]); // Clear the chart on error
                }
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
