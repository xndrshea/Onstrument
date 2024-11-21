import React, { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { tokenService, TokenData } from '../../services/tokenService'
import { addTokenToWallet } from '../../utils/tokenCreation'

interface TokenListProps {
    onCreateClick: () => void
}

export function TokenList({ onCreateClick }: TokenListProps) {
    const { publicKey } = useWallet()
    const [tokens, setTokens] = useState<TokenData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

    // Function to refresh the token list
    const refreshTokens = () => {
        setRefreshTrigger(prev => prev + 1)
    }

    useEffect(() => {
        let mounted = true

        const loadTokens = async () => {
            if (!publicKey) return

            try {
                setIsLoading(true)
                setError(null)
                console.log('Fetching tokens for wallet:', publicKey.toString())
                const fetchedTokens = await tokenService.getTokens(publicKey.toString())

                if (mounted) {
                    console.log('Setting tokens:', fetchedTokens)
                    setTokens(fetchedTokens)
                }
            } catch (err) {
                console.error('Error loading tokens:', err)
                if (mounted) {
                    setError('Failed to load tokens')
                }
            } finally {
                if (mounted) {
                    setIsLoading(false)
                }
            }
        }

        loadTokens()

        return () => {
            mounted = false
        }
    }, [publicKey, refreshTrigger])

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
                <h2>Created Tokens</h2>
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
                        <div key={token.mint} className="token-card">
                            {token.imageUrl && (
                                <img
                                    src={token.imageUrl}
                                    alt={`${token.name} logo`}
                                    className="token-logo"
                                />
                            )}
                            <h3>{token.name}</h3>
                            <p className="token-symbol">{token.symbol}</p>
                            <p className="token-description">{token.description}</p>
                            <p className="token-mint">Mint: {token.mint.slice(0, 4)}...{token.mint.slice(-4)}</p>
                            <p className="token-date">{new Date(token.createdAt).toLocaleDateString()}</p>
                            <p className="token-supply">Supply: {token.supply.toLocaleString()}</p>
                            <div className="token-actions">
                                <button
                                    onClick={async () => {
                                        if ((window as any).solana) {
                                            await addTokenToWallet(token.mint, (window as any).solana)
                                        } else {
                                            alert('Phantom wallet not found')
                                        }
                                    }}
                                    className="add-to-wallet-btn"
                                >
                                    Add to Wallet
                                </button>
                                <a
                                    href={`https://explorer.solana.com/address/${token.mint}?cluster=devnet`}
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