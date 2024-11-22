import React, { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { tokenService, TokenData } from '../../services/tokenService'
import { addTokenToWallet } from '../../utils/tokenCreation'
import { TradingInterface } from '../Trading/TradingInterface'

interface TokenListProps {
    onCreateClick: () => void
}

export function TokenList({ onCreateClick }: TokenListProps) {
    const { publicKey, connected } = useWallet()
    const [tokens, setTokens] = useState<TokenData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

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
                        JSON.parse(token.metadata) : token.metadata,
                    bondingCurveConfig: typeof token.bonding_curve_config === 'string' ?
                        JSON.parse(token.bonding_curve_config) : token.bonding_curve_config
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
                <div>
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
                    {tokens.map((token) => (
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
                            <p className="token-supply">
                                Supply: {token.total_supply ?
                                    formatSupply(token.total_supply) :
                                    'N/A'}
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
                                    onClick={async () => {
                                        if ((window as any).solana && token.mint_address) {
                                            await addTokenToWallet(token.mint_address, (window as any).solana)
                                        } else {
                                            alert('Phantom wallet not found')
                                        }
                                    }}
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