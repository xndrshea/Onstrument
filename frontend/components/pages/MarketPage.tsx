import { useEffect, useState } from 'react'
import { TokenRecord } from '../../../shared/types/token'
import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { formatMarketCap } from '../../utils/formatting'
import { filterService } from '../../services/filterService'

export function MarketPage() {
    const navigate = useNavigate();
    const wallet = useWallet();
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [sortBy, setSortBy] = useState<string>('volume24h')
    const TOKENS_PER_PAGE = 50

    const fetchTokens = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/market/tokens?page=${currentPage}&limit=${TOKENS_PER_PAGE}&sortBy=${sortBy}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const filteredTokens = filterService.filterTokens(data.tokens);
            setTokens(filteredTokens);
            setTotalPages(Math.ceil(data.pagination.total / TOKENS_PER_PAGE));
        } catch (error) {
            console.error('Error fetching market tokens:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch tokens');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, [currentPage, sortBy]);

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
        window.scrollTo(0, 0);
    };

    if (isLoading) return <div className="p-4">Loading...</div>
    if (error) return <div className="p-4 text-red-500">{error}</div>

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex justify-between items-center px-6 py-4">
                        <h1 className="text-2xl font-bold text-gray-900">Market</h1>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-gray-50 text-gray-500 rounded px-3 py-1 text-sm"
                        >
                            <option value="volume24h">24h Volume</option>
                            <option value="volume1h">1h Volume</option>
                            <option value="volume5m">5m Volume</option>
                        </select>
                    </div>

                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                                    Token
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Price
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    24h Change
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700">
                                    {sortBy === 'volume24h' ? '24h Volume' :
                                        sortBy === 'volume1h' ? '1h Volume' :
                                            sortBy === 'volume5m' ? '5m Volume' : 'Volume'}
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Market Cap
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {tokens.map(token => (
                                <tr
                                    key={token.mintAddress}
                                    className="hover:bg-gray-50 cursor-pointer"
                                    onClick={() => navigate(`/token/${token.mintAddress}`)}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 w-1/3">
                                        <div className="flex items-center gap-2">
                                            {token.imageUrl && (
                                                <img
                                                    src={token.imageUrl}
                                                    alt={token.symbol}
                                                    className="w-8 h-8 rounded-full"
                                                />
                                            )}
                                            <div>
                                                <div className="font-medium text-gray-900">{token.symbol}</div>
                                                <div className="text-sm text-gray-500">{token.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-500">
                                        ${Number(token.currentPrice)?.toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-500">
                                        {Number(token.priceChange24h)?.toFixed(1)}%
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-500">
                                        ${formatNumber(
                                            sortBy === 'volume24h' ? (token.volume24h || 0) :
                                                sortBy === 'volume1h' ? (token.volume1h || 0) :
                                                    sortBy === 'volume5m' ? (token.volume5m || 0) :
                                                        token.volume24h || 0
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-left text-gray-500">
                                        {formatMarketCap(token.marketCapUsd || 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex justify-center mt-6 gap-2">
                    <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-gray-50 rounded disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-gray-500">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-gray-50 rounded disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}

// Helper function for number formatting
function formatNumber(num: number | null | undefined): string {
    // Convert to number and handle invalid inputs
    const value = Number(num);
    if (isNaN(value)) return '0.00';

    if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
    if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
    if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
    return value.toFixed(2);
}
