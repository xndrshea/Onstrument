import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getAuthHeaders } from '../../utils/headers';

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
                const response = await fetch(`/api/users/${publicKey.toString()}/trading-stats`, {
                    headers: (await getAuthHeaders()).headers,
                    credentials: 'include'
                });

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
        return <div className="text-center p-4 text-gray-500">Please connect your wallet to view trading statistics.</div>;
    }

    if (isLoading) {
        return <div className="text-center p-4 text-gray-500">Loading trading statistics...</div>;
    }

    if (error) {
        return <div className="text-center text-red-600 p-4">{error}</div>;
    }

    if (stats.length === 0) {
        return <div className="text-center p-4 text-gray-500">No trading history found.</div>;
    }

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Trading Statistics</h2>

            {/* Overall Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="text-sm text-gray-500">Total Trades</h3>
                    <p className="text-lg font-bold text-gray-900">
                        {stats.reduce((acc, s) => acc + (s.total_trades || 0), 0)}
                    </p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="text-sm text-gray-500">Total Volume</h3>
                    <p className="text-lg font-bold text-gray-900">
                        ${Number(stats.reduce((acc, s) => acc + (Number(s.total_volume) || 0), 0)).toFixed(2)}
                    </p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="text-sm text-gray-500">Buy Volume</h3>
                    <p className="text-lg font-bold text-gray-900">
                        ${Number(stats.reduce((acc, s) => acc + (Number(s.total_buy_volume) || 0), 0)).toFixed(2)}
                    </p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="text-sm text-gray-500">Sell Volume</h3>
                    <p className="text-lg font-bold text-gray-900">
                        ${Number(stats.reduce((acc, s) => acc + (Number(s.total_sell_volume) || 0), 0)).toFixed(2)}
                    </p>
                </div>
            </div>

            {/* Per Token Statistics */}
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white rounded-lg border border-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Volume</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Trade</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {stats.map((stat) => (
                            <tr key={stat.mint_address} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{stat.symbol}</div>
                                    <div className="text-sm text-gray-500">{stat.name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    {stat.total_trades || 0}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    ${Number(stat.total_volume || 0).toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
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