import { useEffect, useState } from 'react';
import { User, UserService } from '../../services/userService';
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

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { publicKey } = useWallet();
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState<TradingStatsRecord[]>([]);
    const [isLoadingStats, setIsLoadingStats] = useState(false);

    useEffect(() => {
        if (publicKey) {
            UserService.getUser(publicKey.toString())
                .then(userData => {
                    if (userData) {
                        setUser(userData);
                    }
                })
                .catch(error => {
                    console.error('Error fetching user data:', error);
                });
        }
    }, [publicKey]);

    // Add new effect for fetching trading stats
    useEffect(() => {
        async function fetchStats() {
            if (!publicKey || !isOpen) return;

            try {
                setIsLoadingStats(true);
                const response = await fetch(`${API_BASE_URL}/users/${publicKey.toString()}/trading-stats`);
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                }
            } catch (error) {
                console.error('Error fetching trading stats:', error);
            } finally {
                setIsLoadingStats(false);
            }
        }

        fetchStats();
    }, [publicKey, isOpen]);

    const handleToggleSubscription = async () => {
        if (!user) return;

        setIsLoading(true);
        try {
            const updatedUser = await UserService.toggleSubscription(user.walletAddress);
            setUser(updatedUser);
        } catch (error) {
            console.error('Error toggling subscription:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#232427] p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Profile</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        ✕
                    </button>
                </div>

                {/* Existing User Info */}
                {user && (
                    <div className="space-y-4 text-white mb-8">
                        <p>User ID: <span className="text-gray-300">{user.userId}</span></p>
                        <p>Wallet: <span className="text-gray-300">{user.walletAddress}</span></p>

                        <div className="flex items-center justify-between">
                            <span>Subscription Status:</span>
                            <button
                                onClick={handleToggleSubscription}
                                disabled={isLoading}
                                className={`px-4 py-2 rounded-md transition-colors ${user.isSubscribed
                                    ? 'bg-green-500 hover:bg-green-600'
                                    : 'bg-gray-500 hover:bg-gray-600'
                                    }`}
                            >
                                {isLoading ? 'Loading...' : user.isSubscribed ? 'Subscribed' : 'Not Subscribed'}
                            </button>
                        </div>

                        {user.subscriptionExpiresAt && (
                            <p>Expires: <span className="text-gray-300">
                                {new Date(user.subscriptionExpiresAt).toLocaleDateString()}
                            </span></p>
                        )}
                        <p>Member Since: <span className="text-gray-300">
                            {new Date(user.createdAt).toLocaleDateString()}
                        </span></p>
                    </div>
                )}

                {/* Trading Statistics Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white">Trading Statistics</h3>

                    {isLoadingStats ? (
                        <div className="text-gray-400">Loading statistics...</div>
                    ) : stats.length > 0 ? (
                        <>
                            {/* Overall Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="bg-[#2A2D31] p-3 rounded-lg">
                                    <p className="text-sm text-gray-400">Total Trades</p>
                                    <p className="text-lg font-bold text-white">
                                        {stats.reduce((acc, s) => acc + (Number(s.total_trades) || 0), 0)}
                                    </p>
                                </div>
                                <div className="bg-[#2A2D31] p-3 rounded-lg">
                                    <p className="text-sm text-gray-400">Total Volume</p>
                                    <p className="text-lg font-bold text-white">
                                        {stats.reduce((acc, s) => acc + (Number(s.total_volume) || 0), 0).toFixed(4)} SOL
                                    </p>
                                </div>
                                <div className="bg-[#2A2D31] p-3 rounded-lg">
                                    <p className="text-sm text-gray-400">Buy Volume</p>
                                    <p className="text-lg font-bold text-white">
                                        {stats.reduce((acc, s) => acc + (Number(s.total_buy_volume) || 0), 0).toFixed(4)} SOL
                                    </p>
                                </div>
                                <div className="bg-[#2A2D31] p-3 rounded-lg">
                                    <p className="text-sm text-gray-400">Sell Volume</p>
                                    <p className="text-lg font-bold text-white">
                                        {stats.reduce((acc, s) => acc + (Number(s.total_sell_volume) || 0), 0).toFixed(4)} SOL
                                    </p>
                                </div>
                            </div>

                            {/* Token Stats Table */}
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="bg-[#2A2D31]">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Token</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Trades</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Volume</th>
                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Last Trade</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {stats.map((stat) => (
                                            <tr key={stat.mint_address} className="bg-[#2A2D31] bg-opacity-50">
                                                <td className="px-4 py-2">
                                                    <div className="text-sm text-white">{stat.symbol}</div>
                                                    <div className="text-xs text-gray-400">{stat.name}</div>
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-300">
                                                    {Number(stat.total_trades)}
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-300">
                                                    {Number(stat.total_volume).toFixed(4)} SOL
                                                </td>
                                                <td className="px-4 py-2 text-sm text-gray-300">
                                                    {new Date(stat.last_trade_at).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="text-gray-400">No trading history found.</div>
                    )}
                </div>
            </div>
        </div>
    );
}