import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { priceClient } from '../../services/priceClient';
import { getFullHeaders } from '../../utils/headers';

interface Trade {
    mintAddress: string;
    price: number;
    volume?: number;
    isSell: boolean;
    timestamp: number;
    walletAddress?: string;
    symbol?: string;
}

export function LiveTradesDisplay() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecentTrades = async () => {
            try {
                const response = await fetch('/api/trades/recent', {
                    headers: await getFullHeaders()
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch trades');
                }
                const recentTrades = await response.json();

                // Fetch symbols for all initial trades
                const tradesWithSymbols = await Promise.all(
                    (Array.isArray(recentTrades) ? recentTrades : []).map(async (trade) => {
                        const tokenResponse = await fetch(`/api/tokens/${trade.mintAddress}`);
                        const tokenInfo = await tokenResponse.json();
                        return { ...trade, symbol: tokenInfo.symbol };
                    })
                );

                setTrades(tradesWithSymbols);
            } catch (error) {
                console.error('Error fetching trades:', error);
                setError('Failed to load recent trades');
                setTrades([]);
            }
        };

        fetchRecentTrades();

        // Existing WebSocket subscription
        const handleTradeUpdate = async (update: {
            mintAddress: string;
            price: number;
            volume?: number;
            isSell?: boolean;
            timestamp: number;
            walletAddress?: string;
        }) => {
            const response = await fetch(`/api/tokens/${update.mintAddress}`);
            const tokenInfo = await response.json();

            setTrades(prevTrades => {
                const newTrades = [
                    {
                        ...update,
                        mintAddress: update.mintAddress,
                        isSell: update.isSell || false,
                        symbol: tokenInfo.symbol
                    },
                    ...prevTrades
                ].slice(0, 50);
                return newTrades;
            });
        };

        const unsubscribe = priceClient.wsClient.subscribeToTrades(handleTradeUpdate);

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    if (error) {
        return <div className="text-red-500 text-sm">{error}</div>;
    }

    return (
        <div className="flex items-center space-x-4 overflow-x-hidden whitespace-nowrap px-4 py-2 relative">
            <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent z-10" />
            {Array.isArray(trades) && trades.map((trade, index) => (
                <div
                    key={`${trade.mintAddress}-${trade.timestamp}-${index}`}
                    className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${trade.isSell ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                        }`}
                >
                    {trade.walletAddress && (
                        <span className="font-medium truncate max-w-[60px]">
                            {trade.walletAddress.slice(0, 4)}...
                        </span>
                    )}
                    {trade.volume && (
                        <span className="text-xs opacity-75">
                            ${trade.volume}
                        </span>
                    )}
                    <span className="text-xs opacity-75">of</span>
                    <Link
                        to={`/token/${trade.mintAddress}`}
                        className="text-xs opacity-75 hover:opacity-100 hover:underline"
                    >
                        {trade.symbol || `${trade.mintAddress.slice(0, 6)}...${trade.mintAddress.slice(-4)}`}
                    </Link>
                </div>
            ))}
            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent z-10" />
        </div>
    );
} 