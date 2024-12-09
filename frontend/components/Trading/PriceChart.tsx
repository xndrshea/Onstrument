import { createChart, ColorType, IChartApi, ISeriesApi, LineData, UTCTimestamp, Time } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { priceClient } from '../../services/priceClient';

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

        chart.current = createChart(chartContainerRef.current, {
            layout: {
                background: { color: '#232427' },
                textColor: 'rgba(255, 255, 255, 0.9)',
            },
            width,
            height,
            timeScale: {
                timeVisible: true,
                secondsVisible: false
            },
        });

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
        const fetchAndUpdatePrices = async () => {
            try {
                const history = await priceClient.getPriceHistory(token.mintAddress);
                if (series.current && history?.length > 0) {
                    series.current.setData(history.map(point => ({
                        time: point.time as Time,
                        value: point.value
                    })));
                }
            } catch (error) {
                console.error('Error fetching price history:', error);
            }
        };

        fetchAndUpdatePrices();

        // Subscribe to real-time updates
        const unsubscribe = priceClient.subscribeToPrice(token.mintAddress, (price) => {
            if (series.current) {
                series.current.update({
                    time: (Date.now() / 1000) as UTCTimestamp,
                    value: price
                });
            }
        });

        return unsubscribe;
    }, [token.mintAddress]);

    return <div ref={chartContainerRef} />;
}
