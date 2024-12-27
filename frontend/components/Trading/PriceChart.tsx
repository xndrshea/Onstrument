import { createChart, ColorType, IChartApi, ISeriesApi, LineData, UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { priceClient } from '../../services/priceClient';

interface PriceChartProps {
    token: TokenRecord;
    width?: number;
    height?: number;
    currentPrice?: number;
}

export function PriceChart({ token, width = 600, height = 300, currentPrice }: PriceChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chart = useRef<IChartApi | null>(null);
    const series = useRef<ISeriesApi<"Line"> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasInitialized, setHasInitialized] = useState(false);
    const latestTime = useRef<number>(0);
    const latestValue = useRef<number>(0);

    const fetchAndUpdatePrices = async () => {
        try {
            setIsLoading(true);
            const history = await priceClient.getPriceHistory(token.mintAddress);
            console.log("RAW HISTORY DATA:", history);

            if (!history?.length) {
                setError('No price history available');
                return;
            }

            if (series.current) {
                const formattedData = history
                    .filter(point =>
                        point &&
                        typeof point.time === 'number' &&
                        typeof point.value === 'number' &&
                        !isNaN(point.time) &&
                        !isNaN(point.value)
                    )
                    .map(point => ({
                        time: point.time as UTCTimestamp,
                        value: point.value
                    }));

                console.log("FORMATTED DATA:", formattedData);

                if (formattedData.length === 0) {
                    setError('Invalid price data received');
                    return;
                }

                series.current.setData(formattedData);
                console.log("DATA SET TO CHART");
            }
        } catch (error) {
            console.error('Price history error:', error);
            setError('Failed to load price history');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const initChart = async () => {
            if (!chartContainerRef.current || !token?.mintAddress) {
                console.log('[Chart Debug] Missing requirements:', {
                    container: !!chartContainerRef.current,
                    mintAddress: token?.mintAddress
                });
                return;
            }

            try {
                if (chart.current) {
                    chart.current.remove();
                }

                chart.current = createChart(chartContainerRef.current, {
                    layout: {
                        background: { color: '#232427' },
                        textColor: 'rgba(255, 255, 255, 0.9)',
                    },
                    width,
                    height,
                    timeScale: {
                        timeVisible: true,
                        secondsVisible: false,
                    },
                    grid: {
                        vertLines: { color: '#2c2c2c' },
                        horzLines: { color: '#2c2c2c' },
                    },
                });

                series.current = chart.current.addLineSeries({
                    color: '#26a69a',
                    lineWidth: 2,
                });

                await fetchAndUpdatePrices();
                setHasInitialized(true);
            } catch (err) {
                console.error('[Chart Debug] Error:', err);
                setError('Failed to initialize chart');
            }
        };

        initChart();
    }, [token?.mintAddress]);

    useEffect(() => {
        if (!series.current || !token.mintAddress) return;

        const unsubscribe = priceClient.subscribeToPrice(token.mintAddress, (price) => {
            if (!series.current) return;

            const now = Math.floor(Date.now() / 1000);

            if (now > latestTime.current) {
                latestTime.current = now;
                latestValue.current = price;

                series.current.update({
                    time: now as UTCTimestamp,
                    value: price
                });
            }
        });

        return () => unsubscribe();
    }, [token.mintAddress, series.current]);

    return (
        <div className="relative">
            <div
                ref={chartContainerRef}
                className="price-chart-container"
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                    minWidth: '300px',
                    minHeight: '200px',
                    background: '#232427',
                    borderRadius: '8px',
                    padding: '16px',
                    margin: '16px 0'
                }}
            />

            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-white/80">Loading price chart...</div>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-red-500 p-4 bg-red-100/10 rounded-lg">{error}</div>
                </div>
            )}
        </div>
    );
}
