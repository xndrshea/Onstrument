import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { priceClient } from '../../services/priceClient';

interface PriceChartProps {
    token: TokenRecord;
    width?: number;
    height?: number;
    currentPrice?: number;
}

interface PricePoint {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export function PriceChart({ token, width = 600, height = 300, currentPrice }: PriceChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [mostLiquidPool, setMostLiquidPool] = useState<string | null>(null);

    useEffect(() => {
        if (!token?.mintAddress) return;

        const fetchMostLiquidPool = async () => {
            if (token.tokenType === 'dex') {
                try {
                    const response = await fetch(
                        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${token.mintAddress}/pools?sort=h24_volume_usd_liquidity_desc`
                    );
                    const data = await response.json();
                    if (data.data?.[0]?.attributes?.address) {
                        setMostLiquidPool(data.data[0].attributes.address);
                    }
                } catch (error) {
                    console.error('Error fetching most liquid pool:', error);
                }
            }
        };

        fetchMostLiquidPool();
    }, [token?.mintAddress, token?.tokenType]);

    if (token.tokenType === 'dex' && mostLiquidPool) {
        return (
            <div style={{ width, height, position: 'relative' }}>
                <iframe
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: 'none',
                    }}
                    title="GeckoTerminal Embed"
                    src={`https://www.geckoterminal.com/solana/pools/${mostLiquidPool}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0`}
                    allow="clipboard-write"
                    allowFullScreen
                />
            </div>
        );
    }

    // For custom tokens, use existing chart implementation
    return (
        <div ref={chartContainerRef} style={{ width, height }}>
            {/* Existing lightweight-charts implementation remains here */}
            <CustomTokenChart
                token={token}
                width={width}
                height={height}
                currentPrice={currentPrice}
            />
        </div>
    );
}

// Separate component for custom token chart
function CustomTokenChart({ token, width, height, currentPrice }: PriceChartProps) {
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        chartRef.current = createChart(containerRef.current, {
            width,
            height,
            layout: {
                background: { color: '#232427' },
                textColor: 'rgba(255, 255, 255, 0.9)',
            },
            grid: {
                vertLines: { color: '#2c2c2c' },
                horzLines: { color: '#2c2c2c' },
            },
        });

        seriesRef.current = chartRef.current.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350'
        });

        return () => {
            if (chartRef.current) {
                chartRef.current.remove();
            }
        };
    }, [width, height]);

    // Update price data
    useEffect(() => {
        const fetchPriceHistory = async () => {
            if (!token.mintAddress || token.tokenType === 'dex') return;

            try {
                const history = await priceClient.getPriceHistory(token.mintAddress);
                if (history?.length && seriesRef.current) {
                    seriesRef.current.setData(history as CandlestickData<Time>[]);
                }
            } catch (error) {
                console.warn('Error fetching price history:', error);
            }
        };

        fetchPriceHistory();
    }, [token.mintAddress, token.tokenType]);

    return <div ref={containerRef} />;
}
