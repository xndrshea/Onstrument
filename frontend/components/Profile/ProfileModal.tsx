import { useEffect, useState } from 'react';
import { User, UserService } from '../../services/userService';
import { useWallet } from '@solana/wallet-adapter-react';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { publicKey } = useWallet();
    const [user, setUser] = useState<User | null>(null);

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#232427] p-6 rounded-lg max-w-md w-full">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Profile</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        ✕
                    </button>
                </div>
                {user && (
                    <div className="space-y-4 text-white">
                        <p>User ID: <span className="text-gray-300">{user.userId}</span></p>
                        <p>Wallet: <span className="text-gray-300">{user.walletAddress}</span></p>
                        <p>Subscription: <span className="text-gray-300">{user.isSubscribed ? 'Active' : 'Inactive'}</span></p>
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
            </div>
        </div>
    );
}