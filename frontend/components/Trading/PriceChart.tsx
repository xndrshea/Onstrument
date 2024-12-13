import { createChart, ColorType, IChartApi, ISeriesApi, LineData, UTCTimestamp } from 'lightweight-charts';
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
                    const formattedData = history.map(point => ({
                        time: point.time as UTCTimestamp,
                        value: point.value
                    }));
                    series.current.setData(formattedData);
                }
            } catch (error) {
                console.error('Error fetching price history:', error);
            }
        };

        fetchAndUpdatePrices();

        const updatePrice = (price: number) => {
            if (series.current) {
                series.current.update({
                    time: (Date.now() / 1000) as UTCTimestamp,
                    value: price
                });
            }
        };

        const unsubscribe = priceClient.subscribeToPrice(token.mintAddress, updatePrice);

        return unsubscribe;
    }, [token.mintAddress]);

    return <div ref={chartContainerRef} />;
}
