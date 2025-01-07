import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { TradingInterface } from '../Trading/TradingInterface';
import { PriceChart } from '../Trading/PriceChart';
import { useEffect, useState, useRef } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { tokenService } from '../../services/tokenService';
import { priceClient } from '../../services/priceClient';
import { TradingViewChart } from '../Trading/TradingViewChart';
import { formatMarketCap, formatNumber } from '../../utils/formatting';
import { API_BASE_URL } from '../../config';

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
    const navigate = useNavigate();
    const [topTokens, setTopTokens] = useState<TokenRecord[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Add useRef and useEffect for click-outside handling
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    // Fetch top tokens by 24h volume
    useEffect(() => {
        const fetchTopTokens = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/market/tokens?sortBy=volume24h&limit=100`);
                const data = await response.json();
                setTopTokens(data.tokens);
            } catch (error) {
                console.error('Error fetching top tokens:', error);
            }
        };
        fetchTopTokens();
    }, []);

    // Handler for token selection
    const handleTokenChange = (newMintAddress: string) => {
        navigate(`/tokens/${newMintAddress}`);
    };

    const formatPriceWithoutTrailingZeros = (price: number) => {
        return price.toString().replace(/\.?0+$/, '');
    };

    // Add this near your chart component
    const renderTokenSelector = () => (
        <div ref={dropdownRef} className="relative inline-flex items-center">
            <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1 p-1 text-gray-300 hover:text-white transition-colors"
            >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
            </button>

            {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-[400px] bg-[#1E222D] text-white rounded-md border border-gray-700 shadow-lg z-50 max-h-[400px] overflow-hidden">
                    <div className="sticky top-0 bg-[#1E222D] grid grid-cols-[1fr_auto_auto] px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
                        <span>Token</span>
                        <span className="px-4">Price</span>
                        <span>24h Volume</span>
                    </div>
                    <div className="overflow-y-auto max-h-[360px] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                        {topTokens.map(token => (
                            <div
                                key={token.mintAddress}
                                onClick={() => {
                                    setIsDropdownOpen(false);
                                    window.location.href = `/token/${token.mintAddress}`;
                                }}
                                className="grid grid-cols-[1fr_auto_auto] px-4 py-2 hover:bg-gray-700 cursor-pointer items-center text-sm"
                            >
                                <div className="flex items-center gap-2">
                                    {token.imageUrl && (
                                        <img
                                            src={token.imageUrl}
                                            alt=""
                                            className="w-5 h-5 rounded-full"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    )}
                                    <span className="font-medium">{token.symbol}</span>
                                </div>
                                <span className="px-4 text-right tabular-nums">
                                    ${formatPriceWithoutTrailingZeros(token.currentPrice || 0)}
                                </span>
                                <span className="text-right tabular-nums">
                                    ${formatNumber(token.volume24h || 0)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    if (loading) return <div className="p-4 text-white">Loading...</div>;
    if (error) return <div className="p-4 text-white">Error: {error}</div>;
    if (!token) return <div className="p-4 text-white">Token not found</div>;

    // Get image URL from content metadata
    const imageUrl = token.content?.metadata?.image || token.imageUrl;

    return (
        <div className="p-4 text-white">
            <div className="max-w-[1920px] mx-auto">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
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
                            <h1 className="text-2xl font-bold flex items-center gap-2">
                                {token.name} ({token.symbol}) {renderTokenSelector()}
                            </h1>
                            <div className="flex gap-2 text-sm text-gray-400">
                                <span>Type: {token.tokenType}</span>
                                <span>•</span>
                                <span>Source: {token.tokenSource}</span>
                            </div>
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
