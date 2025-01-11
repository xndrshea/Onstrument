import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { TradingInterface } from '../Trading/TradingInterface';
import { PriceChart } from '../Trading/PriceChart';
import { useEffect, useState, useRef } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { tokenService } from '../../services/tokenService';
import { priceClient } from '../../services/priceClient';
import { formatMarketCap, formatNumber } from '../../utils/formatting';
import { API_BASE_URL } from '../../config';
import { filterService } from '../../services/filterService';

// Add at the top with other imports
type VolumeKey = `volume${string}`;
type TokenKey = keyof TokenRecord;
const MAINNET_USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// New component for metrics display
const MetricsCard = ({ title, value, change }: { title: string; value: string | number; change?: number }) => (
    <div className="bg-[#232427] p-4 rounded-lg">
        <h3 className="text-gray-400 text-sm mb-1">{title}</h3>
        <div className="flex items-end gap-2">
            <span className="text-white text-lg font-semibold">
                {typeof value === 'number' ? value.toFixed(4) : value}
            </span>
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
    const [sortField, setSortField] = useState<'marketCapUsd' | 'volume24h'>('volume24h');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [windowDimensions, setWindowDimensions] = useState({
        width: window.innerWidth,
        height: window.innerHeight
    });

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

    // Modify the WebSocket subscription to handle both price types
    useEffect(() => {
        if (!token?.mintAddress) return;

        let cleanup: (() => void) | undefined;
        const setupSubscription = async () => {
            // For dex tokens and migrated custom tokens, use current_price from database
            if (token.tokenType === 'dex' || (token.tokenType === 'custom' && token.tokenSource === 'migrated')) {
                setCurrentPrice(token.currentPrice || null);
                updateTokenWithPrice(token.currentPrice || 0);
                return;
            }

            // For custom tokens, get initial price from price history
            try {
                const history = await priceClient.getPriceHistory(token.mintAddress);
                if (history?.length) {
                    const lastPrice = history[history.length - 1].close;
                    setCurrentPrice(lastPrice);
                    updateTokenWithPrice(lastPrice);
                }
            } catch (error) {
                console.error('Error fetching initial price:', error);
            }

            // Set up WebSocket subscription for real-time updates
            cleanup = await priceClient.subscribeToPrice(
                token.mintAddress,
                (update) => {
                    const price = update.price;
                    setCurrentPrice(price);
                    updateTokenWithPrice(price);
                },
                token.tokenType === 'custom' ? 'devnet' : 'mainnet'
            );
        };

        const updateTokenWithPrice = (price: number) => {
            if (token?.supply && token.decimals !== undefined) {
                const adjustedSupply = token.supply / Math.pow(10, token.decimals);
                const newMarketCap = price * adjustedSupply;
                setToken(prevToken => prevToken ? {
                    ...prevToken,
                    currentPrice: price,
                    marketCapUsd: newMarketCap
                } : null);
            }
        };

        setupSubscription();
        return () => {
            if (cleanup) cleanup();
        };
    }, [token?.mintAddress]);

    useEffect(() => {
        const fetchTokenDetails = async () => {
            try {
                setLoading(true);

                // Use TokenService instead of direct fetch
                if (!mintAddress) return;
                const tokenData = await tokenService.getByMintAddress(mintAddress, tokenType);

                // Simple full data log
                console.log('Full Token Data:', tokenData);

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

    // Updated TokenSelector fetch
    useEffect(() => {
        const fetchTopTokens = async () => {
            try {
                const url = new URL(`${API_BASE_URL}/market/tokens`);
                url.searchParams.append('page', '1');
                url.searchParams.append('limit', '100');
                url.searchParams.append('sortBy', sortField);
                url.searchParams.append('sortDirection', sortDirection);

                const response = await fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const filteredTokens = filterService.filterTokens(data.tokens);
                setTopTokens(filteredTokens);
            } catch (error) {
                console.error('Error fetching top tokens:', error);
            }
        };
        fetchTopTokens();
    }, [sortField, sortDirection]);

    // Update the sorting function
    const sortTokens = (tokens: TokenRecord[]) => {
        // Filter out fake USDC tokens and tokens without images
        const filteredTokens = tokens.filter(token =>
            // Keep token if it's not a fake USDC AND has an image
            !(token.symbol === 'USDC' && token.mintAddress !== MAINNET_USDC_ADDRESS) &&
            (token.imageUrl || (token.content?.metadata?.image))
        );

        const getFieldValue = (token: TokenRecord) => {
            return sortField === 'marketCapUsd' ? token.marketCapUsd : token[sortField];
        };

        return filteredTokens.sort((a, b) => {
            const aValue = getFieldValue(a) || 0;
            const bValue = getFieldValue(b) || 0;
            return sortDirection === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);
        });
    };

    // Update the dropdown header section
    const renderTokenSelector = () => (
        <div ref={dropdownRef} className="relative inline-flex items-center">
            <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1 px-2 py-1 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
            >
                <span className="text-sm">Select Token</span>
                <svg
                    className={`w-5 h-5 fill-current transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                >
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
            </button>

            {isDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-[400px] bg-[#1E222D] text-white rounded-md border border-gray-700 shadow-lg z-50 max-h-[400px] overflow-hidden">
                    <div className="sticky top-0 bg-[#1E222D] grid grid-cols-[2fr_1.2fr_1.2fr] px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
                        <span>Token</span>
                        <button
                            onClick={() => {
                                if (sortField === 'marketCapUsd') {
                                    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                } else {
                                    setSortField('marketCapUsd');
                                    setSortDirection('desc');
                                }
                            }}
                            className="text-left hover:text-white w-full"
                        >
                            Market Cap
                            {sortField === 'marketCapUsd' && (
                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                        </button>
                        <button
                            onClick={() => {
                                if (sortField === 'volume24h') {
                                    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                } else {
                                    setSortField('volume24h');
                                    setSortDirection('desc');
                                }
                            }}
                            className="text-right hover:text-white w-full"
                        >
                            24h Volume
                            {sortField === 'volume24h' && (
                                <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                        </button>
                    </div>
                    <div className="overflow-y-auto max-h-[360px] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                        {topTokens.map(token => (
                            <div
                                key={token.mintAddress}
                                onClick={() => {
                                    setIsDropdownOpen(false);
                                    window.location.href = `/token/${token.mintAddress}`;
                                }}
                                className="grid grid-cols-[2fr_1.2fr_1.2fr] px-4 py-2 hover:bg-gray-700 cursor-pointer items-center text-sm"
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
                                <div className="text-left w-full">
                                    {formatMarketCap(token.marketCapUsd || null)}
                                </div>
                                <div className="text-right w-full">
                                    ${formatNumber(token.volume24h || 0)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    // Add this useEffect for window resize handling
    useEffect(() => {
        const handleResize = () => {
            setWindowDimensions({
                width: window.innerWidth,
                height: window.innerHeight
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

                {/* Main content grid */}
                <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                    {/* Trading interface column */}
                    <div className="space-y-4">
                        {/* Key Metrics Card */}
                        <div className="bg-[#232427] rounded-lg p-4">
                            <div className="grid grid-cols-2 gap-4">
                                <MetricsCard
                                    title="Market Cap"
                                    value={token.marketCapUsd ? formatMarketCap(token.marketCapUsd) : 'N/A'}
                                />
                                <MetricsCard
                                    title="Current Price"
                                    value={currentPrice ? `$${currentPrice.toFixed(4)}` : 'N/A'}
                                    change={token.priceChange24h}
                                />
                            </div>
                        </div>

                        {/* Trading interface */}
                        <div className="bg-[#232427] rounded-lg p-4">
                            <TradingInterface token={token} currentPrice={currentPrice} />
                        </div>

                        {/* Volume Metrics */}
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Volume Metrics</h2>
                            <div className="grid grid-cols-2 gap-4">
                                {['5m', '1h', '6h', '24h'].map(period => {
                                    const volumeKey = `volume${period}` as TokenKey;
                                    const volumeValue = Number(token[volumeKey]) || 0;

                                    // Skip rendering if volume is 0 or null
                                    if (!volumeValue) return null;

                                    return (
                                        <div key={period} className="p-3 bg-gray-800 rounded-lg">
                                            <h3 className="text-gray-400 text-sm">{period} Volume</h3>
                                            <p className="text-white font-semibold">
                                                ${formatNumber(volumeValue)}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Token Info Section */}
                        <div className="bg-[#232427] rounded-lg p-4">
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

                    {/* Charts section */}
                    <div className="space-y-6">
                        <div className="bg-[#232427] rounded-lg p-4">
                            <PriceChart
                                token={token}
                                width={windowDimensions.width > 1024 ? windowDimensions.width - 500 : windowDimensions.width - 48}
                                height={600}
                                currentPrice={currentPrice || undefined}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
