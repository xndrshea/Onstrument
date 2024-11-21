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

    useEffect(() => {
        const fetchTokens = async () => {
            try {
                setIsLoading(true);
                const fetchedTokens = await tokenService.getAllTokens();

                // Sort tokens by creation time, newest first
                const sortedTokens = fetchedTokens.sort((a, b) => {
                    // If createdAt is available, use it
                    if (a.createdAt && b.createdAt) {
                        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    }
                    // Fallback to comparing mint addresses if no timestamp
                    return b.mint_address.localeCompare(a.mint_address);
                });

                setTokens(sortedTokens);
            } catch (error) {
                console.error('Error fetching tokens:', error);
                setError('Failed to load tokens');
            } finally {
                setIsLoading(false);
            }
        };

        fetchTokens();
    }, []);

    // Reduce refresh frequency to avoid rate limiting
    useEffect(() => {
        const interval = setInterval(refreshTokens, 10000) // Change to 10 seconds
        return () => clearInterval(interval)
    }, [])

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
                            {token.image_url && (
                                <img
                                    src={token.image_url}
                                    alt={`${token.name} logo`}
                                    className="token-logo"
                                />
                            )}
                            <h3>{token.name}</h3>
                            <p className="token-symbol">{token.symbol}</p>
                            <p className="token-description">{token.description}</p>
                            <p className="token-mint">
                                Mint: {token.mint_address ?
                                    `${token.mint_address.slice(0, 4)}...${token.mint_address.slice(-4)}` :
                                    'N/A'}
                            </p>
                            <p className="token-date">
                                {token.created_at ? new Date(token.created_at).toLocaleDateString() : 'N/A'}
                            </p>
                            <p className="token-supply">
                                Supply: {token.total_supply ? token.total_supply.toLocaleString() : 'N/A'}
                            </p>
                            <div className="trading-section">
                                <h4>Trade Token</h4>
                                <TradingInterface token={token} />
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