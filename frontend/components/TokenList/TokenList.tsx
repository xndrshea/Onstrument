import { useEffect, useState, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { tokenService } from '../../services/tokenService'
import { TokenRecord } from '../../../shared/types/token'
import { TOKEN_DECIMALS } from '../../services/bondingCurve'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../../config'
import { priceClient } from '../../services/priceClient'

interface TokenListProps {
    onCreateClick: () => void
}

const deduplicateTokens = (tokens: TokenRecord[]): TokenRecord[] => {
    return Array.from(new Map(tokens.map(token => [token.mintAddress, token])).values());
};

export function TokenList({ onCreateClick }: TokenListProps) {
    const { connection } = useConnection()
    const { wallet } = useWallet()
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
    const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});

    const refreshTokens = () => {
        fetchTokens()
    }

    const fetchTokens = async () => {
        setIsLoading(true);
        try {
            console.log('Fetching custom tokens from:', `${API_BASE_URL}/tokens`);
            const response = await fetch(`${API_BASE_URL}/tokens`);
            console.log('Token fetch response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error || 'Unknown error'}`);
            }

            const data = await response.json();
            console.log('Custom tokens response data:', data);

            if (!data.tokens) {
                throw new Error('No data received from server');
            }

            const normalizedTokens = data.tokens.map((token: TokenRecord & { mint_address?: string }) => ({
                ...token,
                mintAddress: token.mintAddress || token.mint_address,
                curveAddress: token.curveAddress,
                createdAt: token.createdAt,
                totalSupply: token.totalSupply,
                tokenType: 'custom',
                price: token.price || 0,
                volume24h: token.volume24h || 0
            }));

            setTokens(deduplicateTokens(normalizedTokens));
            setError(null);
        } catch (error) {
            console.error('Error fetching custom tokens:', error);
            setError(error instanceof Error ? error.message : 'An unexpected error occurred');
            setTokens([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, [connection]);

    const calculateMarketCap = (token: TokenRecord) => {
        return 'N/A';
    };

    // Add this function to sort tokens
    const sortedTokens = useMemo(() => {
        if (!tokens.length) return [];
        console.log('Tokens before sorting:', tokens);
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
                </div>
            </div>
            {tokens.length > 0 ? (
                <div className="token-grid">
                    {sortedTokens.map(token => {
                        if (!token.mintAddress) {
                            console.warn('Token missing mintAddress:', token);
                            return null;
                        }
                        return (
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
                        );
                    })}
                </div>
            ) : (
                <div className="no-tokens">
                    <p>No tokens have been created yet.</p>
                </div>
            )}
        </div>
    )
} 