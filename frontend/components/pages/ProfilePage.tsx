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
        return <div className="p-4 text-gray-600">Loading profile...</div>;
    }

    // Only redirect after wallet has fully initialized
    if (!isInitializing && !connecting && !connected) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-8">Profile</h1>

            {user && (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
                        {/* User Info Card */}
                        <div className="bg-white rounded-lg p-6 h-fit border border-gray-200 shadow-sm">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Account Details</h2>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-sm text-gray-500">Wallet Address</p>
                                    <p className="text-gray-700 break-all">{user.walletAddress}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Member Since</p>
                                    <p className="text-gray-700">{new Date(user.createdAt).toLocaleDateString()}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500">Subscription Status</p>
                                    <p className={user.isSubscribed ? 'text-green-600' : 'text-gray-500'}>
                                        {user.isSubscribed ? 'Active' : 'Inactive'}
                                    </p>
                                </div>
                                {user.subscriptionExpiresAt && (
                                    <div>
                                        <p className="text-sm text-gray-500">Subscription Expires</p>
                                        <p className="text-gray-700">{new Date(user.subscriptionExpiresAt).toLocaleDateString()}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Trading Stats */}
                        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
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