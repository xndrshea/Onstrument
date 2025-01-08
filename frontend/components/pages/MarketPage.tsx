import { useEffect, useState } from 'react'
import { TokenRecord } from '../../../shared/types/token'
import { Link, useNavigate } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { API_BASE_URL } from '../../config'
import { formatMarketCap } from '../../utils/formatting'

export function MarketPage() {
    const navigate = useNavigate();
    const wallet = useWallet();
    const [tokens, setTokens] = useState<TokenRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [sortBy, setSortBy] = useState<string>('volume24h')
    const TOKENS_PER_PAGE = 10

    const fetchTokens = async () => {
        try {
            setIsLoading(true);
            const url = new URL(`${API_BASE_URL}/market/tokens`);
            url.searchParams.append('page', currentPage.toString());
            url.searchParams.append('limit', TOKENS_PER_PAGE.toString());
            url.searchParams.append('sortBy', sortBy);

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setTokens(data.tokens);
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
        <div className="p-4 bg-[#1C1D21]">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-white">Market</h1>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-[#2C2D33] text-white rounded px-3 py-1 text-sm"
                    >
                        <option value="volume24h">24h Volume</option>
                        <option value="volume1h">1h Volume</option>
                        <option value="volume5m">5m Volume</option>
                        <option value="marketCapUsd">Market Cap</option>
                        <option value="priceChange24h">24h Change</option>
                    </select>
                </div>

                {/* Market Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-sm text-gray-400 border-b border-gray-800">
                                <th className="py-3 text-left w-[40%]">Token</th>
                                <th className="py-3 text-right w-[20%]">24h Change</th>
                                <th
                                    className="py-3 text-right w-[20%] cursor-pointer hover:text-white"
                                    onClick={() => {
                                        // Cycle through volume sorting options
                                        if (sortBy === 'volume24h') setSortBy('volume1h');
                                        else if (sortBy === 'volume1h') setSortBy('volume5m');
                                        else if (sortBy === 'volume5m') setSortBy('volume24h');
                                        else setSortBy('volume24h');
                                    }}
                                >
                                    {sortBy === 'volume24h' ? '24h Volume' :
                                        sortBy === 'volume1h' ? '1h Volume' :
                                            sortBy === 'volume5m' ? '5m Volume' : 'Volume'}
                                </th>
                                <th
                                    className="py-3 text-right w-[20%] cursor-pointer hover:text-white"
                                    onClick={() => setSortBy('marketCapUsd')}
                                >
                                    Market Cap
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {tokens.map(token => (
                                <tr
                                    key={token.mintAddress}
                                    className="border-b border-gray-800 hover:bg-[#2C2D33] cursor-pointer"
                                    onClick={() => navigate(`/token/${token.mintAddress}`)}
                                >
                                    <td className="py-4 w-[40%]">
                                        <div className="flex items-center gap-2">
                                            {token.imageUrl && (
                                                <img
                                                    src={token.imageUrl}
                                                    alt={token.symbol}
                                                    className="w-6 h-6 rounded-full"
                                                />
                                            )}
                                            <div>
                                                <div className="font-medium text-white">{token.symbol}</div>
                                                <div className="text-sm text-gray-400">{token.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className={`py-4 text-right w-[20%] ${(token.priceChange24h || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {Number(token.priceChange24h)?.toFixed(1)}%
                                    </td>
                                    <td className="py-4 text-right w-[20%] text-white">
                                        ${formatNumber(
                                            sortBy === 'volume24h' ? (token.volume24h || 0) :
                                                sortBy === 'volume1h' ? (token.volume1h || 0) :
                                                    sortBy === 'volume5m' ? (token.volume5m || 0) :
                                                        token.volume24h || 0
                                        )}
                                    </td>
                                    <td className="py-4 text-right w-[20%] text-white">
                                        ${formatMarketCap(token.marketCapUsd || 0)}
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
                        className="px-4 py-2 bg-[#2C2D33] rounded disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="px-4 py-2 text-gray-400">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-[#2C2D33] rounded disabled:opacity-50"
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
