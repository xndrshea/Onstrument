import { useEffect, useState } from 'react';
import { User, UserService } from '../../services/userService';
import { useWallet } from '@solana/wallet-adapter-react';
import { API_BASE_URL } from '../../config';
import { Link } from 'react-router-dom';
import { TradingStats } from './TradingStats';

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
        <div
            className={`fixed inset-0 overflow-y-auto bg-black/50 flex items-center justify-center z-[9999] p-4 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                } transition-opacity duration-300`}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className={`relative bg-[#232427] rounded-lg w-full max-w-2xl transform ${isOpen ? 'translate-y-0' : '-translate-y-8'
                    } transition-transform duration-300`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white">Profile</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white"
                        >
                            ×
                        </button>
                    </div>

                    {/* Modal content */}
                    <div className="max-h-[80vh] overflow-y-auto">
                        {/* User info section */}
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

                        {/* Trading stats section */}
                        <div className="mt-6">
                            <TradingStats />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}