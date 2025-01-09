declare global {
    interface Window {
        TradingView: any;
    }
}

import { useEffect, useRef, useState, useMemo } from 'react';
import { priceClient } from '../../services/priceClient';
import { TokenRecord } from '../../../shared/types/token';

interface PriceChartProps {
    token: TokenRecord;
    width?: number;
    height?: number;
    currentPrice?: number;
    onPriceUpdate?: (price: number) => void;
}

interface PricePoint {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export function PriceChart({ token, width = 600, height = 300, currentPrice, onPriceUpdate }: PriceChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [mostLiquidPool, setMostLiquidPool] = useState<string | null>(null);

    const shouldUseGecko = useMemo(() => {
        return token.tokenType === 'dex' ||
            (token.tokenType === 'custom' && token.curveConfig?.migrationStatus === 'migrated');
    }, [token.tokenType, token.curveConfig?.migrationStatus]);

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
                    src={`https://www.geckoterminal.com/solana/pools/${mostLiquidPool}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0`}
                    allow="clipboard-write"
                    allowFullScreen
                />
            </div>
        );
    }

    return (
        <div ref={chartContainerRef} style={{ width, height }}>
            <TradingViewChart
                token={token}
                width={width}
                height={height}
                currentPrice={currentPrice}
                onPriceUpdate={onPriceUpdate}
            />
        </div>
    );
}

function TradingViewChart({ token, width, height, currentPrice, onPriceUpdate }: PriceChartProps) {
    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.async = true;
        document.body.appendChild(script);

        script.onload = () => {
            if (typeof window.TradingView !== 'undefined') {
                new window.TradingView.widget({
                    container_id: "tradingview_chart",
                    width,
                    height,
                    theme: "dark",
                    symbol: "CUSTOM",
                    library_path: "/charting_library/",
                    custom_css_url: "/charting_library/custom.css",
                    datafeed: {
                        onReady: (cb: any) => {
                            console.log('[DataFeed] onReady');
                            cb({});
                        },
                        resolveSymbol: (symbolName: string, cb: any) => {
                            console.log('[DataFeed] resolveSymbol:', symbolName);
                            cb({
                                name: "CUSTOM",
                                description: token.name || "",
                                type: "crypto",
                                session: "24x7",
                                timezone: "Etc/UTC",
                                minmov: 1,
                                pricescale: 1000000,
                                has_intraday: true,
                                has_no_volume: true,
                                data_status: 'streaming',
                                supported_resolutions: ["1"]
                            });
                        },
                        getBars: async (symbolInfo: any, resolution: string, from: number, to: number, cb: any) => {
                            console.log('[DataFeed] getBars');
                            const history = await priceClient.getPriceHistory(token.mintAddress);
                            const bars = history.map(candle => ({
                                time: Number(candle.time) * 1000,
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close
                            }));
                            cb(bars, { noData: false });
                        },
                        subscribeBars: (symbolInfo: any, resolution: string, onRealtimeCallback: any) => {
                            console.log('[DataFeed] subscribeBars');
                            const network = token.tokenType === 'dex' ? 'mainnet' : 'devnet';
                            priceClient.subscribeToPrice(
                                token.mintAddress,
                                (update) => {
                                    onRealtimeCallback({
                                        time: Number(update.time) * 1000,
                                        open: update.price,
                                        high: update.price,
                                        low: update.price,
                                        close: update.price
                                    });
                                },
                                network
                            );
                        },
                        unsubscribeBars: () => { }
                    }
                });
            }
        };

        return () => {
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };
    }, [token]);

    return <div id="tradingview_chart" style={{ width, height }} />;
}
