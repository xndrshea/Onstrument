import React from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { toast } from 'react-hot-toast';
import { UserService } from '../../services/userService';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useScrollLock } from '../../hooks/useScrollLock';

interface SubscriptionTier {
    id: string;
    name: string;
    duration: number;
    priceUSD: number;  // Price in USD
    goldenPoints: number;
    features: string[];
}

const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
    {
        id: 'monthly',
        name: '1 Month',
        duration: 1,
        priceUSD: 20,  // Changed from 50 to 20
        goldenPoints: 1,
        features: [
            '1 Gold Point',
            '3 SOL Migration Reward'
        ]
    },
    {
        id: 'quarterly',
        name: '3 Months',
        duration: 3,
        priceUSD: 60,  // Changed from 150 to 60 (20 * 3)
        goldenPoints: 5,
        features: [
            '5 Gold Points',
            '3 SOL Migration Reward'
        ]
    },
    {
        id: 'semiannual',
        name: '6 Months',
        duration: 6,
        priceUSD: 120,  // Changed from 300 to 120 (20 * 6)
        goldenPoints: 12,
        features: [
            '12 Gold Points',
            '3 SOL Migration Reward',
            'Early Access to New Features'
        ]
    }
];

interface SubscribeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const DEVNET_TREASURY_WALLET = "nmcvZkzyojoi5KNAsdGrRSgwVsNWS3voBQnEVBqBvtM";

export function SubscribeModal({ isOpen, onClose }: SubscribeModalProps) {
    useScrollLock(isOpen);
    const { publicKey, sendTransaction } = useWallet();
    const { connection } = useConnection();
    const { setVisible } = useWalletModal();
    const [selectedTier, setSelectedTier] = React.useState<SubscriptionTier | null>(null);
    const [isProcessing, setIsProcessing] = React.useState(false);

    const handleSubscribe = async (tier: SubscriptionTier) => {
        if (!publicKey) {
            setVisible(true);
            return;
        }

        setIsProcessing(true);

        try {
            // Get SOL price from Jupiter
            const response = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
            const data = await response.json();
            const solPriceUSD = Number(data.data.So11111111111111111111111111111111111111112.price);

            // Calculate SOL amount needed for the subscription
            const solAmount = tier.priceUSD / solPriceUSD;
            const lamports = Math.ceil(solAmount * LAMPORTS_PER_SOL);

            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

            const transaction = new Transaction({
                feePayer: publicKey,
                blockhash,
                lastValidBlockHeight,
            });

            const transferInstruction = SystemProgram.transfer({
                fromPubkey: publicKey,
                toPubkey: new PublicKey(DEVNET_TREASURY_WALLET),
                lamports,
            });

            transaction.add(transferInstruction);

            const signature = await sendTransaction(transaction, connection);

            // Poll for confirmation
            let done = false;
            while (!done) {
                const status = await connection.getSignatureStatus(signature);
                if (status?.value?.confirmationStatus === 'confirmed') {
                    done = true;
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const updatedUser = await UserService.activateSubscription({
                walletAddress: publicKey.toString(),
                durationMonths: tier.duration,
                paymentTxId: signature,
                tierType: tier.id,
                amountPaid: tier.priceUSD,
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
                className={`relative bg-white rounded-lg w-full max-w-7xl transform ${isOpen ? 'translate-y-0' : '-translate-y-8'
                    } transition-transform duration-300 shadow-xl border border-gray-200`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Content */}
                <div className="max-w-7xl mx-auto px-4 py-16">
                    {/* Header */}
                    <div className="text-center mb-12">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">
                            Unlock Premium Features
                        </h2>
                        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                            Subscribe to receive fee distribution, never pay transaction fees, earn points, and help Onstrument become the best launchpad.
                        </p>
                    </div>

                    {/* Pricing Tiers */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                        {SUBSCRIPTION_TIERS.map((tier) => (
                            <div
                                key={tier.id}
                                className={`
                                    bg-white rounded-xl p-6 border-2 shadow-sm flex flex-col justify-between
                                    ${selectedTier?.id === tier.id
                                        ? 'border-blue-500 transform scale-105 transition-all duration-200'
                                        : 'border-gray-200 hover:border-blue-200'}
                                `}
                            >
                                <div>
                                    <div className="text-center mb-6">
                                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                                        <div className="text-3xl font-bold text-blue-600 mb-2">
                                            ${tier.priceUSD}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {tier.goldenPoints} Gold Points
                                        </div>
                                    </div>

                                    <ul className="space-y-3 mb-6">
                                        {tier.features.map((feature, index) => (
                                            <li key={index} className="flex items-center text-gray-600">
                                                <svg className="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <button
                                    onClick={() => handleSubscribe(tier)}
                                    disabled={isProcessing}
                                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? 'Processing...' : publicKey ? 'Subscribe Now' : 'Connect Wallet to Subscribe'}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Additional Info */}
                    <div className="mt-12 text-center text-gray-500">
                        <p>All subscriptions include unlimited access to premium features.</p>
                        <p>Gold Points will be used for calculating your airdrop.</p>
                    </div>
                </div>
            </div>
        </div>
    );
} 