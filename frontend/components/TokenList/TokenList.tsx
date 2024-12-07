import { useEffect, useState, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { tokenService } from '../../services/tokenService'
import { PublicKey } from '@solana/web3.js'
import { TokenRecord } from '../../../shared/types/token'
import { TOKEN_DECIMALS } from '../../services/bondingCurve'
import { Link } from 'react-router-dom'
import { dexService } from '../../services/dexService'

interface TokenListProps {
    onCreateClick: () => void
}

const RAYDIUM_SOL_USDC_POOL = new PublicKey('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2')
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')

const deduplicateTokens = (tokens: TokenRecord[]): TokenRecord[] => {
    return Array.from(new Map(tokens.map(token => [token.mintAddress || token.mint_address, token])).values());
};

export function TokenList({ onCreateClick }: TokenListProps) {
    const { connection } = useConnection()
    const { wallet } = useWallet()
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [solanaPrice, setSolanaPrice] = useState<number>(0)
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
    const [tokenType, setTokenType] = useState<'all' | 'bonding_curve' | 'dex'>('all')

    // Function to refresh the token list
    const refreshTokens = () => {
        setRefreshTrigger(prev => prev + 1)
    }

    useEffect(() => {
        const fetchTokens = async () => {
            setIsLoading(true);
            try {
                const tokens = await tokenService.getAllTokens();
                if (!tokens) {
                    throw new Error('No data received from server');
                }

                // Simplified validation that accepts both cases
                const validTokens = tokens.filter(token => {
                    if (!token || typeof token !== 'object') {
                        console.warn('Invalid token object:', token);
                        return false;
                    }

                    // Accept either camelCase or snake_case
                    const hasValidMint = Boolean(token.mintAddress || token.mint_address);
                    const hasValidName = Boolean(token.name);
                    const hasValidSymbol = Boolean(token.symbol);

                    return hasValidMint && hasValidName && hasValidSymbol;
                });

                setTokens(deduplicateTokens(validTokens));
                setError(null);
            } catch (error) {
                console.error('Error fetching tokens:', error);
                setError(error instanceof Error ? error.message : 'An unexpected error occurred');
                setTokens([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTokens();
    }, [refreshTrigger, connection]);

    // Reduce refresh frequency to avoid rate limiting
    useEffect(() => {
        const interval = setInterval(refreshTokens, 10000) // Change to 10 seconds
        return () => clearInterval(interval)
    }, []);

    // Replace the existing SOL price fetching logic
    useEffect(() => {
        const fetchSolanaPrice = async () => {
            try {
                const response = await fetch('http://localhost:3001/api/solana-price', {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                });
                // Even if we hit rate limit, we'll get the last known price
                const data = await response.json();
                setSolanaPrice(data.price);
            } catch (error) {
                console.warn('Error fetching SOL price:', error);
                // Keep the last known price instead of using fallback
            }
        };
        fetchSolanaPrice();
        const interval = setInterval(fetchSolanaPrice, 60_000); // Update every minute instead of 30 seconds
        return () => clearInterval(interval);
    }, []);

    const calculateMarketCap = (token: TokenRecord) => {
        return 'N/A';
    };

    // Add this function to sort tokens
    const sortedTokens = useMemo(() => {
        if (!tokens.length) return [];
        return [...tokens].sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });
    }, [tokens, sortOrder]);

    if (isLoading) {
        return <div className="loading">Loading tokens...</div>
    }
    if (error) {
        return (
            <div className="error">
                {error}
                <button onClick={refreshTokens}>Retry</button>
            </div>
        )
    }
    return (
        <div className="token-list">
            <div className="token-list-header">
                <h2>All Tokens</h2>
                <div className="token-list-controls">
                    <select
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                        className="sort-selector"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                    </select>
                    <button onClick={refreshTokens} className="refresh-button">
                        🔄 Refresh
                    </button>
                    <button className="create-token-button" onClick={onCreateClick}>
                        + Create Token
                    </button>
                    <select
                        className="sort-selector"
                        value={tokenType}
                        onChange={(e) => setTokenType(e.target.value as any)}
                    >
                        <option value="all">All Tokens</option>
                        <option value="bonding_curve">Custom Tokens</option>
                        <option value="dex">DEX Tokens</option>
                    </select>
                </div>
            </div>
            {tokens.length > 0 ? (
                <div className="token-grid">
                    {tokens
                        .filter(token => tokenType === 'all' || token.token_type === tokenType)
                        .map(token => (
                            <Link
                                to={`/token/${token.mintAddress}`}
                                key={token.mintAddress}
                                className="token-card"
                            >
                                <h3>{token.name || 'Unnamed Token'}</h3>
                                <p className="token-symbol">{token.symbol || 'UNKNOWN'}</p>
                                <p className="token-description">{token.description || 'No description available'}</p>
                                <p className="token-mint">
                                    Mint: {token.mintAddress ?
                                        `${token.mintAddress.slice(0, 4)}...${token.mintAddress.slice(-4)}` :
                                        'N/A'}
                                </p>
                                <p className="token-date">
                                    {token.createdAt ?
                                        new Date(token.createdAt).toLocaleDateString() :
                                        'N/A'}
                                </p>
                                <p className="token-market-cap">
                                    Market Cap: {calculateMarketCap(token)}
                                </p>
                                <p className="token-supply">
                                    Supply: {Number(token.totalSupply) / (10 ** TOKEN_DECIMALS)} {token.symbol}
                                </p>
                            </Link>
                        ))}
                </div>
            ) : (
                <div className="no-tokens">
                    <p>No tokens have been created yet.</p>
                </div>
            )}
        </div>
    )
} 