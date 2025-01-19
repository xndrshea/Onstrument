import React from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { toast } from 'react-hot-toast';
import { UserService } from '../../services/userService';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

interface SubscriptionTier {
    id: string;
    name: string;
    duration: number; // in months
    price: number; // in SOL
    goldenPoints: number;
    features: string[];
}

const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
    {
        id: 'monthly',
        name: 'Monthly',
        duration: 1,
        price: 50,
        goldenPoints: 1,
        features: [
            'Access to all premium features',
            'Real-time market data',
            'Advanced trading tools',
            '1 Golden Point',
        ]
    },
    {
        id: 'semiannual',
        name: '6 Months',
        duration: 6,
        price: 250, // Discounted from 300
        goldenPoints: 10,
        features: [
            'Everything in Monthly',
            '10 Golden Points',
            'Priority support',
            'Early access to new features',
            '17% discount'
        ]
    },
    {
        id: 'annual',
        name: '12 Months',
        duration: 12,
        price: 450, // Discounted from 600
        goldenPoints: 25,
        features: [
            'Everything in 6 Months',
            '25 Golden Points',
            'VIP Discord access',
            'Exclusive NFT drops',
            '25% discount'
        ]
    }
];

interface SubscribeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const { setVisible } = useWalletModal();
    const [selectedTier, setSelectedTier] = React.useState<SubscriptionTier | null>(null);
    const [isProcessing, setIsProcessing] = React.useState(false);

    if (!isOpen) return null;

    const handleSubscribe = async (tier: SubscriptionTier) => {
        if (!publicKey) {
            // If wallet is not connected, prompt to connect
            setVisible(true); // This will open the wallet modal
            return;
        }

        setIsProcessing(true);

        try {
            // Get latest blockhash
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

            // Create a new transaction
            const transaction = new Transaction({
                feePayer: publicKey,
                blockhash,
                lastValidBlockHeight,
            });

            // Convert SOL amount to lamports
            const lamports = tier.price * LAMPORTS_PER_SOL;

            // Add transfer instruction
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: new PublicKey('YOUR_TREASURY_WALLET_ADDRESS'),
                lamports: lamports,
            });

            transaction.add(transferInstruction);

            // Send transaction
            const signature = await sendTransaction(transaction, connection);

            // Wait for confirmation
            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight,
            });

            if (confirmation.value.err) {
                throw new Error('Transaction failed');
            }

            // Activate subscription with specific duration
            const updatedUser = await UserService.activateSubscription({
                walletAddress: publicKey.toString(),
                durationMonths: tier.duration,
                paymentTxId: signature,
                tierType: tier.id,
                amountPaid: tier.price,
                goldenPoints: tier.goldenPoints,
            });

            toast.success('Subscription activated successfully!');
            onClose();

        } catch (error) {
            console.error('Subscription error:', error);
            toast.error('Failed to process subscription. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

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
                className={`relative bg-[#232427] rounded-lg w-full max-w-7xl transform ${isOpen ? 'translate-y-0' : '-translate-y-8'
                    } transition-transform duration-300`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Content */}
                <div className="max-w-7xl mx-auto px-4 py-16">
                    {/* Header */}
                    <div className="text-center mb-12">
                        <h2 className="text-4xl font-bold text-white mb-4">
                            Unlock Premium Features
                        </h2>
                        <p className="text-xl text-gray-300 max-w-3xl mx-auto">
                            Subscribe to access advanced features, earn Golden Points, and join an exclusive community of traders.
                        </p>
                    </div>

                    {/* Pricing Tiers */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                        {SUBSCRIPTION_TIERS.map((tier) => (
                            <div
                                key={tier.id}
                                className={`
                                    bg-[#232427] rounded-xl p-6 border-2 
                                    ${selectedTier?.id === tier.id
                                        ? 'border-purple-500 transform scale-105 transition-all duration-200'
                                        : 'border-blue-500/20 hover:border-blue-500/40'}
                                `}
                            >
                                <div className="text-center mb-6">
                                    <h3 className="text-2xl font-bold text-white mb-2">{tier.name}</h3>
                                    <div className="text-3xl font-bold text-purple-400 mb-2">
                                        {tier.price} SOL
                                    </div>
                                    <div className="text-sm text-gray-400">
                                        {tier.goldenPoints} Golden Points
                                    </div>
                                </div>

                                <ul className="space-y-3 mb-6">
                                    {tier.features.map((feature, index) => (
                                        <li key={index} className="flex items-center text-gray-300">
                                            <svg className="w-5 h-5 text-purple-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            {feature}
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => handleSubscribe(tier)}
                                    disabled={isProcessing}
                                    className="w-full bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50"
                                >
                                    {isProcessing ? 'Processing...' : publicKey ? 'Subscribe Now' : 'Connect Wallet to Subscribe'}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Additional Info */}
                    <div className="mt-12 text-center text-gray-400">
                        <p>All subscriptions include unlimited access to premium features.</p>
                        <p>Golden Points can be used for exclusive rewards and governance.</p>
                    </div>
                </div>
            </div>
        </div>
    );
} 