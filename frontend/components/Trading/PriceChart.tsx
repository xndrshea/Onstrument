import { createChart, ColorType, IChartApi, ISeriesApi, LineData, UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
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
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!chartContainerRef.current || !token.mintAddress) return;

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
    }, [token.mintAddress]);

    useEffect(() => {
        const fetchAndUpdatePrices = async () => {
            if (!token.mintAddress) {
                setError('Invalid token: missing mintAddress');
                return;
            }

            try {
                setIsLoading(true);
                const history = await priceClient.getPriceHistory(token.mintAddress);
                if (series.current && history?.length > 0) {
                    const formattedData = history.map(point => ({
                        time: point.time as UTCTimestamp,
                        value: point.value
                    }));
                    series.current.setData(formattedData);
                } else {
                    setError('No price history available');
                }
            } catch (error) {
                console.error('Error fetching price history:', error);
                setError('Failed to load price history');
            } finally {
                setIsLoading(false);
            }
        };

        fetchAndUpdatePrices();
    }, [token.mintAddress]);

    if (error) {
        return <div className="text-red-500 p-4">{error}</div>;
    }

    if (isLoading) {
        return <div className="text-white p-4">Loading price history...</div>;
    }

    return <div ref={chartContainerRef} />;
}
