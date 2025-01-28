import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { TradingInterface } from '../Trading/TradingInterface';
import { PriceChart } from '../Trading/PriceChart';
import { useEffect, useState, useRef } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { tokenService } from '../../services/tokenService';
import { priceClient } from '../../services/priceClient';
import { formatMarketCap, formatNumber } from '../../utils/formatting';
import { filterService } from '../../services/filterService';
import { Menu, MenuButton, MenuItem, MenuItems, Transition, Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { getAuthHeaders } from '../../utils/headers';

const MAINNET_USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Updated MetricsCard component with terminal style
const MetricsCard = ({ title, value, change }: { title: string; value: string | number; change?: number }) => (
    <div className="bg-[#1E222D] border border-gray-800 p-4 rounded-lg">
        <h3 className="text-[#808591] text-sm mb-1">{title}</h3>
        <div className="flex items-end gap-2">
            <span className="text-white text-lg font-mono">{value}</span>
            {change !== undefined && (
                <span className={`text-sm font-mono ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                </span>
            )}
        </div>
    </div>
);

// Add this component inside TokenDetailsPage, after TradingInterface
const TokenInfoSection = ({ token }: { token: TokenRecord | null }) => {
    const [copySuccess, setCopySuccess] = useState(false);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000); // Reset after 2 seconds
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    if (!token) return null;

    return (
        <div className="mt-4">
            <Disclosure>
                {({ open }) => (
                    <>
                        <DisclosureButton className="flex w-full justify-between items-center px-4 py-2 bg-[#1E222D] hover:bg-[#2C3038] rounded-lg text-white">
                            <span>Token Information</span>
                            <svg
                                className={`w-5 h-5 transform ${open ? 'rotate-180' : ''} transition-transform`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </DisclosureButton>

                        <DisclosurePanel className="px-4 py-3 bg-[#1E222D] mt-1 rounded-lg">
                            <div className="space-y-3 text-sm">
                                <div>
                                    <div className="text-[#808591]">Contract Address</div>
                                    <div
                                        className="font-mono text-white break-all cursor-pointer hover:text-blue-400 flex items-center gap-2"
                                        onClick={() => copyToClipboard(token.mintAddress)}
                                    >
                                        {token.mintAddress}
                                        {copySuccess ? (
                                            <span className="text-green-500 text-xs">Copied!</span>
                                        ) : (
                                            <svg
                                                className="w-4 h-4 text-[#808591]"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                                />
                                            </svg>
                                        )}
                                    </div>
                                </div>

                                {token.websiteUrl && (
                                    <div>
                                        <div className="text-[#808591]">Website</div>
                                        <a href={token.websiteUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300">
                                            {token.websiteUrl}
                                        </a>
                                    </div>
                                )}

                                {token.twitterUrl && (
                                    <div>
                                        <div className="text-[#808591]">Twitter</div>
                                        <a href={token.twitterUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300">
                                            {token.twitterUrl}
                                        </a>
                                    </div>
                                )}

                                {token.telegramUrl && (
                                    <div>
                                        <div className="text-[#808591]">Telegram</div>
                                        <a href={token.telegramUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300">
                                            {token.telegramUrl}
                                        </a>
                                    </div>
                                )}
                            </div>
                        </DisclosurePanel>
                    </>
                )}
            </Disclosure>
        </div>
    );
};

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
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const [metadataImage, setMetadataImage] = useState<string | null>(null);

    // Add useRef and useEffect for click-outside handling
    const dropdownRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Add logging to state setters
    const setTokenWithLogging = (newToken: TokenRecord | null) => {
        setToken(newToken);
    };

    const setCurrentPriceWithLogging = (newPrice: number | null) => {
        setCurrentPrice(newPrice);
    };

    // Add new function to fetch metadata
    const fetchMetadata = async (metadataUrl: string) => {
        try {
            const response = await fetch(metadataUrl);
            const metadata = await response.json();
            if (metadata.image) {
                setMetadataImage(metadata.image);
            }
        } catch (error) {
            console.error('Error fetching metadata:', error);
        }
    };

    // Modify token details fetch to handle metadata
    useEffect(() => {
        const fetchTokenDetails = async () => {
            try {
                setLoading(true);
                if (!mintAddress) return;

                // First get token data from our database
                const tokenData = await tokenService.getByMintAddress(mintAddress, tokenType);
                setTokenWithLogging(tokenData);

                // If we're missing social/website URLs, fetch from DexScreener
                if (tokenData && (!tokenData.twitterUrl || !tokenData.telegramUrl || !tokenData.websiteUrl)) {
                    try {
                        const response = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${mintAddress}`);
                        const dexData = await response.json();

                        if (dexData.pairs && dexData.pairs.length > 0) {
                            const pair = dexData.pairs[0];

                            // Prepare update data for API (snake_case)
                            const updateData = {
                                mint_address: mintAddress,
                                twitter_url: pair.info?.socials?.find((s: any) => s.type === 'twitter')?.url || null,
                                telegram_url: pair.info?.socials?.find((s: any) => s.type === 'telegram')?.url || null,
                                website_url: pair.info?.websites?.[0]?.url || null,
                                image_url: pair.info?.imageUrl || null
                            };

                            // Update database
                            await fetch('/api/tokens/update-metadata', {
                                method: 'POST',
                                ...(await getAuthHeaders()),
                                body: JSON.stringify(updateData)
                            });

                            // Update local state with camelCase keys
                            setTokenWithLogging({
                                ...tokenData,
                                twitterUrl: updateData.twitter_url,
                                telegramUrl: updateData.telegram_url,
                                websiteUrl: updateData.website_url,
                                imageUrl: updateData.image_url
                            });
                        }
                    } catch (error) {
                        console.error('Error fetching DexScreener data:', error);
                    }
                }

                setLoading(false);
            } catch (error) {
                console.error('Error in fetchTokenDetails:', error);
                setError('Failed to fetch token details');
                setLoading(false);
            }
        };

        fetchTokenDetails();
    }, [mintAddress, tokenType]);

    // Modify the WebSocket subscription to handle both price types
    useEffect(() => {
        if (!token?.mintAddress) return;

        let cleanup: (() => void) | undefined;
        const setupSubscription = async () => {
            const network = process.env.NODE_ENV === 'production' ? 'mainnet' : 'devnet';

            // Always set the initial price from token data first
            if (token.currentPrice) {
                setCurrentPriceWithLogging(token.currentPrice);
            }

            cleanup = await priceClient.subscribeToPrice(
                token.mintAddress,
                (update) => {
                    const price = update.price;
                    setCurrentPriceWithLogging(price);
                },
                network
            );
        };

        setupSubscription();
        return () => {
            if (cleanup) cleanup();
        };
    }, [token?.mintAddress]);

    // Updated TokenSelector fetch
    useEffect(() => {
        const fetchTopTokens = async () => {
            try {
                // Build query parameters
                const params = new URLSearchParams({
                    page: '1',
                    limit: '100',
                    sortBy: sortField,
                    sortDirection: sortDirection
                });

                // If we're on a custom token page, use /api/tokens without tokenType filter
                const endpoint = (token?.tokenType === 'custom' || tokenType === 'custom')
                    ? `/api/tokens`  // For custom tokens, show all custom tokens
                    : `/api/market/tokens?${params}`; // For dex tokens, use normal filtering

                const response = await fetch(endpoint);
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
    }, [sortField, sortDirection, token?.tokenType, tokenType]);

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

    // Update position when scrolling
    useEffect(() => {
        if (!isDropdownOpen) return;

        const updatePosition = () => {
            if (buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.bottom + 4,
                    left: rect.left
                });
            }
        };

        updatePosition(); // Initial position
        window.addEventListener('scroll', updatePosition);
        return () => window.removeEventListener('scroll', updatePosition);
    }, [isDropdownOpen]);

    // Update the image URL logic
    const getImageUrl = (token: TokenRecord) => {
        if (token.tokenType === 'custom') {
            return metadataImage || token.imageUrl;
        }
        return token.imageUrl;
    };

    const renderTokenSelector = () => (
        <Menu as="div" className="relative inline-flex items-center">
            <MenuButton className="flex items-center gap-1 px-3 py-2 text-[#808591] hover:text-white bg-[#2C3038] hover:bg-[#363B44] rounded-md transition-colors">
                <span className="text-sm font-mono">Select Token</span>
                <svg className="w-5 h-5 fill-current transition-transform" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
            </MenuButton>

            <MenuItems
                className="w-[400px] bg-[#1E222D] border border-gray-800 rounded-md shadow-lg max-h-[400px] overflow-hidden z-[9999]"
                anchor="bottom start"
            >
                <div className="sticky top-0 bg-[#2C3038] grid grid-cols-[2fr_1.2fr_1.2fr] px-4 py-2 text-xs text-[#808591] border-b border-gray-800">
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

                <div className="overflow-y-auto max-h-[360px] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-[#1E222D]">
                    {sortTokens(topTokens).map(token => (
                        <MenuItem
                            key={token.mintAddress}
                            as="div"
                            onClick={() => {
                                navigate(`/token/${token.mintAddress}`, {
                                    state: { tokenType: token.tokenType || 'dex' }
                                });
                            }}
                            className="grid grid-cols-[2fr_1.2fr_1.2fr] px-4 py-2 cursor-pointer items-center text-sm font-mono hover:bg-[#2C3038]"
                        >
                            <div className="flex items-center gap-2">
                                {(token.tokenType === 'custom' ? metadataImage : token.imageUrl) && (
                                    <img
                                        src={token.tokenType === 'custom' ? metadataImage! : token.imageUrl!}
                                        alt=""
                                        className="w-5 h- rounded-full"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                )}
                                <span className="font-medium">{token.symbol}</span>
                            </div>
                            <div className="text-left">
                                {formatMarketCap(token.marketCapUsd || null)}
                            </div>
                            <div className="text-right">
                                ${formatNumber(token.volume24h || 0)}
                            </div>
                        </MenuItem>
                    ))}
                </div>
            </MenuItems>
        </Menu>
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

    if (loading) return <div className="p-4 text-[#808591] font-mono">Loading...</div>;
    if (error) return <div className="p-4 text-red-500 font-mono">Error: {error}</div>;
    if (!token) return <div className="p-4 text-[#808591] font-mono">Token not found</div>;

    return (
        <div className="flex flex-col flex-1 bg-[#131722] text-white overflow-x-hidden">
            <div className="max-w-[1920px] mx-auto w-full p-4 space-y-4">
                {/* Top section with chart and trading interface */}
                <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4 overflow-x-hidden">
                    {/* Left column */}
                    <div className="space-y-4 overflow-x-hidden">
                        {/* Token header */}
                        <div className="bg-[#1E222D] border border-gray-800 rounded-lg p-3 overflow-x-hidden">
                            <div className="flex flex-col">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        {getImageUrl(token) && (
                                            <img
                                                src={getImageUrl(token)}
                                                alt={token.name}
                                                className="w-10 h-10 rounded-full object-cover mr-3"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        )}
                                        <h1 className="text-lg font-mono truncate">{token.symbol}</h1>
                                    </div>
                                    {renderTokenSelector()}
                                </div>
                                <div className="mt-1 text-sm text-[#808591] font-mono truncate">
                                    {token.name}
                                </div>
                            </div>
                        </div>

                        {/* Metrics cards */}
                        <div className="bg-[#1E222D] border border-gray-800 rounded-lg p-4">
                            <div className="grid grid-cols-2 gap-4">
                                <MetricsCard
                                    title="Market Cap (USD)"
                                    value={token.marketCapUsd ? `${formatMarketCap(token.marketCapUsd)}` : 'N/A'}
                                />
                                <MetricsCard
                                    title="Price (USD)"
                                    value={currentPrice ? `$${currentPrice.toFixed(6)}` : 'N/A'}
                                    change={token.priceChange24h}
                                />
                            </div>
                        </div>
                        <TradingInterface token={token} currentPrice={currentPrice} />
                        <TokenInfoSection token={token} />
                    </div>

                    {/* Chart section */}
                    <div className="bg-[#1E222D] border border-gray-800 rounded-lg p-4 h-[600px]">
                        <PriceChart
                            token={token}
                            width={windowDimensions.width > 1024 ? windowDimensions.width - 450 : windowDimensions.width - 48}
                            height={552}
                            currentPrice={currentPrice || undefined}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
