import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { User, UserService } from '../../services/userService';
import { TradingStats } from '../Profile/TradingStats';
import { Portfolio } from '../Profile/Portfolio';
import { Navigate, useNavigate } from 'react-router-dom';

export function ProfilePage() {
    const { connected, publicKey, connecting, wallet } = useWallet();
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        // Wait for wallet adapter to initialize
        const timer = setTimeout(() => {
            setIsInitializing(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

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

    // Show loading while wallet is initializing or connecting
    if (isInitializing || connecting) {
        return <div className="p-4 text-white">Loading profile...</div>;
    }

    // Only redirect after wallet has fully initialized
    if (!isInitializing && !connecting && !connected) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-white mb-8">Profile</h1>

            {user && (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
                        {/* User Info Card */}
                        <div className="bg-[#232427] rounded-lg p-6 h-fit">
                            <h2 className="text-xl font-bold text-white mb-4">Account Details</h2>
                            <div className="space-y-4 text-gray-300">
                                <div>
                                    <p className="text-sm text-gray-400">Wallet Address</p>
                                    <p className="break-all">{user.walletAddress}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-400">Member Since</p>
                                    <p>{new Date(user.createdAt).toLocaleDateString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-400">Subscription Status</p>
                                    <p className={user.isSubscribed ? 'text-green-400' : 'text-gray-400'}>
                                        {user.isSubscribed ? 'Active' : 'Inactive'}
                                    </p>
                                </div>
                                {user.subscriptionExpiresAt && (
                                    <div>
                                        <p className="text-sm text-gray-400">Subscription Expires</p>
                                        <p>{new Date(user.subscriptionExpiresAt).toLocaleDateString()}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Trading Stats */}
                        <div className="bg-[#232427] rounded-lg p-6">
                            <TradingStats />
                        </div>
                    </div>

                    {/* Portfolio Section */}
                    {publicKey && (
                        <Portfolio walletAddress={publicKey.toString()} />
                    )}
                </div>
            )}
        </div>
    );
} 