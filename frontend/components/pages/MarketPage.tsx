import { useEffect, useState } from 'react'
import { TokenRecord } from '../../../shared/types/token'
import { tokenService } from '../../services/tokenService'
import { dexService } from '../../services/dexService'
import { Link } from 'react-router-dom'
import { BondingCurve } from '../../services/bondingCurve'
import { PublicKey } from '@solana/web3.js'
import { connection } from '../../config'
import { useWallet } from '@solana/wallet-adapter-react'

export function MarketPage() {
    const wallet = useWallet();
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tokenType, setTokenType] = useState<'all' | 'bonding_curve' | 'dex'>('all')

    const fetchTokenPrices = async (validTokens: TokenRecord[]) => {
        const prices: Record<string, number> = {};

        await Promise.all(validTokens.map(async (token) => {
            try {
                if (token.token_type === 'dex') {
                    const price = await dexService.getTokenPrice(token.mintAddress);
                    prices[token.mintAddress] = price;
                } else if (wallet.connected && wallet.publicKey) {
                    // Only try to fetch bonding curve prices if wallet is connected
                    const bondingCurve = new BondingCurve(
                        connection,
                        wallet,
                        new PublicKey(token.mintAddress),
                        new PublicKey(token.curveAddress)
                    );
                    const quote = await bondingCurve.getPriceQuote(1, true);
                    prices[token.mintAddress] = quote.price;
                }
            } catch (error) {
                console.error(`Error fetching price for ${token.symbol}:`, error);
            }
        }));

        setTokenPrices(prices);
    };

    const renderTokenPrice = (token: TokenRecord) => {
        const price = tokenPrices[token.mintAddress];
        if (price === undefined) return null;

        return (
            <p className="text-sm">
                Price: {price.toFixed(6)} SOL
            </p>
        );
    };

    const fetchAllTokens = async () => {
        try {
            setIsLoading(true);
            const [customTokens, dexTokens] = await Promise.allSettled([
                tokenService.getAllTokens(),
                dexService.getTopTokens()
            ]);

            const validTokens = [
                ...(customTokens.status === 'fulfilled' ? customTokens.value : []),
                ...(dexTokens.status === 'fulfilled' ? dexTokens.value : [])
            ];

            if (validTokens.length === 0) {
                setError('No tokens available at the moment');
            } else {
                setTokens(validTokens);
                await fetchTokenPrices(validTokens);
                setError(null);
            }
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
        const interval = setInterval(() => {
            if (tokens.length > 0) {
                fetchTokenPrices(tokens);
            }
        }, 10000); // Update every 10 seconds

        return () => clearInterval(interval);
    }, [tokens]);

    const filteredTokens = tokens.filter(token => {
        if (tokenType === 'all') return true
        return token.token_type === tokenType
    })

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
