import { useEffect, useState, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { TokenRecord } from '../../../shared/types/token'
import { TokenCard } from './TokenCard'

interface TokenListProps {
    onCreateClick: () => void
}

export function TokenList({ onCreateClick }: TokenListProps) {
    const { connection } = useConnection()
    const { wallet } = useWallet()
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [volumePeriod, setVolumePeriod] = useState<'5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all' | 'marketCapUsd' | 'newest' | 'oldest'>('newest');

    const refreshTokens = () => {
        fetchTokens()
    }

    const fetchTokens = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/tokens?sortBy=${volumePeriod}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            setTokens(data.tokens.map((token: any) => ({
                mintAddress: token.mintAddress,
                name: token.name,
                symbol: token.symbol,
                tokenType: 'custom',
                description: token.description,
                metadataUri: token.metadataUri,
                curveConfig: token.curveConfig,
                createdAt: token.createdAt,
                volume: token.volume,
                supply: token.supply,
                totalSupply: token.totalSupply,
                currentPrice: token.currentPrice,
                marketCapUsd: token.marketCapUsd
            })));

        } catch (error) {
            console.error('Error fetching tokens:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch tokens');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, [connection, volumePeriod]);

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
        <div className="p-4">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Onstrument Tokens</h2>
                    <div className="flex gap-2">
                        <select
                            value={volumePeriod}
                            onChange={(e) => setVolumePeriod(e.target.value as typeof volumePeriod)}
                            className="bg-gray-700 text-white rounded px-3 py-1"
                        >
                            <option value="marketCapUsd">Market Cap</option>
                            <option value="5m">5m Volume</option>
                            <option value="30m">30m Volume</option>
                            <option value="1h">1h Volume</option>
                            <option value="4h">4h Volume</option>
                            <option value="12h">12h Volume</option>
                            <option value="24h">24h Volume</option>
                            <option value="all">All Time Volume</option>
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                        </select>
                        <button
                            onClick={refreshTokens}
                            className="bg-gray-700 text-white rounded px-3 py-1 hover:bg-gray-600"
                        >
                            🔄 Refresh
                        </button>
                        <button
                            className="bg-purple-600 text-white rounded px-3 py-1 hover:bg-purple-500"
                            onClick={onCreateClick}
                        >
                            + Create Token
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tokens.map(token => (
                        <TokenCard
                            key={token.mintAddress}
                            token={token}
                            volumePeriod={volumePeriod}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
} 