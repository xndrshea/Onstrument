import { TokenRecord } from "../../../shared/types/token";
import { useEffect, useRef, useState } from 'react';
import { priceClient } from '../../services/priceClient';

interface TradingViewChartProps {
    token: TokenRecord;
    width: number;
    height: number;
    currentPrice?: number;
    onPriceUpdate?: (price: number) => void;
    chartStyle: {
        layout: {
            backgroundColor: string;
            textColor: string;
        };
        grid: {
            vertLines: { color: string };
            horzLines: { color: string };
        };
        timeScale: {
            borderColor: string;
            timeVisible: boolean;
            secondsVisible: boolean;
        };
        priceScale: {
            borderColor: string;
        };
    };
}

export function TradingViewChart({ token, width = 600, height = 300, currentPrice, onPriceUpdate, chartStyle }: TradingViewChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetRef = useRef<any>(null);
    const loadedDataRef = useRef<boolean>(false);
    const denominationRef = useRef<string>('USD');
    const [denomination, setDenomination] = useState<'SOL' | 'USD' | 'MCAP'>('USD');

    useEffect(() => {
        if (!containerRef.current) return;
        if (widgetRef.current) return; // Only create widget once

        const script = document.createElement('script');
        script.src = '/charting_library/charting_library/charting_library.js';
        script.async = true;

        script.onload = () => {
            if (!window.TradingView) return;

            widgetRef.current = new window.TradingView.widget({
                container: containerRef.current,
                width,
                height,
                symbol: token.mintAddress,
                interval: '1',
                timezone: 'Etc/UTC',
                theme: 'dark',
                style: '1',
                locale: 'en',
                toolbar_bg: '#232427',
                enable_publishing: false,
                hide_top_toolbar: false,
                hide_legend: false,
                save_image: false,
                library_path: '/charting_library/charting_library/',
                custom_css_url: '/charting_library/custom.css',
                disabled_features: [
                    'header_symbol_search',
                    'header_saveload',
                    'header_screenshot',
                    'header_compare',
                    'header_undo_redo',
                    'timeframes_toolbar',
                ],
                enabled_features: [
                    'show_logo_on_all_charts',
                    'header_settings',
                    'header_fullscreen_button',
                ],
                overrides: {
                    "paneProperties.background": "#131722",
                    "paneProperties.vertGridProperties.color": "#363c4e",
                    "paneProperties.horzGridProperties.color": "#363c4e",
                    "mainSeriesProperties.candleStyle.upColor": "#32c48d",
                    "mainSeriesProperties.candleStyle.downColor": "#ff4976",
                    "mainSeriesProperties.candleStyle.borderUpColor": "#32c48d",
                    "mainSeriesProperties.candleStyle.borderDownColor": "#ff4976",
                    "mainSeriesProperties.candleStyle.wickUpColor": "#32c48d",
                    "mainSeriesProperties.candleStyle.wickDownColor": "#ff4976"
                },
                studies_overrides: {
                    "volume.volume.color.0": "#ff4976",
                    "volume.volume.color.1": "#32c48d",
                    "volume.volume.transparency": 50
                },
                loading_screen: { backgroundColor: "#131722" },
                datafeed: {
                    onReady: (callback: any) => {
                        callback({
                            supported_resolutions: ['1', '5', '15', '30', '60', '240', 'D', 'W', 'M']
                        });
                    },
                    resolveSymbol: (symbolName: string, onSymbolResolvedCallback: any) => {
                        setTimeout(() => {
                            onSymbolResolvedCallback({
                                name: token.symbol,
                                description: token.name,
                                type: 'crypto',
                                session: '24x7',
                                timezone: 'Etc/UTC',
                                exchange: 'Onstrument',
                                minmov: 1,
                                pricescale: 100000,
                                has_intraday: true,
                                visible_plots_set: 'ohlcv',
                                has_weekly_and_monthly: true,
                                supported_resolutions: ['1', '5', '15', '30', '60', '240', 'D', 'W', 'M'],
                                volume_precision: 8,
                                data_status: 'streaming'
                            });
                        }, 0);
                    },
                    getBars: async (symbolInfo: any, resolution: string, periodParams: any, onHistoryCallback: any) => {
                        try {
                            const { from, to } = periodParams;
                            console.log('TradingView requesting bars:', { from, to, resolution, token: token.mintAddress });

                            // Reset loaded flag when denomination changes
                            if (denominationRef.current !== denomination) {
                                loadedDataRef.current = false;
                                denominationRef.current = denomination;
                            }

                            // Add delay between requests
                            await new Promise(resolve => setTimeout(resolve, 300));

                            const url = `/api/ohlcv/${token.mintAddress}?resolution=${resolution}&from=${from}&to=${to}&denomination=${denomination}`;
                            console.log('Fetching from URL:', url);

                            const response = await fetch(url);
                            console.log('Response status:', response.status);

                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }

                            const data = await response.json();

                            // Log historical bars
                            console.log('Historical OHLCV data:', data.map((bar: any) => ({
                                time: bar.time * 1000,
                                open: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.open),
                                high: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.high),
                                low: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.low),
                                close: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.close),
                                volume: Number(bar.volume)
                            })));

                            // Process the bars
                            const bars = data.map((bar: any) => ({
                                time: Number(bar.time) * 1000,
                                open: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.open),
                                high: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.high),
                                low: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.low),
                                close: denomination === 'MCAP' ? Number(bar.market_cap) : Number(bar.close),
                                volume: Number(bar.volume)
                            }));

                            if (bars.length > 0) {
                                loadedDataRef.current = true;
                            }

                            onHistoryCallback(bars, { noData: bars.length === 0 });
                        } catch (error) {
                            console.error('Error loading bars:', error);
                            onHistoryCallback([], { noData: true });
                        }
                    },
                    subscribeBars: (symbolInfo: any, resolution: string, onRealtimeCallback: any) => {
                        const network = token.tokenType === 'dex' ? 'mainnet' : 'devnet';
                        let currentBar: any = null;

                        priceClient.subscribeToPrice(
                            token.mintAddress,
                            (update: { price: number; time: number; volume?: number; marketCap?: number }) => {
                                const price = denomination === 'MCAP' ?
                                    Number(update.marketCap || 0) :
                                    Number(update.price || 0);

                                const timestamp = update.time * 1000;
                                const resolutionMs = getResolutionInMs(resolution);
                                const barStartTime = Math.floor(timestamp / resolutionMs) * resolutionMs;

                                if (!currentBar || timestamp >= currentBar.time + resolutionMs) {
                                    // Create new bar with the current price as open
                                    currentBar = {
                                        time: barStartTime,
                                        open: price,  // Use current price as open, not lastClose
                                        high: price,
                                        low: price,
                                        close: price,
                                        volume: Number(update.volume || 0)
                                    };
                                } else {
                                    // Update existing bar
                                    currentBar.high = Math.max(currentBar.high, price);
                                    currentBar.low = Math.min(currentBar.low, price);
                                    currentBar.close = price;
                                    currentBar.volume += Number(update.volume || 0);
                                }

                                onRealtimeCallback(currentBar);
                            },
                            network
                        );

                        return () => priceClient.unsubscribeFromPrice(token.mintAddress);
                    },
                    unsubscribeBars: () => { }
                }
            });

            // Wait for widget to be ready
            widgetRef.current.onChartReady(() => {
                console.log('Chart is ready');
                try {
                    const button = widgetRef.current.createButton();
                    console.log('Button created:', button);

                    // Match TradingView's button styling
                    button.textContent = denomination;
                    button.style.color = "#d1d4dc";  // Match other buttons' text color
                    button.style.padding = "0 12px";
                    button.style.display = "flex";
                    button.style.alignItems = "center";
                    button.style.height = "100%";
                    button.style.cursor = "pointer";

                    // Add hover effect
                    button.addEventListener('mouseenter', () => {
                        button.style.backgroundColor = "rgba(250, 250, 250, 0.1)";
                    });
                    button.addEventListener('mouseleave', () => {
                        button.style.backgroundColor = "transparent";
                    });

                    console.log('Button styled:', button.style);

                    button.addEventListener("click", () => {
                        console.log('Button clicked');
                        setDenomination(prev => {
                            const next = prev === 'SOL' ? 'USD' :
                                prev === 'USD' ? 'MCAP' : 'SOL';
                            button.textContent = next;
                            return next;
                        });
                        widgetRef.current.chart().resetData();
                    });

                    console.log('Button setup complete');
                } catch (error) {
                    console.error('Error setting up button:', error);
                }
            });
        };

        document.head.appendChild(script);
        return () => {
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };
    }, []); // Empty dependency array - only run once

    // Handle denomination changes without recreating widget
    useEffect(() => {
        if (widgetRef.current) {
            widgetRef.current.chart().resetData();
        }
    }, [denomination]);

    return <div ref={containerRef} />;
}

// Helper function to convert resolution to milliseconds
function getResolutionInMs(resolution: string): number {
    const resolutionMap: { [key: string]: number } = {
        '1': 60000,        // 1 minute
        '5': 300000,       // 5 minutes
        '15': 900000,      // 15 minutes
        '30': 1800000,     // 30 minutes
        '60': 3600000,     // 1 hour
        '240': 14400000,   // 4 hours
        'D': 86400000,     // 1 day
        'W': 604800000,    // 1 week
        'M': 2592000000    // 1 month (30 days)
    };
    return resolutionMap[resolution] || 60000; // Default to 1 minute
} 