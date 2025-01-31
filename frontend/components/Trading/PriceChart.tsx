declare global {
    interface Window {
        TradingView: any;
    }
}

import { useEffect, useRef, useState, useMemo } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { TradingViewChart } from './TradingViewChart';

interface PriceChartProps {
    token: TokenRecord;
    width?: number;
    height?: number;
    currentPrice?: number;
    onPriceUpdate?: (price: number) => void;
}

export function PriceChart({ token, width = 600, height = 300, currentPrice, onPriceUpdate }: PriceChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [mostLiquidPool, setMostLiquidPool] = useState<string | null>(null);

    const shouldUseGecko = useMemo(() => {
        return token.tokenType === 'dex' ||
            (token.tokenType === 'custom' && token.curveConfig?.migrationStatus === 'migrated');
    }, [token.tokenType, token.curveConfig?.migrationStatus]);

    if (!shouldUseGecko) {
        return (
            <div ref={chartContainerRef} style={{ width, height }}>
                <TradingViewChart
                    token={token}
                    width={width}
                    height={height}
                    currentPrice={currentPrice}
                    onPriceUpdate={onPriceUpdate}
                    chartStyle={{
                        layout: {
                            backgroundColor: '#FFFFFF',
                            textColor: '#333333',
                        },
                        grid: {
                            vertLines: { color: '#E6E6E6' },
                            horzLines: { color: '#E6E6E6' },
                        },
                        timeScale: {
                            borderColor: '#E6E6E6',
                            timeVisible: true,
                            secondsVisible: false,
                        },
                        priceScale: {
                            borderColor: '#E6E6E6',
                        },
                    }}
                />
            </div>
        );
    }

    useEffect(() => {
        if (!shouldUseGecko || !token?.mintAddress) return;

        const fetchMostLiquidPool = async () => {
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
        };

        fetchMostLiquidPool();
    }, [token?.mintAddress, shouldUseGecko]);

    if (shouldUseGecko) {
        if (!mostLiquidPool) {
            return <div style={{ width, height }}>Loading...</div>;
        }
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
                    src={`https://www.geckoterminal.com/solana/pools/${mostLiquidPool}?embed=1&info=0&swaps=0&grayscale=0&light_chart=1`}
                    allow="clipboard-write"
                    allowFullScreen
                />
            </div>
        );
    }

    return null;
}
