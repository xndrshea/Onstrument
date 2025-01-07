import { useParams, useLocation } from 'react-router-dom';
import { TradingInterface } from '../Trading/TradingInterface';
import { PriceChart } from '../Trading/PriceChart';
import { useEffect, useState } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { tokenService } from '../../services/tokenService';
import { priceClient } from '../../services/priceClient';
import { TradingViewChart } from '../Trading/TradingViewChart';
import { formatMarketCap, formatNumber } from '../../utils/formatting';

// Add at the top with other imports
type VolumeKey = `volume${string}`;
type TokenKey = keyof TokenRecord;

// New component for metrics display
const MetricsCard = ({ title, value, change }: { title: string; value: string | number; change?: number }) => (
    <div className="bg-[#232427] p-4 rounded-lg">
        <h3 className="text-gray-400 text-sm mb-1">{title}</h3>
        <div className="flex items-end gap-2">
            <span className="text-white text-lg font-semibold">{value}</span>
            {change !== undefined && (
                <span className={`text-sm ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                </span>
            )}
        </div>
    </div>
);

export function TokenDetailsPage() {
    const { mintAddress } = useParams();
    const location = useLocation();
    const tokenType = location.state?.tokenType || 'dex';
    const [token, setToken] = useState<TokenRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTokenInfoExpanded, setIsTokenInfoExpanded] = useState(false);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);

    // Single WebSocket subscription - only for custom tokens
    useEffect(() => {
        if (!token?.mintAddress || token.tokenType === 'dex') return;

        // Fetch initial price
        priceClient.getLatestPrice(token.mintAddress)
            .then(price => {
                if (price !== null) {
                    console.log('Initial price loaded:', price);
                    setCurrentPrice(price);
                }
            })
            .catch(error => console.error('Error fetching initial price:', error));

        // Setup WebSocket subscription only for custom tokens
        let cleanup: (() => void) | undefined;
        const setupSubscription = async () => {
            cleanup = await priceClient.subscribeToPrice(
                token.mintAddress,
                (update) => {
                    console.log('Price update received:', update);
                    setCurrentPrice(update.price);
                },
                'devnet'  // Custom tokens are always on devnet
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

                // Use TokenService instead of direct fetch
                if (!mintAddress) return;
                const tokenData = await tokenService.getByMintAddress(mintAddress, tokenType);
                console.log('Transformed token data:', tokenData);

                setToken(tokenData);
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
                    <div>
                        <h1 className="text-2xl font-bold">{token.name} ({token.symbol})</h1>
                        <div className="flex gap-2 text-sm text-gray-400">
                            <span>Type: {token.tokenType}</span>
                            <span>•</span>
                            <span>Source: {token.tokenSource}</span>
                        </div>
                    </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <MetricsCard
                        title="Market Cap"
                        value={token.marketCap ? formatMarketCap(token.marketCap) : 'N/A'}
                    />
                    <MetricsCard
                        title="Current Price"
                        value={`$${Number(token.currentPrice)?.toFixed(6) || 'N/A'}`}
                        change={token.priceChange24h}
                    />
                    <MetricsCard
                        title="24h Volume"
                        value={formatNumber(token.volume24h || 0)}
                    />
                    <MetricsCard
                        title="TVL"
                        value={formatMarketCap(token.tvl || 0)}
                    />
                </div>

                {/* Main content grid */}
                <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                    {/* Trading interface */}
                    <div className="bg-[#232427] rounded-lg p-4">
                        <TradingInterface token={token} currentPrice={currentPrice} />

                        {/* Token Info Section */}
                        <div className="mt-4">
                            <button
                                className="w-full text-left text-gray-400 hover:text-white transition-colors"
                                onClick={() => setIsTokenInfoExpanded(!isTokenInfoExpanded)}
                            >
                                <div className="flex items-center justify-between">
                                    <span>Token Information</span>
                                    <span>{isTokenInfoExpanded ? '−' : '+'}</span>
                                </div>
                            </button>

                            {isTokenInfoExpanded && (
                                <div className="mt-4 space-y-3 text-sm">
                                    <div>
                                        <div className="text-gray-400">Mint Address</div>
                                        <div className="break-all">{token.mintAddress}</div>
                                    </div>
                                    {token.decimals !== undefined && (
                                        <div>
                                            <div className="text-gray-400">Decimals</div>
                                            <div>{token.decimals}</div>
                                        </div>
                                    )}
                                    {token.totalSupply && (
                                        <div>
                                            <div className="text-gray-400">Total Supply</div>
                                            <div>{formatNumber(token.totalSupply)}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Charts and data section */}
                    <div className="space-y-6">
                        {/* Price chart section - existing code */}
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Price Chart</h2>
                            <PriceChart
                                token={token}
                                width={window.innerWidth > 1024 ? window.innerWidth - 500 : window.innerWidth - 48}
                                height={400}
                                currentPrice={currentPrice || undefined}
                            />
                        </div>

                        {/* Volume Metrics */}
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Volume Metrics</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {['5m', '1h', '6h', '24h'].map(period => (
                                    <div key={period} className="p-3 bg-gray-800 rounded-lg">
                                        <h3 className="text-gray-400 text-sm">{period} Volume</h3>
                                        <p className="text-white font-semibold">
                                            ${formatNumber(Number(token[`volume${period}` as TokenKey]) || 0)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Transaction Metrics */}
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Transaction Metrics</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {['5m', '1h', '6h', '24h'].map(period => (
                                    <div key={period} className="p-4 bg-gray-800 rounded-lg">
                                        <h3 className="text-gray-400 mb-2">{period} Transactions</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <p className="text-sm text-gray-400">Buys</p>
                                                <p className="text-white">
                                                    {(token[`tx${period}Buys` as TokenKey] as number) || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-400">Sells</p>
                                                <p className="text-white">
                                                    {(token[`tx${period}Sells` as TokenKey] as number) || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-400">Buyers</p>
                                                <p className="text-white">
                                                    {(token[`tx${period}Buyers` as TokenKey] as number) || 0}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-400">Sellers</p>
                                                <p className="text-white">
                                                    {(token[`tx${period}Sellers` as TokenKey] as number) || 0}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Price Changes */}
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Price Changes</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {['5m', '1h', '6h', '24h', '7d', '30d'].map(period => (
                                    <div key={period} className="p-3 bg-gray-800 rounded-lg">
                                        <h3 className="text-gray-400 text-sm">{period}</h3>
                                        <p className={`font-semibold ${(token[`priceChange${period}` as TokenKey] as number) >= 0
                                            ? 'text-green-400'
                                            : 'text-red-400'
                                            }`}>
                                            {((token[`priceChange${period}` as TokenKey] as number) || 0).toFixed(2)}%
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
