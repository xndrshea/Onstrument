import { useParams, useLocation } from 'react-router-dom';
import { TradingInterface } from '../Trading/TradingInterface';
import { PriceChart } from '../Trading/PriceChart';
import { useEffect, useState } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { tokenService } from '../../services/tokenService';
import { priceClient } from '../../services/priceClient';
import { TradingViewChart } from '../Trading/TradingViewChart';
import { formatMarketCap } from '../../utils/formatting';

export function TokenDetailsPage() {
    const { mintAddress } = useParams();
    const location = useLocation();
    const tokenType = location.state?.tokenType || 'pool';
    const [token, setToken] = useState<TokenRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTokenInfoExpanded, setIsTokenInfoExpanded] = useState(false);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);

    // Single WebSocket subscription
    useEffect(() => {
        if (!token?.mintAddress) return;

        // Fetch initial price
        priceClient.getLatestPrice(token.mintAddress)
            .then(price => {
                if (price !== null) {
                    console.log('Initial price loaded:', price);
                    setCurrentPrice(price);
                }
            })
            .catch(error => console.error('Error fetching initial price:', error));

        // Setup WebSocket subscription
        let cleanup: (() => void) | undefined;
        const setupSubscription = async () => {
            cleanup = await priceClient.subscribeToPrice(
                token.mintAddress,
                (update) => {
                    console.log('Price update received:', update);
                    setCurrentPrice(update.price);
                },
                token.tokenType === 'pool' ? 'mainnet' : 'devnet'
            );
        };

        setupSubscription();

        return () => {
            if (cleanup) cleanup();
        };
    }, [token?.mintAddress, token?.tokenType]);

    useEffect(() => {
        const fetchTokenDetails = async () => {
            try {
                setLoading(true);
                console.log(`Fetching token details for mintAddress: ${mintAddress} type: ${tokenType}`);

                const response = await fetch(`/api/tokens/${mintAddress}`);
                const data = await response.json();

                // Add debug logging
                console.log('Raw API response:', data);

                setToken(data);
                setLoading(false);
            } catch (error) {
                console.error('Error fetching token details:', error);
                setError('Failed to fetch token details');
                setLoading(false);
            }
        };

        if (mintAddress) {
            fetchTokenDetails();
        }
    }, [mintAddress, tokenType]);

    if (loading) return <div className="p-4 text-white">Loading...</div>;
    if (error) return <div className="p-4 text-white">Error: {error}</div>;
    if (!token) return <div className="p-4 text-white">Token not found</div>;

    // Get image URL from content metadata
    const imageUrl = token.content?.metadata?.image || token.imageUrl;

    return (
        <div className="p-4 text-white">
            <div className="max-w-[1920px] mx-auto">
                <div className="flex items-center gap-4 mb-4">
                    {imageUrl && (
                        <img
                            src={imageUrl}
                            alt={token.name}
                            className="w-16 h-16 rounded-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                    <h1 className="text-2xl font-bold">{token.name} ({token.symbol})</h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                    <div className="bg-[#232427] rounded-lg p-4">
                        <TradingInterface token={token} currentPrice={currentPrice} />
                    </div>

                    <div className="space-y-6">
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Price Chart</h2>
                            <PriceChart
                                token={token}
                                width={window.innerWidth > 1024 ? window.innerWidth - 500 : window.innerWidth - 48}
                                height={400}
                                currentPrice={currentPrice || undefined}
                            />
                        </div>

                        <div className="bg-[#232427] rounded-lg p-4 hover:bg-[#2a2b2f] transition-colors duration-200">
                            <button
                                onClick={() => setIsTokenInfoExpanded(!isTokenInfoExpanded)}
                                className="w-full flex justify-between items-center text-xl font-medium text-gray-200 hover:text-white transition-colors duration-200"
                            >
                                <div className="flex items-center gap-2">
                                    <span>Token Info</span>
                                    <span className="text-sm text-gray-400 font-normal">Click to {isTokenInfoExpanded ? 'collapse' : 'expand'}</span>
                                </div>
                                <span className="text-2xl text-gray-400 hover:text-white transition-colors duration-200">
                                    {isTokenInfoExpanded ? '−' : '+'}
                                </span>
                            </button>

                            {isTokenInfoExpanded && (
                                <div className="grid grid-cols-2 gap-4 mt-4 text-gray-300">
                                    <div className="space-y-3">
                                        <p>Name: <span className="text-white">{token.name}</span></p>
                                        <p>Symbol: <span className="text-white">{token.symbol}</span></p>
                                        <p>Description: <span className="text-white">{token.description || 'No description available'}</span></p>
                                        <p>Total Supply: <span className="text-white">{Number(token.totalSupply) / (10 ** token.decimals)} {token.symbol}</span></p>
                                        <p>Decimals: <span className="text-white">{token.decimals}</span></p>
                                        <p>Token Type: <span className="text-white">{token.tokenType}</span></p>
                                        <p>Verified: <span className="text-white">{token.verified ? 'Yes' : 'No'}</span></p>
                                        {token.websiteUrl && (
                                            <p>Website: <a href={token.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{token.websiteUrl}</a></p>
                                        )}
                                        {token.docsUrl && (
                                            <p>Documentation: <a href={token.docsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{token.docsUrl}</a></p>
                                        )}
                                        {token.twitterUrl && (
                                            <p>Twitter: <a href={token.twitterUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{token.twitterUrl}</a></p>
                                        )}
                                        {token.telegramUrl && (
                                            <p>Telegram: <a href={token.telegramUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">{token.telegramUrl}</a></p>
                                        )}
                                        {token.tokenVault && (
                                            <p>Token Vault: <span className="text-white">{token.tokenVault}</span></p>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <p>Mint Address: <span className="text-white">{token.mintAddress}</span></p>
                                        {token.curveAddress && (
                                            <p>Curve Address: <span className="text-white">{token.curveAddress}</span></p>
                                        )}
                                        {token.content?.metadata?.collection?.name && (
                                            <p>Collection: <span className="text-white">{token.content.metadata.collection.name}</span></p>
                                        )}
                                        {token.metadataUri && (
                                            <p>Metadata URI: <span className="text-white">{token.metadataUri}</span></p>
                                        )}
                                        <p>Created: <span className="text-white">{new Date(token.createdAt).toLocaleString()}</span></p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Trading View</h2>
                            <TradingViewChart
                                token={token}
                                width={window.innerWidth > 1024 ? window.innerWidth - 500 : window.innerWidth - 48}
                                height={400}
                                currentPrice={currentPrice || undefined}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
