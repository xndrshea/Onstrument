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
    const loadedDataRef = useRef<{ [key: string]: boolean }>({});
    const denominationRef = useRef<string>('USD');
    const [denomination, setDenomination] = useState<'SOL' | 'USD' | 'MCAP'>('USD');

    useEffect(() => {
        if (!containerRef.current) {
            console.log('Container ref not ready');
            return;
        }
        if (widgetRef.current) {
            console.log('Widget already exists');
            return;
        }

        // Add this debug fetch
        fetch('/charting_library/charting_library/charting_library.js')
            .then(r => r.text())
            .then(() => {
            })
            .catch(err => console.error('Fetch error:', err));

        const script = document.createElement('script');
        const scriptPath = '/charting_library/charting_library/charting_library.standalone.js';
        script.src = scriptPath;
        script.async = true;


        script.onerror = (error) => {
            console.error('Script failed to load:', error);
            console.log('Document head children:', document.head.children);
        };

        script.onload = () => {
            if (!window.TradingView) return;

            widgetRef.current = new (window as any).TradingView.widget({
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
                    "mainSeriesProperties.candleStyle.wickDownColor": "#ff4976",
                    "mainSeriesProperties.candleStyle.drawWick": true,
                    "mainSeriesProperties.candleStyle.drawBorder": true,
                    "mainSeriesProperties.candleStyle.barColorsOnPrevClose": true
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
                                pricescale: 10000000,
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
                            // Check if we've already loaded data for this resolution
                            if (loadedDataRef.current[resolution]) {
                                onHistoryCallback([], { noData: false });
                                return;
                            }

                            // Override the time parameters
                            const modifiedParams = {
                                ...periodParams,
                                from: 0,
                                to: Math.floor(Date.now() / 1000),
                                countBack: 100000
                            };

                            const { from, to } = modifiedParams;

                            const url = `/api/ohlcv/${token.mintAddress}?resolution=${resolution}&from=${from}&to=${to}&denomination=${denomination}`;
                            const response = await fetch(url);

                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }

                            const data = await response.json();
                            const bars = data.map((bar: any, index: number, array: any[]) => {
                                const prevBar = index > 0 ? array[index - 1] : null;

                                // If there's only one price point for this bar
                                if (bar.open === bar.close && bar.high === bar.low) {
                                    const price = Number(bar.close);
                                    return {
                                        time: Number(bar.time) * 1000,
                                        open: prevBar ? Number(prevBar.close) : price,
                                        high: Math.max(price, prevBar ? Number(prevBar.close) : price),
                                        low: Math.min(price, prevBar ? Number(prevBar.close) : price),
                                        close: price,
                                        volume: Number(bar.volume || 0),
                                        isBarClosed: true,
                                        isLastBar: index === data.length - 1
                                    };
                                }

                                // Ensure all price values are converted to numbers
                                const barData = {
                                    time: Number(bar.time) * 1000,
                                    open: Number(bar.open),
                                    high: Number(bar.high),
                                    low: Number(bar.low),
                                    close: Number(bar.close),
                                    volume: Number(bar.volume || 0),
                                    isBarClosed: true,
                                    isLastBar: index === data.length - 1
                                };

                                // Validate the data
                                if (isNaN(barData.open) || isNaN(barData.high) || isNaN(barData.low) || isNaN(barData.close)) {
                                    console.warn('Invalid price data detected:', bar);
                                    return null;
                                }

                                return barData;
                            }).filter(Boolean);

                            // Mark this resolution as loaded
                            loadedDataRef.current[resolution] = true;

                            onHistoryCallback(bars, { noData: bars.length === 0 });
                        } catch (error) {
                            console.error('Error loading bars:', error);
                            onHistoryCallback([], { noData: true });
                        }
                    },
                    subscribeBars: (symbolInfo: any, resolution: string, onRealtimeCallback: any) => {
                        const network = token.tokenType === 'dex' ? 'mainnet' : 'devnet';
                        let currentBar: any = null;
                        let lastClose: number | null = null;

                        const unsubscribePromise = priceClient.subscribeToPrice(
                            token.mintAddress,
                            (update: { price: number; time: number; isSell?: boolean; volume?: number }) => {
                                const price = Number(update.price || 0);
                                const volume = Number(update.volume || 0);
                                const timestamp = update.time * 1000;
                                const resolutionMs = getResolutionInMs(resolution);
                                const barStartTime = Math.floor(timestamp / resolutionMs) * resolutionMs;

                                if (currentBar && barStartTime < currentBar.time) {
                                    console.warn('Received outdated timestamp, skipping update');
                                    return;
                                }

                                if (!currentBar || timestamp >= currentBar.time + resolutionMs) {
                                    if (currentBar) {
                                        lastClose = currentBar.close;
                                        onRealtimeCallback({ ...currentBar, isBarClosed: true });
                                    }

                                    currentBar = {
                                        time: barStartTime,
                                        open: lastClose || price,
                                        high: price,
                                        low: price,
                                        close: price,
                                        volume: volume,
                                        isBarClosed: false
                                    };
                                } else {
                                    currentBar.high = Math.max(currentBar.high, price);
                                    currentBar.low = Math.min(currentBar.low, price);
                                    currentBar.close = price;
                                    currentBar.volume += volume;
                                }

                                onRealtimeCallback(currentBar);
                            },
                            network
                        );

                        return () => unsubscribePromise.then(cleanup => cleanup());
                    },
                    unsubscribeBars: () => { }
                },
                price_scale: {
                    auto_scale: false,
                    percentage: false,
                    scale_margin_top: 2.0,
                    scale_margin_bottom: 0.5,
                },
                auto_scale: false,
                scale_mode: 'Normal',
            });

            widgetRef.current.onChartReady(() => {
                try {
                    // Wait for header to be ready before creating button
                    widgetRef.current.headerReady().then(() => {
                        const button = widgetRef.current.createButton();

                        // Match TradingView's button styling
                        button.textContent = denomination;
                        button.style.color = "#d1d4dc";
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

                        button.addEventListener("click", () => {
                            setDenomination(prev => {
                                const next = prev === 'SOL' ? 'USD' :
                                    prev === 'USD' ? 'MCAP' : 'SOL';
                                button.textContent = next;
                                return next;
                            });
                            widgetRef.current.chart().resetData();
                        });
                    });
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
    }, []);

    // Handle denomination changes without recreating widget
    useEffect(() => {
        if (widgetRef.current) {
            loadedDataRef.current = {}; // Reset loaded state for all resolutions
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