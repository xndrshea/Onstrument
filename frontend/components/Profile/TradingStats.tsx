import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { API_BASE_URL } from '../../config';

interface TradingStatsRecord {
    mint_address: string;
    symbol: string;
    name: string;
    total_trades: number;
    total_volume: number;
    total_buy_volume: number;
    total_sell_volume: number;
    first_trade_at: string;
    last_trade_at: string;
}

export function TradingStats() {
    const { publicKey } = useWallet();
    const [stats, setStats] = useState<TradingStatsRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchStats() {
            if (!publicKey) return;

            try {
                setIsLoading(true);
                const response = await fetch(`${API_BASE_URL}/users/${publicKey.toString()}/trading-stats`);

                if (!response.ok) {
                    throw new Error('Failed to fetch trading stats');
                }

                const data = await response.json();
                setStats(data);
            } catch (error) {
                console.error('Error fetching trading stats:', error);
                setError('Failed to load trading statistics');
            } finally {
                setIsLoading(false);
            }
        }

        fetchStats();
    }, [publicKey]);

    if (!publicKey) {
        return <div className="text-center p-4">Please connect your wallet to view trading statistics.</div>;
    }

    if (isLoading) {
        return <div className="text-center p-4">Loading trading statistics...</div>;
    }

    if (error) {
        return <div className="text-center text-red-600 p-4">{error}</div>;
    }

    if (stats.length === 0) {
        return <div className="text-center p-4">No trading history found.</div>;
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold mb-4">Your Trading Statistics</h2>

            {/* Overall Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-[#2A2D31] p-4 rounded-lg">
                    <h3 className="text-sm text-gray-400">Total Trades</h3>
                    <p className="text-lg font-bold text-white">
                        {stats.reduce((acc, s) => acc + (s.total_trades || 0), 0)}
                    </p>
                </div>
                <div className="bg-[#2A2D31] p-4 rounded-lg">
                    <h3 className="text-sm text-gray-400">Total Volume</h3>
                    <p className="text-lg font-bold text-white">
                        {Number(stats.reduce((acc, s) => acc + (Number(s.total_volume) || 0), 0)).toFixed(4)} SOL
                    </p>
                </div>
                <div className="bg-[#2A2D31] p-4 rounded-lg">
                    <h3 className="text-sm text-gray-400">Buy Volume</h3>
                    <p className="text-lg font-bold text-white">
                        {Number(stats.reduce((acc, s) => acc + (Number(s.total_buy_volume) || 0), 0)).toFixed(4)} SOL
                    </p>
                </div>
                <div className="bg-[#2A2D31] p-4 rounded-lg">
                    <h3 className="text-sm text-gray-400">Sell Volume</h3>
                    <p className="text-lg font-bold text-white">
                        {Number(stats.reduce((acc, s) => acc + (Number(s.total_sell_volume) || 0), 0)).toFixed(4)} SOL
                    </p>
                </div>
            </div>

            {/* Per Token Statistics */}
            <div className="overflow-x-auto">
                <table className="min-w-full bg-[#2A2D31] rounded-lg">
                    <thead className="bg-[#232427]">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Token</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Trades</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Volume</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Trade</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {stats.map((stat) => (
                            <tr key={stat.mint_address}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-white">{stat.symbol}</div>
                                    <div className="text-sm text-gray-400">{stat.name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {stat.total_trades || 0}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {Number(stat.total_volume || 0).toFixed(4)} SOL
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {new Date(stat.last_trade_at).toLocaleDateString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
} 