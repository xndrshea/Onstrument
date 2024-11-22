import React, { useEffect, useState, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { tokenService, TokenData } from '../../services/tokenService'
import { addTokenToWallet, getManualTokenAddInstructions } from '../../utils/tokenCreation'
import { TradingInterface } from '../Trading/TradingInterface'
import { getMint } from '@solana/spl-token'
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BondingCurve, CurveType } from '../../services/bondingCurve';
import { formatMarketCap } from '../../utils/formatting';

interface TokenListProps {
    onCreateClick: () => void
}

export function TokenList({ onCreateClick }: TokenListProps) {
    const { connection } = useConnection()
    const { publicKey, connected } = useWallet()
    const [tokens, setTokens] = useState<TokenData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [solanaPrice, setSolanaPrice] = useState<number>(63.25)
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

    // Function to refresh the token list
    const refreshTokens = () => {
        setRefreshTrigger(prev => prev + 1)
    }

    // Add a function to deduplicate tokens
    const deduplicateTokens = (tokens: TokenData[]) => {
        const seen = new Set();
        return tokens.filter(token => {
            const duplicate = seen.has(token.mint_address);
            seen.add(token.mint_address);
            return !duplicate;
        });
    };

    useEffect(() => {
        const fetchTokens = async () => {
            setIsLoading(true);
            try {
                const tokens = await tokenService.getAllTokens();
                console.log('Raw fetched tokens:', tokens);

                if (!Array.isArray(tokens)) {
                    console.error('Invalid tokens data received:', tokens);
                    setError('Invalid data received from server');
                    setTokens([]);
                    return;
                }

                // Filter out any invalid tokens and ensure all required fields
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
                }).map(token => ({
                    ...token,
                    metadata: typeof token.metadata === 'string' ?
                        JSON.parse(token.metadata) : token.metadata
                }));

                console.log('Processed tokens:', validTokens);
                setTokens(deduplicateTokens(validTokens));
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
    }, [refreshTrigger]);

    // Reduce refresh frequency to avoid rate limiting
    useEffect(() => {
        const interval = setInterval(refreshTokens, 10000) // Change to 10 seconds
        return () => clearInterval(interval)
    }, [])

    const formatSupply = (supply: number): string => {
        // Convert from raw units (with 9 decimals) to actual token amount
        const actualSupply = supply / Math.pow(10, 9)
        return actualSupply.toLocaleString(undefined, {
            maximumFractionDigits: 2
        })
    }

    const handleAddToWallet = async (mintAddress: string) => {
        if (!publicKey) {
            alert('Please connect your wallet first');
            return;
        }

        try {
            const success = await addTokenToWallet(connection, publicKey, mintAddress);
            if (!success) {
                alert(getManualTokenAddInstructions(mintAddress));
            }
        } catch (error) {
            console.error('Error adding token to wallet:', error);
            alert(getManualTokenAddInstructions(mintAddress));
        }
    };

    // Add this useEffect to fetch Solana price
    useEffect(() => {
        const fetchSolanaPrice = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL}/solana-price`);

                if (!response.ok) {
                    console.warn('Using default SOL price due to API error:', response.status);
                    return; // Keep using default price
                }

                const data = await response.json();
                setSolanaPrice(data.solana.usd);
                console.log('Fetched SOL price:', data.solana.usd);
            } catch (error) {
                console.warn('Using default SOL price due to error:', error);
                // Keep using default price
            }
        };

        fetchSolanaPrice();
        const interval = setInterval(fetchSolanaPrice, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    const calculateMarketCap = (token: TokenData): string => {
        try {
            const bondingCurve = BondingCurve.fromToken(token);
            const marketCap = bondingCurve.calculateMarketCap(token);
            return formatMarketCap(marketCap);
        } catch (error) {
            console.error('Error calculating market cap:', error);
            return 'N/A';
        }
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