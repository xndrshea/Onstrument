import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { priceClient } from '../../services/priceClient';

interface Trade {
    mintAddress: string;
    price: number;
    volume?: number;
    isSell: boolean;
    timestamp: number;
    walletAddress?: string;
}

export function LiveTradesDisplay() {
    const [trades, setTrades] = useState<Trade[]>([]);

    useEffect(() => {
        const handleTradeUpdate = (update: {
            mintAddress: string;
            price: number;
            volume?: number;
            isSell?: boolean;
            timestamp: number;
            walletAddress?: string;
        }) => {
            setTrades(prevTrades => {
                const newTrades = [
                    {
                        ...update,
                        mintAddress: update.mintAddress,
                        isSell: update.isSell || false,
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

    return (
        <div className="flex items-center space-x-4 overflow-x-auto whitespace-nowrap px-4 py-2">
            {trades.map((trade, index) => (
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
                            ${trade.volume.toFixed(2)}
                        </span>
                    )}
                    <span className="text-xs opacity-75">of</span>
                    <Link
                        to={`/token/${trade.mintAddress}`}
                        className="text-xs opacity-75 hover:opacity-100 hover:underline"
                    >
                        {trade.mintAddress.slice(0, 6)}...{trade.mintAddress.slice(-4)}
                    </Link>
                </div>
            ))}
        </div>
    );
} 