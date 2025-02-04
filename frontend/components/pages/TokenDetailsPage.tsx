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
import { getAuthHeaders, getCsrfHeaders } from '../../utils/headers';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '../../hooks/useAuthQuery';

const MAINNET_USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Updated MetricsCard component with terminal style
const MetricsCard = ({ title, value, change }: { title: string; value: string; change?: number }) => {
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-sm text-gray-600 mb-1">{title}</div>
            <div className="flex items-center gap-2">
                <div className="text-lg font-mono text-gray-900">{value}</div>
                {change !== undefined && (
                    <span className={`text-sm ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                )}
            </div>
        </div>
    );
};

// Add this component inside TokenDetailsPage, after TradingInterface
const TokenInfoSection = ({ token }: { token: TokenRecord | null }) => {
    const [copySuccess, setCopySuccess] = useState(false);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
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
                        <DisclosureButton className="flex w-full justify-between items-center px-4 py-2 bg-white hover:bg-gray-50 rounded-lg text-gray-900 border border-gray-200">
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

                        <DisclosurePanel className="px-4 py-3 bg-white mt-1 rounded-lg border border-gray-200">
                            <div className="space-y-3 text-sm">
                                <div>
                                    <div className="text-gray-600">Contract Address</div>
                                    <div
                                        className="font-mono text-gray-900 break-all cursor-pointer hover:text-blue-500 flex items-center gap-2"
                                        onClick={() => copyToClipboard(token.mintAddress)}
                                    >
                                        {token.mintAddress}
                                        {copySuccess ? (
                                            <span className="text-green-500 text-xs">Copied!</span>
                                        ) : (
                                            <svg
                                                className="w-4 h-4 text-gray-400"
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
                                        <div className="text-gray-600">Website</div>
                                        <a href={token.websiteUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-blue-500 hover:text-blue-600">
                                            {token.websiteUrl}
                                        </a>
                                    </div>
                                )}

                                {token.twitterUrl && (
                                    <div>
                                        <div className="text-gray-600">Twitter</div>
                                        <a href={token.twitterUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-blue-500 hover:text-blue-600">
                                            {token.twitterUrl}
                                        </a>
                                    </div>
                                )}

                                {token.telegramUrl && (
                                    <div>
                                        <div className="text-gray-600">Telegram</div>
                                        <a href={token.telegramUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-blue-500 hover:text-blue-600">
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

const ProjectInfoSection = ({ token }: { token: TokenRecord | null }) => {
    if (!token) return null;

    return (
        <div className="mt-4">
            <Disclosure>
                {({ open }) => (
                    <>
                        <DisclosureButton className="flex w-full justify-between items-center px-4 py-2 bg-white hover:bg-gray-50 rounded-lg text-gray-900 border border-gray-200">
                            <span>Project Information</span>
                            <svg
                                className={`w-5 h-5 transform ${open ? 'rotate-180' : ''} transition-transform`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </DisclosureButton>

                        <DisclosurePanel className="px-4 py-3 bg-white mt-1 rounded-lg border border-gray-200">
                            <div className="space-y-4">
                                {token.projectCategory && (
                                    <div>
                                        <div className="text-gray-600">Category</div>
                                        <div className="text-gray-900 capitalize">{token.projectCategory}</div>
                                    </div>
                                )}

                                {!token.isAnonymous && token.teamMembers && token.teamMembers.length > 0 && (
                                    <div>
                                        <div className="text-gray-600 mb-2">Team Members</div>
                                        <div className="space-y-2">
                                            {token.teamMembers.map((member, index) => (
                                                <div key={index} className="bg-gray-50 p-3 rounded-lg">
                                                    <div className="font-medium">{member.name}</div>
                                                    <div className="text-gray-600 text-sm">{member.role}</div>
                                                    {member.social && (
                                                        <a href={member.social} target="_blank" rel="noopener noreferrer"
                                                            className="text-blue-500 text-sm hover:text-blue-600">
                                                            Social Link
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {token.projectTitle && (
                                    <div>
                                        <div className="text-gray-600">Project Title</div>
                                        <div className="text-gray-900">{token.projectTitle}</div>
                                    </div>
                                )}

                                {token.projectDescription && (
                                    <div>
                                        <div className="text-gray-600">Project Description</div>
                                        <div className="text-gray-900">{token.projectDescription}</div>
                                    </div>
                                )}

                                {token.projectStory && (
                                    <div>
                                        <div className="text-gray-600">Project Story</div>
                                        <div className="text-gray-900 whitespace-pre-wrap">{token.projectStory}</div>
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

const FavoriteButton = ({ token, isFavorited, onToggle }: { token: TokenRecord; isFavorited: boolean; onToggle: () => void }) => {
    return (
        <button
            onClick={onToggle}
            className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-yellow-500 transition-colors text-sm"
        >
            <svg
                className={`w-5 h-5 ${isFavorited ? 'text-yellow-500 fill-current' : 'text-gray-400'}`}
                viewBox="0 0 20 20"
            >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span>{isFavorited ? 'Favorited' : 'Add to Favorites'}</span>
        </button>
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
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isFavorited, setIsFavorited] = useState(false);
    const [filterType, setFilterType] = useState<'all' | 'favorites'>('all');
    const { publicKey } = useWallet();
    const { user } = useAuth();

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
                            const headers = new Headers({
                                ...(await getAuthHeaders()).headers
                            });
                            await fetch('/api/tokens/update-metadata', {
                                method: 'POST',
                                headers,
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
        const fetchTokens = async () => {
            try {
                const authHeaders = await getAuthHeaders();
                const csrfHeaders = await getCsrfHeaders();
                const requestConfig = {
                    headers: {
                        ...authHeaders.headers,
                        ...csrfHeaders
                    },
                    credentials: 'include' as RequestCredentials
                };

                let tokens;
                if (filterType === 'favorites') {
                    const response = await fetch('/api/favorites', requestConfig);
                    const data = await response.json();

                    // Transform snake_case to camelCase
                    tokens = data.tokens.map((token: any) => ({
                        mintAddress: token.mint_address,
                        name: token.name,
                        symbol: token.symbol,
                        decimals: token.decimals,
                        tokenType: token.token_type,
                        imageUrl: token.image_url,
                        currentPrice: token.current_price,
                        marketCapUsd: token.market_cap_usd,
                        volume24h: token.volume_24h,
                        priceChange24h: token.price_change_24h
                    }));
                } else {
                    // Build query parameters
                    const params = new URLSearchParams({
                        page: '1',
                        limit: '100',
                        sortBy: sortField,
                        sortDirection: sortDirection
                    });

                    const endpoint = (token?.tokenType === 'custom' || tokenType === 'custom')
                        ? `/api/tokens`  // For custom tokens, show all custom tokens
                        : `/api/market/tokens?${params}`; // For dex tokens, use normal filtering

                    const response = await fetch(endpoint, requestConfig);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    tokens = filterService.filterTokens(data.tokens);
                }

                setTopTokens(tokens);
            } catch (error) {
                console.error('Error fetching tokens:', error);
            }
        };
        fetchTokens();
    }, [filterType, sortField, sortDirection, token?.tokenType, tokenType, user]);

    // Update the sorting function
    const sortTokens = (tokens: TokenRecord[]) => {

        if (filterType === 'favorites') {
            // Don't filter favorites, just sort them
            return tokens.sort((a, b) => {
                const aValue = sortField === 'marketCapUsd' ? a.marketCapUsd : a[sortField];
                const bValue = sortField === 'marketCapUsd' ? b.marketCapUsd : b[sortField];
                return sortDirection === 'asc' ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue);
            });
        }

        // Original filtering logic for non-favorites
        const filteredTokens = tokens.filter(token =>
            !(token.symbol === 'USDC' && token.mintAddress !== MAINNET_USDC_ADDRESS) &&
            (token.imageUrl || (token.content?.metadata?.image))
        );

        return filteredTokens.sort((a, b) => {
            const aValue = sortField === 'marketCapUsd' ? a.marketCapUsd : a[sortField];
            const bValue = sortField === 'marketCapUsd' ? b.marketCapUsd : b[sortField];
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

    // Add useEffect to fetch metadata
    useEffect(() => {
        const fetchMetadata = async () => {
            if (!token?.metadataUrl) return;
            try {
                const response = await fetch(token.metadataUrl);
                const metadata = await response.json();
                setImageUrl(metadata.image);
            } catch (error) {
                console.error('Failed to fetch metadata:', error);
            }
        };
        fetchMetadata();
    }, [token?.metadataUrl]);

    // Add this useEffect to check if token is favorited
    useEffect(() => {
        const checkFavoriteStatus = async () => {
            if (!token?.mintAddress || !user) return;
            try {
                const authHeaders = await getAuthHeaders();
                const csrfHeaders = await getCsrfHeaders();
                const requestConfig = {
                    headers: {
                        ...authHeaders.headers,
                        ...csrfHeaders
                    },
                    credentials: 'include' as RequestCredentials
                };

                const response = await fetch('/api/favorites', requestConfig);
                const data = await response.json();



                // Handle both camelCase and snake_case
                const isFav = data.tokens.some((t: TokenRecord) =>
                    (t as any).mint_address === token.mintAddress || t.mintAddress === token.mintAddress
                );


                setIsFavorited(isFav);
            } catch (error) {
                console.error('Error checking favorite status:', error);
            }
        };
        checkFavoriteStatus();
    }, [token?.mintAddress, user]);

    // Add toggle function
    const toggleFavorite = async () => {
        if (!token || !publicKey || !user) return;
        try {
            const authHeaders = await getAuthHeaders();
            const csrfHeaders = await getCsrfHeaders();
            const requestConfig = {
                headers: {
                    ...authHeaders.headers,
                    ...csrfHeaders
                },
                credentials: 'include' as RequestCredentials
            };

            if (isFavorited) {
                await fetch(`/api/favorites/${token.mintAddress}`, {
                    method: 'DELETE',
                    ...requestConfig
                });
            } else {
                await fetch('/api/favorites', {
                    method: 'POST',
                    ...requestConfig,
                    body: JSON.stringify({ mintAddress: token.mintAddress })
                });
            }

            setIsFavorited(!isFavorited);

            // Only refetch tokens if we're in favorites view
            if (filterType === 'favorites') {
                const response = await fetch('/api/favorites', requestConfig);
                const data = await response.json();
                const transformedTokens = data.tokens.map((token: any) => ({
                    mintAddress: token.mint_address,
                    name: token.name,
                    symbol: token.symbol,
                    decimals: token.decimals,
                    tokenType: token.token_type,
                    imageUrl: token.image_url,
                    currentPrice: token.current_price,
                    marketCapUsd: token.market_cap_usd,
                    volume24h: token.volume_24h,
                    priceChange24h: token.price_change_24h
                }));
                setTopTokens(transformedTokens);
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    };

    const renderTokenSelector = () => (
        <Menu as="div" className="relative inline-flex items-center">
            <MenuButton className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors">
                <span className="text-sm font-mono">Select Token</span>
                <svg className="w-5 h-5 fill-current transition-transform" viewBox="0 0 20 20">
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
            </MenuButton>

            <MenuItems
                className="w-[400px] bg-white border border-gray-200 rounded-md shadow-lg max-h-[400px] overflow-hidden z-[9999]"
                anchor="bottom start"
            >
                <div className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <div className="flex gap-2 p-2">
                        <button
                            onClick={() => {
                                if (filterType !== 'all') {  // Only clear and change if switching TO all
                                    setTopTokens([]); // Clear tokens before fetching new ones
                                    setFilterType('all');
                                }
                            }}
                            className={`px-3 py-1 rounded-md ${filterType === 'all'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => {
                                if (filterType !== 'favorites') {  // Only clear and change if switching TO favorites
                                    setTopTokens([]); // Clear tokens before fetching new ones
                                    setFilterType('favorites');
                                }
                            }}
                            className={`px-3 py-1 rounded-md ${filterType === 'favorites'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            Favorites
                        </button>
                    </div>
                </div>

                <div className="sticky top-0 bg-gray-50 grid grid-cols-[2fr_1.2fr_1.2fr] px-4 py-2 text-xs text-gray-600 border-b border-gray-200">
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
                        className="text-left hover:text-gray-900 w-full"
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
                        className="text-right hover:text-gray-900 w-full"
                    >
                        24h Volume
                        {sortField === 'volume24h' && (
                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                    </button>
                </div>

                <div className="overflow-y-auto max-h-[360px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                    {sortTokens(topTokens).map(token => (
                        <MenuItem
                            key={token.mintAddress}
                            as="div"
                            onClick={() => {
                                navigate(`/token/${token.mintAddress}`, {
                                    state: { tokenType: token.tokenType || 'dex' }
                                });
                            }}
                            className="grid grid-cols-[2fr_1.2fr_1.2fr] px-4 py-2 cursor-pointer items-center text-sm font-mono hover:bg-gray-50 text-gray-900"
                        >
                            <div className="flex items-center gap-2">
                                {(token.tokenType === 'custom' ? imageUrl ?? '' : token.imageUrl) && (
                                    <img
                                        src={token.tokenType === 'custom' ? imageUrl ?? '' : token.imageUrl}
                                        alt={token.name}
                                        className="w-5 h-5 rounded-full"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                )}
                                <span className="font-medium">{token.symbol}</span>
                            </div>
                            <div className="text-left text-gray-600">
                                {formatMarketCap(token.marketCapUsd || null)}
                            </div>
                            <div className="text-right text-gray-600">
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

    // Update loading and error states to use light theme colors
    if (loading) return <div className="p-4 text-gray-600 font-mono">Loading...</div>;
    if (error) return <div className="p-4 text-red-500 font-mono">Error: {error}</div>;
    if (!token) return <div className="p-4 text-gray-600 font-mono">Token not found</div>;

    return (
        <div className="flex flex-col flex-1 bg-white text-gray-900 overflow-x-hidden">
            <div className="max-w-[1920px] mx-auto w-full p-4 space-y-4">
                {/* Project Information Section - Only show if project data exists */}
                {token && (token.projectTitle || token.projectDescription || token.projectCategory) && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-gray-200 rounded-lg p-6 shadow-sm">
                        <div className="flex gap-8">
                            {/* Image Section */}
                            <div className="flex-shrink-0">
                                {getImageUrl(token) && (
                                    <img
                                        src={getImageUrl(token)}
                                        alt={token.name}
                                        className="w-32 h-32 rounded-lg object-cover shadow-md border-2 border-white"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                )}
                            </div>

                            {/* Project Details Section */}
                            <div className="flex-grow space-y-4">
                                <div className="flex items-center gap-3">
                                    {token.projectCategory && (
                                        <div className="inline-block px-4 py-1.5 bg-blue-500 text-white rounded-full text-sm font-medium shadow-sm">
                                            {token.projectCategory}
                                        </div>
                                    )}
                                    <h1 className="text-3xl font-bold text-gray-900">
                                        {token.projectTitle}
                                    </h1>
                                </div>

                                {token.projectDescription && (
                                    <p className="text-gray-700 text-lg leading-relaxed">
                                        {token.projectDescription}
                                    </p>
                                )}

                                {token.projectStory && (
                                    <div className="mt-6 bg-white bg-opacity-50 rounded-lg p-4">
                                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Project Story</h2>
                                        <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                                            {token.projectStory}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Team Members Section */}
                        {!token.isAnonymous && token.teamMembers && token.teamMembers.length > 0 && (
                            <div className="mt-8 pt-6 border-t border-gray-200">
                                <h2 className="text-xl font-semibold text-gray-900 mb-4">Team</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {token.teamMembers.map((member, index) => (
                                        <div key={index} className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="font-medium text-gray-900 text-lg">{member.name}</div>
                                            <div className="text-blue-600 font-medium">{member.role}</div>
                                            {member.social && (
                                                <a
                                                    href={member.social}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-2 inline-flex items-center text-sm text-blue-500 hover:text-blue-600 transition-colors"
                                                >
                                                    <span>View Profile</span>
                                                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Top section with chart and trading interface */}
                <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4 overflow-x-hidden">
                    {/* Left column */}
                    <div className="space-y-4 overflow-x-hidden">
                        {/* Token header */}
                        <div className="bg-white border border-gray-200 rounded-lg p-3 overflow-x-hidden shadow-sm">
                            <div className="flex flex-col">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        {(token.tokenType === 'custom' ? imageUrl : token.imageUrl) && (
                                            <img
                                                src={token.tokenType === 'custom' ? imageUrl ?? '' : token.imageUrl}
                                                alt={token.name}
                                                className="w-10 h-10 rounded-full object-cover mr-3"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        )}
                                        <h1 className="text-lg font-mono text-gray-900 truncate">{token.symbol}</h1>
                                    </div>
                                    <FavoriteButton
                                        token={token}
                                        isFavorited={isFavorited}
                                        onToggle={toggleFavorite}
                                    />
                                    {renderTokenSelector()}
                                </div>
                                <div className="mt-1 text-sm text-gray-600 font-mono truncate">
                                    {token.name}
                                </div>
                            </div>
                        </div>

                        {/* Metrics cards */}
                        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
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
                        <ProjectInfoSection token={token} />
                    </div>

                    {/* Chart section */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 h-[600px] shadow-sm">
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