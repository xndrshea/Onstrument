import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { TokenCreationForm } from '../TokenCreation/TokenCreationForm';
import { useState, useEffect } from 'react';
import { Dialog, DialogPanel } from '@headlessui/react';
import { TokenCard } from '../TokenList/TokenCard';
import { TokenRecord } from '../../../shared/types/token';
import { priceClient } from '../../services/priceClient';
import { getCsrfHeaders } from '../../utils/headers';

export function LandingPage() {
    const { connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [showQuickForm, setShowQuickForm] = useState(false);
    const [pendingAction, setPendingAction] = useState<'quickForm' | null>(null);
    const [recentProjects, setRecentProjects] = useState([]);
    const [tokens, setTokens] = useState<TokenRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [volumePeriod, setVolumePeriod] = useState<
        '5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all' |
        'marketCapUsd' | 'newest' | 'oldest'
    >('newest');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 100;

    const handleQuickStart = () => {
        if (!connected) {
            setPendingAction('quickForm');
            setVisible(true);
        } else {
            setShowQuickForm(true);
        }
    };

    useEffect(() => {
        if (connected && pendingAction === 'quickForm') {
            setShowQuickForm(true);
            setPendingAction(null);
        }
    }, [connected, pendingAction]);

    const fetchTokens = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(
                `/api/tokens?sortBy=${volumePeriod}&page=${currentPage}&limit=${ITEMS_PER_PAGE}`
            );

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            setTotalPages(Math.ceil(data.total / ITEMS_PER_PAGE));

            // Map directly from API response
            setTokens(data.tokens.map((token: any) => ({
                mintAddress: token.mintAddress,
                name: token.name,
                symbol: token.symbol,
                tokenType: 'custom',
                description: token.description,
                metadataUrl: token.metadataUri,
                curveConfig: token.curveConfig,
                createdAt: token.createdAt,
                volume: token.volume, // Now comes directly from API
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
        void fetchTokens();

        if (volumePeriod === 'newest' && currentPage === 1) {
            const handleCreation = async (creation: any) => {
                try {
                    const response = await fetch(`/api/tokens/${creation.mintAddress}`, {
                        headers: await getCsrfHeaders()
                    });
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const tokenData = await response.json();

                    const newToken: TokenRecord = {
                        mintAddress: creation.mintAddress,
                        name: tokenData.name,
                        symbol: tokenData.symbol,
                        tokenType: 'custom',
                        description: tokenData.description,
                        metadataUrl: tokenData.metadata_url,
                        curveConfig: tokenData.curve_config,
                        createdAt: tokenData.created_at || creation.timestamp,
                        volume24h: tokenData.volume_24h || 0,
                        supply: tokenData.supply,
                        currentPrice: tokenData.current_price,
                        marketCapUsd: tokenData.market_cap_usd || 0
                    };

                    setTokens(prev => [newToken, ...prev]);
                } catch (error) {
                    console.error('Error fetching new token data:', error);
                }
            };

            const unsubscribe = priceClient.wsClient.subscribeToCreations(handleCreation);
            return () => {
                unsubscribe();
            };
        }
        return undefined;
    }, [volumePeriod, currentPage]);

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="min-h-screen bg-white">
            <div className="mx-auto py-16">
                {/* Hero Section - centered */}
                <div className="max-w-7xl mx-auto px-4 mb-16 text-center">
                    <h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-violet-500 mb-6">
                        For The Frequent Traders
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
                        Subscribe, earn, trade.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4">
                        <div className="flex flex-col items-center">
                            <button
                                onClick={handleQuickStart}
                                className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-8 py-3.5 text-lg font-medium transition-colors duration-200 shadow-lg border border-blue-400"
                            >
                                Launch Meme
                            </button>
                            <span className="text-sm text-gray-500 italic mt-2">in seconds</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <Link
                                to="/create"
                                className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-8 py-3.5 text-lg font-medium transition-colors duration-200 shadow-lg border border-sky-400"
                            >
                                Start Project
                            </Link>
                            <span className="text-sm text-gray-500 italic mt-2">in minutes</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <Link
                                to="/contact"
                                className="inline-flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg px-8 py-3.5 text-lg font-medium transition-colors duration-200 shadow-lg border border-cyan-400"
                            >
                                Custom Tokenomics
                            </Link>
                            <span className="text-sm text-gray-500 italic mt-2">in days to weeks</span>
                        </div>
                    </div>
                </div>

                {showQuickForm && (
                    <Dialog open={showQuickForm} onClose={() => setShowQuickForm(false)} className="relative z-50">
                        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
                        <div className="fixed inset-0 flex items-center justify-center p-4">
                            <DialogPanel className="bg-white rounded-lg p-6 w-full max-w-xl">
                                <TokenCreationForm />
                            </DialogPanel>
                        </div>
                    </Dialog>
                )}

                {/* Projects Section */}
                <div className="mb-8">
                    <div>
                        <div className="flex justify-between items-center mb-12 px-4">
                            <h2 className="text-3xl font-bold text-gray-900">Onstrument</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-sm">Sort by:</span>
                                <select
                                    value={volumePeriod}
                                    onChange={(e) => setVolumePeriod(e.target.value as typeof volumePeriod)}
                                    className="bg-gray-100 text-gray-900 rounded-lg px-4 py-2"
                                >
                                    <option value="marketCapUsd">Market Cap</option>
                                    <option value="volume24h">24h Volume</option>
                                    <option value="volume1h">1h Volume</option>
                                    <option value="volume5m">5m Volume</option>
                                    <option value="newest">Newest</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-4">
                            {tokens
                                .filter((token, index, self) =>
                                    // Ensure uniqueness by mint address and add index as fallback
                                    index === self.findIndex((t) => t.mintAddress === token.mintAddress)
                                )
                                .map((token, index) => (
                                    <TokenCard
                                        key={`${token.mintAddress}-${index}`}
                                        token={token}
                                        volumePeriod={volumePeriod}
                                    />
                                ))}
                        </div>
                    </div>
                </div>

                {/* Pagination */}
                {!isLoading && !error && totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-8">
                        <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className={`px-4 py-2 rounded-lg ${currentPage === 1
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                        >
                            Previous
                        </button>

                        <span className="text-gray-600">
                            Page {currentPage} of {totalPages}
                        </span>

                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className={`px-4 py-2 rounded-lg ${currentPage === totalPages
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                        >
                            Next
                        </button>
                    </div>
                )}

                {/* CTA Section */}
                <div className="max-w-7xl mx-auto px-4">
                    <div className="text-center p-12">
                        <Link
                            to="/create"
                            className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-8 py-3 text-lg font-medium transition-colors duration-200 shadow-lg border border-sky-400"
                        >
                            Start Building
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
} 