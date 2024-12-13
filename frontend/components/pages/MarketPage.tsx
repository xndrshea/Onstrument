import { useEffect, useState } from 'react'
import { TokenRecord } from '../../../shared/types/token'
import { Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { API_BASE_URL } from '../../config'

export function MarketPage() {
    const wallet = useWallet();
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tokenType, setTokenType] = useState<'all' | 'custom' | 'dex'>('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const TOKENS_PER_PAGE = 10

    const fetchTokens = async () => {
        try {
            setIsLoading(true);
            const url = new URL(`${API_BASE_URL}/market/tokens`);
            url.searchParams.append('page', currentPage.toString());
            url.searchParams.append('limit', TOKENS_PER_PAGE.toString());
            if (tokenType !== 'all') {
                url.searchParams.append('type', tokenType);
            }

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setTokens(data.tokens.map((token: any) => ({
                mintAddress: token.mint_address,
                name: token.name,
                symbol: token.symbol,
                tokenType: token.token_type || 'pool'
            })));

            setTotalPages(data.pagination?.total
                ? Math.ceil(data.pagination.total / TOKENS_PER_PAGE)
                : 1);
        } catch (error) {
            console.error('Error fetching market tokens:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch tokens');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, [currentPage, tokenType]);

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        window.scrollTo(0, 0);
    };

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
                        onChange={(e) => {
                            setTokenType(e.target.value as any);
                            setCurrentPage(1); // Reset to first page on filter change
                        }}
                    >
                        <option value="all">All Tokens</option>
                        <option value="custom">Custom Tokens</option>
                        <option value="dex">DEX Tokens</option>
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tokens.map(token => (
                        <Link
                            key={token.mintAddress}
                            to={`/token/${token.mintAddress}`}
                            state={{ tokenType: token.tokenType }}
                            className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-semibold">{token.name}</h3>
                                    <p className="text-sm text-gray-400">{token.symbol}</p>
                                </div>
                                <span className="text-xs px-2 py-1 rounded bg-gray-700">
                                    {token.tokenType === 'pool' ? 'DEX' : 'Custom'}
                                </span>
                            </div>
                            <p className="text-sm text-gray-400 mt-2">
                                {token.mintAddress.slice(0, 4)}...{token.mintAddress.slice(-4)}
                            </p>
                        </Link>
                    ))}
                </div>

                {/* Pagination Controls */}
                <div className="flex justify-center items-center mt-8 space-x-2">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
