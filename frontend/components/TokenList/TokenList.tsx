import React, { useEffect, useState, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { tokenService } from '../../services/tokenService'
import { TradingInterface } from '../Trading/TradingInterface'
import { PublicKey } from '@solana/web3.js'
import { TokenData } from '../../../shared/types/token'
import { BondingCurve } from '../../services/bondingCurve'

interface TokenListProps {
    onCreateClick: () => void
}

const RAYDIUM_SOL_USDC_POOL = new PublicKey('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2')
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')

const deduplicateTokens = (tokens: TokenData[]): TokenData[] => {
    return Array.from(new Map(tokens.map(token => [token.mint_address, token])).values());
};

export function TokenList({ onCreateClick }: TokenListProps) {
    const { connection } = useConnection()
    const { publicKey, connected } = useWallet()
    const [tokens, setTokens] = useState<TokenData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [solanaPrice, setSolanaPrice] = useState<number>(0)
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

    // Function to refresh the token list
    const refreshTokens = () => {
        setRefreshTrigger(prev => prev + 1)
    }

    const fetchOnChainData = async (token: TokenData) => {
        try {
            if (!token.mint_address || !token.curve_address) return token;

            const curve = new BondingCurve(connection, null);
            const curveData = await curve.getCurveData(new PublicKey(token.curve_address));

            return {
                ...token,
                onChainData: {
                    totalSupply: curveData.totalSupply.toString(),
                    currentPrice: curveData.spotPrice,
                    reserveBalance: curveData.reserveBalance.toString()
                }
            };
        } catch (error) {
            console.warn(`Failed to fetch on-chain data for token ${token.mint_address}:`, error);
            return token;
        }
    };

    useEffect(() => {
        const fetchTokens = async () => {
            setIsLoading(true);
            try {
                const tokens = await tokenService.getAllTokens();

                if (!Array.isArray(tokens)) {
                    setError('Invalid data received from server');
                    setTokens([]);
                    return;
                }

                // Filter and validate tokens
                const validTokens = tokens.filter(token => {
                    const isValid = token &&
                        typeof token === 'object' &&
                        token.mint_address &&
                        token.name &&
                        token.symbol;

                    if (!isValid) {
                        console.warn('Invalid token data:', token);
                    }
                    return isValid;
                });

                // Fetch on-chain data for each token
                const tokensWithOnChainData = await Promise.all(
                    validTokens.map(token => fetchOnChainData(token))
                );

                setTokens(deduplicateTokens(tokensWithOnChainData));
                setError(null);
            } catch (error) {
                console.error('Error fetching tokens:', error);
                setError('Failed to fetch tokens. Please try again later.');
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

    const calculateMarketCap = (token: TokenData) => {
        return 'N/A';
    };

    // Add this function to sort tokens
    const sortedTokens = useMemo(() => {
        if (!tokens.length) return [];
        return [...tokens].sort((a, b) => {
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
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
                    {sortedTokens.map((token) => (
                        <div key={token.mint_address} className="token-card">
                            <h3>{token.name || 'Unnamed Token'}</h3>
                            <p className="token-symbol">{token.symbol || 'UNKNOWN'}</p>
                            <p className="token-description">{token.description || 'No description available'}</p>
                            <p className="token-mint">
                                Mint: {token.mint_address ?
                                    `${token.mint_address.slice(0, 4)}...${token.mint_address.slice(-4)}` :
                                    'N/A'}
                            </p>
                            <p className="token-date">
                                {token.created_at ?
                                    new Date(token.created_at).toLocaleDateString() :
                                    'N/A'}
                            </p>
                            <p className="token-market-cap">
                                Market Cap: {calculateMarketCap(token)}
                            </p>
                            <div className="trading-section">
                                <h4>Trade Token</h4>
                                <TradingInterface
                                    token={token}
                                    onTradeComplete={() => refreshTokens()}
                                />
                            </div>
                            <div className="token-actions">
                                <button
                                    onClick={() => handleAddToWallet(token.mint_address)}
                                    className="add-to-wallet-btn"
                                >
                                    Add to Wallet
                                </button>
                                <a
                                    href={`https://explorer.solana.com/address/${token.mint_address}?cluster=devnet`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="view-explorer-btn"
                                >
                                    View on Explorer
                                </a>
                            </div>
                        </div>
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