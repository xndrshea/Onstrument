import { useEffect, useState } from 'react';
import { User, UserService } from '../../services/userService';
import { useWallet } from '@solana/wallet-adapter-react';
import { Link, useNavigate } from 'react-router-dom';
import { TradingStats } from './TradingStats';
import { getAuthHeaders } from '../../utils/headers';
import { useAuth } from '../../hooks/useAuthQuery';
import { useScrollLock } from '../../hooks/useScrollLock';

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
    useScrollLock(isOpen);
    const { publicKey } = useWallet();
    const { isAuthenticated } = useAuth();
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState<TradingStatsRecord[]>([]);
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const navigate = useNavigate();
    const isDev = !import.meta.env.PROD; // Check if we're in development environment

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

    // Updated effect for fetching trading stats test
    useEffect(() => {
        async function fetchStats() {
            if (!publicKey || !isOpen || !isAuthenticated) return;

            try {
                setIsLoadingStats(true);
                const headers = await getAuthHeaders();
                const response = await fetch(
                    `/api/users/${publicKey.toString()}/trading-stats`,
                    {
                        headers: headers.headers,
                        credentials: 'include',
                        method: 'GET'
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setStats(data);
            } catch (error) {
                console.error('Error fetching trading stats:', error);
            } finally {
                setIsLoadingStats(false);
            }
        }

        fetchStats();
    }, [publicKey, isOpen, isAuthenticated]);

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

    const handleViewProfile = () => {
        onClose();
        navigate('/profile');
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
                className={`relative bg-white rounded-lg w-full max-w-2xl transform ${isOpen ? 'translate-y-0' : '-translate-y-8'
                    } transition-transform duration-300 shadow-xl border border-gray-200`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">Profile</h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            ×
                        </button>
                    </div>

                    {/* Modal content */}
                    <div className="max-h-[80vh] overflow-y-auto">
                        {/* User info section */}
                        {user && (
                            <div className="space-y-4 mb-8">
                                <p className="text-gray-700">User ID: <span className="text-gray-900">{user.userId}</span></p>
                                <p className="text-gray-700">Wallet: <span className="text-gray-900">{user.walletAddress}</span></p>

                                {/* Only show toggle subscription in development */}
                                {isDev && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-700">Subscription Status:</span>
                                        <button
                                            onClick={handleToggleSubscription}
                                            disabled={isLoading}
                                            className={`px-4 py-2 rounded-md transition-colors ${user.isSubscribed
                                                ? 'bg-green-500 hover:bg-green-600 text-white'
                                                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                                                }`}
                                        >
                                            {isLoading ? 'Loading...' : user.isSubscribed ? 'Subscribed' : 'Not Subscribed'}
                                        </button>
                                    </div>
                                )}

                                {/* Show subscription status for all environments */}
                                {!isDev && (
                                    <p className="text-gray-700">
                                        Subscription Status: {' '}
                                        <span className={user.isSubscribed ? 'text-green-600' : 'text-gray-500'}>
                                            {user.isSubscribed ? 'Active' : 'Not Subscribed'}
                                        </span>
                                    </p>
                                )}

                                {user.subscriptionExpiresAt && (
                                    <p className="text-gray-700">Expires: <span className="text-gray-900">
                                        {new Date(user.subscriptionExpiresAt).toLocaleDateString()}
                                    </span></p>
                                )}
                                <p className="text-gray-700">Member Since: <span className="text-gray-900">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </span></p>
                            </div>
                        )}

                        {/* View Full Profile Button */}
                        <button
                            onClick={handleViewProfile}
                            className="w-full mt-6 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
                        >
                            View Full Profile
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}