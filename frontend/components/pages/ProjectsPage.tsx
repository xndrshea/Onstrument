import { useEffect, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { TokenRecord } from '../../../shared/types/token';
import { TokenCard } from '../TokenList/TokenCard';
import { Modal } from '../Modal/Modal';
import { TokenCreationForm } from '../TokenCreation/TokenCreationForm';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Link } from 'react-router-dom';

export function ProjectsPage() {
    const { connection } = useConnection();
    const { connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [tokens, setTokens] = useState<TokenRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [volumePeriod, setVolumePeriod] = useState<'5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all' | 'marketCapUsd' | 'newest' | 'oldest'>('newest');

    const fetchTokens = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/tokens?sortBy=${volumePeriod}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            setTokens(data.tokens.map((token: any) => ({
                mintAddress: token.mintAddress,
                name: token.name,
                symbol: token.symbol,
                tokenType: 'custom',
                description: token.description,
                metadataUrl: token.metadataUri,
                curveConfig: token.curveConfig,
                createdAt: token.createdAt,
                volume: token.volume,
                supply: token.supply,
                totalSupply: token.totalSupply,
                currentPrice: token.currentPrice,
                marketCapUsd: token.marketCapUsd
            })));
        } catch (error) {
            console.error('Error fetching tokens:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch tokens');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, [connection, volumePeriod, refreshTrigger]);

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Onstrument Projects</h1>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-row gap-2">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 shadow-lg border border-blue-400"
                            >
                                Launch Meme
                            </button>

                            <Link
                                to="/create"
                                className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 shadow-lg border border-sky-400"
                            >
                                Start Project
                            </Link>

                            <Link
                                to="/contact"
                                className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-200 shadow-lg border border-cyan-400"
                            >
                                Custom Tokenomics
                            </Link>
                        </div>
                        <select
                            value={volumePeriod}
                            onChange={(e) => setVolumePeriod(e.target.value as typeof volumePeriod)}
                            className="bg-gray-100 text-gray-900 rounded-lg px-4 py-2"
                        >
                            <option value="marketCapUsd">Market Cap</option>
                            <option value="5m">5m Volume</option>
                            <option value="30m">30m Volume</option>
                            <option value="1h">1h Volume</option>
                            <option value="4h">4h Volume</option>
                            <option value="12h">12h Volume</option>
                            <option value="24h">24h Volume</option>
                            <option value="all">All Time Volume</option>
                            <option value="newest">New</option>
                            <option value="oldest">Old</option>
                        </select>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center text-gray-400 py-8">Loading tokens...</div>
                ) : error ? (
                    <div className="text-center text-red-500 py-8">
                        {error}
                        <button
                            onClick={fetchTokens}
                            className="ml-4 text-blue-400 hover:text-blue-300"
                        >
                            Retry
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tokens.map(token => (
                            <TokenCard
                                key={token.mintAddress}
                                token={token}
                                volumePeriod={volumePeriod}
                            />
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                    {!connected ? (
                        <div className="connect-wallet-prompt text-center">
                            <h2>Connect Wallet Required</h2>
                            <p>Please connect your wallet to create a token.</p>
                            <button
                                onClick={() => setVisible(true)}
                                className="bg-purple-600 hover:bg-purple-700 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                            >
                                Select Wallet
                            </button>
                        </div>
                    ) : (
                        <TokenCreationForm
                            onSuccess={() => setIsModalOpen(false)}
                            onTokenCreated={() => {
                                setRefreshTrigger(prev => prev + 1);
                                setIsModalOpen(false);
                            }}
                        />
                    )}
                </Modal>
            )}
        </div>
    );
} 