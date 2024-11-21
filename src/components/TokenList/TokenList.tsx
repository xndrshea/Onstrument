import React, { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { tokenService, TokenData } from '../../services/tokenService'

interface TokenListProps {
    onCreateClick: () => void
}

export function TokenList({ onCreateClick }: TokenListProps) {
    const { publicKey } = useWallet()
    const [tokens, setTokens] = useState<TokenData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadTokens = async () => {
            try {
                setIsLoading(true)
                setError(null)
                const fetchedTokens = await tokenService.getTokens(publicKey?.toString())
                setTokens(fetchedTokens)
            } catch (err) {
                setError('Failed to load tokens')
                console.error(err)
            } finally {
                setIsLoading(false)
            }
        }

        loadTokens()
    }, [publicKey])

    if (isLoading) {
        return <div className="loading">Loading tokens...</div>
    }

    if (error) {
        return <div className="error">{error}</div>
    }

    return (
        <div className="token-list">
            <div className="token-list-header">
                <h2>Created Tokens</h2>
                <button className="create-token-button" onClick={onCreateClick}>
                    + Create Token
                </button>
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