import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { User, UserService } from '../../services/userService';
import { TradingStats } from '../Profile/TradingStats';
import { Portfolio } from '../Profile/Portfolio';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { getFullHeaders } from '../../utils/headers';

interface CreatedToken {
    mintAddress: string;
    name: string;
    symbol: string;
    currentPrice: number;
    marketCapUsd: number;
    createdAt: string;
}

export function ProfilePage() {
    const { connected, publicKey, connecting, wallet } = useWallet();
    const navigate = useNavigate();
    const [user, setUser] = useState<User | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);
    const [createdTokens, setCreatedTokens] = useState<CreatedToken[]>([]);

    useEffect(() => {
        // Wait for wallet adapter to initialize
        const timer = setTimeout(() => {
            setIsInitializing(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (publicKey) {
            // Fetch user data
            UserService.getUser(publicKey.toString())
                .then(userData => {
                    if (userData) {
                        setUser(userData);
                    }
                })
                .catch(error => {
                    console.error('Error fetching user data:', error);
                });

            // Fetch created tokens
            const fetchTokens = async () => {
                try {
                    const response = await fetch(`/api/users/${publicKey.toString()}/created-tokens`, {
                        headers: await getFullHeaders()
                    });
                    const data = await response.json();
                    setCreatedTokens(data.tokens);
                } catch (error) {
                    console.error('Error fetching created tokens:', error);
                }
            };

            fetchTokens();
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

                    {/* Created Tokens Section */}
                    <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Created Tokens</h2>
                        {createdTokens.length > 0 ? (
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market Cap</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {createdTokens.map((token) => (
                                        <tr key={token.mintAddress}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => navigate(`/token/${token.mintAddress}`)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">{token.name}</div>
                                                        <div className="text-sm text-gray-500">{token.symbol}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                ${Number(token.marketCapUsd)?.toFixed(2) || '0.00'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(token.createdAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="text-gray-600 text-center py-8">
                                No tokens created yet
                            </div>
                        )}
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