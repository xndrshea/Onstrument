import { useEffect, useState } from 'react'
import { TokenRecord } from '../../../shared/types/token'
import { tokenService } from '../../services/tokenService'
import { Link } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'

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
            const response = await tokenService.getAllTokens(currentPage, TOKENS_PER_PAGE);

            if (!response.tokens || response.tokens.length === 0) {
                setError('No tokens available at the moment');
                return;
            }

            setTokens(response.tokens);
            setTotalPages(response.pagination?.total
                ? Math.ceil(response.pagination.total / TOKENS_PER_PAGE)
                : Math.ceil(response.tokens.length / TOKENS_PER_PAGE));
            setError(null);
        } catch (error) {
            setError('Failed to fetch tokens');
            console.error('Error fetching tokens:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, [currentPage, tokenType]);

    const filteredTokens = tokens.filter(token => {
        if (tokenType === 'all') return true
        return token.tokenType === tokenType
    });

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
                    {filteredTokens.map(token => (
                        <Link
                            key={token.mintAddress}
                            to={`/token/${token.mintAddress}`}
                            className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-semibold">{token.name}</h3>
                                    <p className="text-sm text-gray-400">{token.symbol}</p>
                                </div>
                                <span className="text-xs px-2 py-1 rounded bg-gray-700">
                                    {token.tokenType === 'dex' ? 'DEX' : 'Custom'}
                                </span>
                            </div>
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
