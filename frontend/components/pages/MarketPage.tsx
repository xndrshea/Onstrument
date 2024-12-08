import { useEffect, useState } from 'react'
import { TokenRecord } from '../../../shared/types/token'
import { tokenService } from '../../services/tokenService'
import { dexService } from '../../services/dexService'
import { Link } from 'react-router-dom'
import { BondingCurve } from '../../services/bondingCurve'
import { PublicKey } from '@solana/web3.js'
import { connection } from '../../config'
import { useWallet } from '@solana/wallet-adapter-react'
import { PriceService } from '../../services/priceService'
import { API_BASE_URL } from '../../config'

export function MarketPage() {
    const wallet = useWallet();
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tokenType, setTokenType] = useState<'all' | 'bonding_curve' | 'dex'>('all')

    const deduplicateTokens = (tokens: TokenRecord[]): TokenRecord[] => {
        const seen = new Set();
        return tokens.filter(token => {
            if (seen.has(token.mintAddress)) {
                return false;
            }
            seen.add(token.mintAddress);
            return true;
        });
    };

    const fetchTokenPrices = async (validTokens: TokenRecord[]) => {
        const prices: Record<string, number> = {};

        await Promise.all(validTokens.map(async (token) => {
            try {
                if (token.token_type === 'dex') {
                    const price = await dexService.getTokenPrice(token.mintAddress);
                    prices[token.mintAddress] = price;
                } else {
                    const price = await PriceService.getInstance(connection).getPrice(token);
                    prices[token.mintAddress] = price;
                }
            } catch (error) {
                console.warn(`Price fetch failed for ${token.symbol}:`, error);
                // Don't set price to 0, keep previous price if exists
                if (!prices[token.mintAddress]) {
                    prices[token.mintAddress] = 0;
                }
            }
        }));

        setTokenPrices(prev => ({ ...prev, ...prices }));
    };

    const renderTokenPrice = (token: TokenRecord) => {
        const price = tokenPrices[token.mintAddress];
        if (price === undefined) return null;

        return (
            <p className="text-sm">
                Price: {price === 0 ? 'Not available' : `${price.toFixed(6)} SOL`}
            </p>
        );
    };

    const fetchAllTokens = async () => {
        try {
            setIsLoading(true);
            const { tokens } = await tokenService.getAllTokens();

            if (!tokens || tokens.length === 0) {
                setError('No tokens available at the moment');
                return;
            }

            setTokens(tokens);
            await fetchTokenPrices(tokens);
            setError(null);
        } catch (error) {
            setError('Failed to fetch tokens');
            console.error('Error fetching tokens:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAllTokens();
    }, []);

    useEffect(() => {
        const interval = setInterval(async () => {
            if (tokens.length > 0) {
                console.log(`Updating prices for ${tokens.length} tokens...`);
                await fetchTokenPrices(tokens);
                console.log('Price update complete');
            }
        }, 10000);

        return () => clearInterval(interval);
    }, [tokens]);

    const filteredTokens = tokens.filter(token => {
        if (tokenType === 'all') return true
        return token.token_type === tokenType
    })

    const triggerManualSync = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/dex/sync`, {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error('Sync failed');
            }
            // Refetch tokens after sync
            await fetchAllTokens();
        } catch (error) {
            console.error('Manual sync failed:', error);
            setError('Failed to sync tokens');
        }
    };

    if (isLoading) return <div className="p-4">Loading...</div>
    if (error) return <div className="p-4 text-red-500">{error}</div>

    return (
        <div className="p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Token Market</h1>
                    <select
                        className="bg-gray-700 text-white rounded px-3 py-1"
                        value={tokenType}
                        onChange={(e) => setTokenType(e.target.value as any)}
                    >
                        <option value="all">All Tokens</option>
                        <option value="bonding_curve">Custom Tokens</option>
                        <option value="dex">DEX Tokens</option>
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTokens.map(token => (
                        <Link
                            key={token.mintAddress}
                            to={`/token/${token.mintAddress}`}
                            className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-semibold">{token.name}</h3>
                                    <p className="text-sm text-gray-400">{token.symbol}</p>
                                </div>
                                <span className="text-xs px-2 py-1 rounded bg-gray-700">
                                    {token.token_type === 'dex' ? 'DEX' : 'Custom'}
                                </span>
                            </div>
                            {renderTokenPrice(token)}
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
