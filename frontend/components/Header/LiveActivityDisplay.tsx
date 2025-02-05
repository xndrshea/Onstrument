import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { priceClient } from '../../services/priceClient';
import { getFullHeaders } from '../../utils/headers';

interface Trade {
    type: 'trade';
    mintAddress: string;
    price: number;
    volume?: number;
    isSell: boolean;
    timestamp: number;
    walletAddress?: string;
    symbol?: string;
}

interface Creation {
    type: 'creation';
    mintAddress: string;
    symbol?: string;
    creator: string;
    timestamp: number;
}

type Activity = Trade | Creation;

export function LiveActivityDisplay() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [tradesResponse, creationsResponse] = await Promise.all([
                    fetch('/api/trades/recent', {
                        headers: await getFullHeaders()
                    }),
                    fetch('/api/recent-creations', {
                        headers: await getFullHeaders()
                    })
                ]);

                if (!tradesResponse.ok || !creationsResponse.ok) {
                    throw new Error('Failed to fetch initial data');
                }

                // Helper function to normalize timestamps to milliseconds
                const normalizeTimestamp = (timestamp: number | string): number => {
                    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
                    // If timestamp is in seconds (13 digits is milliseconds, 10 digits is seconds)
                    return ts.toString().length <= 10 ? ts * 1000 : ts;
                };

                // Process trades with symbol fetching
                const tradesData = await tradesResponse.json();
                const trades = await Promise.all(
                    tradesData.map(async (trade: any) => {
                        try {
                            const tokenResponse = await fetch(`/api/tokens/${trade.mintAddress}`);
                            const tokenInfo = await tokenResponse.json();

                            return {
                                type: 'trade' as const,
                                mintAddress: trade.mintAddress,
                                price: trade.price,
                                volume: trade.volume,
                                isSell: trade.isSell || false,
                                timestamp: normalizeTimestamp(trade.timestamp),
                                walletAddress: trade.walletAddress,
                                symbol: tokenInfo.symbol
                            };
                        } catch (error) {
                            console.error('Error fetching token info:', error);
                            return {
                                type: 'trade' as const,
                                ...trade,
                                timestamp: normalizeTimestamp(trade.timestamp),
                                isSell: trade.isSell || false
                            };
                        }
                    })
                );

                // Process creations
                const creationsData = await creationsResponse.json();
                const creations = creationsData.map((creation: any) => ({
                    type: 'creation' as const,
                    mintAddress: creation.mintAddress,
                    symbol: creation.symbol,
                    creator: creation.creator,
                    timestamp: normalizeTimestamp(creation.timestamp)
                }));


                // Combine and sort by timestamp
                const combined = [...trades, ...creations]
                    .filter(item => item && item.timestamp && !isNaN(item.timestamp))
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 50);

                setActivities(combined);
            } catch (error) {
                console.error('Error fetching initial data:', error);
                setError('Failed to load activity feed');
            }
        };

        fetchInitialData();

        // WebSocket handlers
        const handleTrade = async (update: {
            mintAddress: string;
            price: number;
            volume?: number;
            isSell?: boolean;
            timestamp: number;
            walletAddress?: string;
        }) => {
            try {
                const tokenResponse = await fetch(`/api/tokens/${update.mintAddress}`);
                const tokenInfo = await tokenResponse.json();

                setActivities(prev => {
                    const newActivity = {
                        ...update,
                        type: 'trade' as const,
                        isSell: update.isSell || false,
                        symbol: tokenInfo.symbol,
                        timestamp: update.timestamp
                    };
                    return [newActivity, ...prev]
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .slice(0, 50);
                });
            } catch (error) {
                console.error('Error handling trade:', error);
            }
        };

        const handleCreation = (creation: Creation) => {
            setActivities(prev => {
                const newActivity = {
                    ...creation,
                    type: 'creation' as const,
                    timestamp: creation.timestamp
                };
                return [newActivity, ...prev]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 50);
            });
        };

        const unsubscribeTrades = priceClient.wsClient.subscribeToTrades(handleTrade);
        const unsubscribeCreations = priceClient.wsClient.subscribeToCreations(handleCreation);

        return () => {
            if (unsubscribeTrades) unsubscribeTrades();
            if (unsubscribeCreations) unsubscribeCreations();
        };
    }, []);

    if (error) {
        return <div className="text-red-500 text-sm">{error}</div>;
    }

    return (
        <div className="flex items-center space-x-4 overflow-x-hidden whitespace-nowrap px-4 py-2 relative flex-shrink-0">
            <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent z-10" />
            {activities.map((activity, index) => (
                activity.type === 'creation' ? (
                    <div key={`creation-${activity.mintAddress}-${index}`}
                        className="flex items-center space-x-2 px-4 py-1.5 rounded-full text-sm bg-blue-100 text-blue-800 flex-shrink-0">
                        <span className="text-xs opacity-75 truncate">
                            {activity.creator.slice(0, 4)}... created
                        </span>
                        <Link
                            to={`/token/${activity.mintAddress}`}
                            className="text-xs font-medium hover:underline truncate max-w-[100px]"
                        >
                            {activity.symbol || 'New Token'}
                        </Link>
                    </div>
                ) : (
                    <div key={`trade-${activity.mintAddress}-${index}`}
                        className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${activity.isSell ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {activity.walletAddress && (
                            <span className="font-medium truncate max-w-[60px]">
                                {activity.walletAddress.slice(0, 4)}...
                            </span>
                        )}
                        {activity.volume != null && (
                            <span className="text-xs opacity-75">
                                ${Number(activity.volume).toFixed(2)}
                            </span>
                        )}
                        <span className="text-xs opacity-75">of</span>
                        <Link
                            to={`/token/${activity.mintAddress}`}
                            className="text-xs opacity-75 hover:opacity-100 hover:underline"
                        >
                            {activity.symbol || `${activity.mintAddress.slice(0, 6)}...${activity.mintAddress.slice(-4)}`}
                        </Link>
                    </div>
                )
            ))}
            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent z-10" />
        </div>
    );
} 