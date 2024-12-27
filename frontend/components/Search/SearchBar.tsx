import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

interface SearchResult {
    mint_address: string;
    name: string;
    symbol: string;
    token_type: string;
}

export function SearchBar() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const searchTimeout = useRef<NodeJS.Timeout>();

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        // Clear previous timeout
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        // Set new timeout for debouncing
        searchTimeout.current = setTimeout(async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(
                    `${API_BASE_URL}/search/tokens?q=${encodeURIComponent(query)}`
                );

                if (!response.ok) {
                    throw new Error('Search failed');
                }

                const data = await response.json();
                setResults(data.tokens || []);
            } catch (err) {
                console.error('Search error:', err);
                setError('Search failed');
                setResults([]);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => {
            if (searchTimeout.current) {
                clearTimeout(searchTimeout.current);
            }
        };
    }, [query]);

    const handleSelect = (result: SearchResult) => {
        navigate(`/token/${result.mint_address}`, {
            state: { tokenType: result.token_type }
        });
        setQuery('');
        setResults([]);
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tokens..."
                className="w-64 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary"
            />

            {(results.length > 0 || isLoading || error) && query && (
                <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                    {isLoading && (
                        <div className="p-4 text-gray-400 text-center">Loading...</div>
                    )}

                    {error && (
                        <div className="p-4 text-red-400 text-center">{error}</div>
                    )}

                    {!isLoading && !error && results.map((result) => (
                        <button
                            key={result.mint_address}
                            onClick={() => handleSelect(result)}
                            className="w-full px-4 py-2 text-left hover:bg-gray-700 focus:outline-none"
                        >
                            <div className="font-medium text-white">{result.name}</div>
                            <div className="text-sm text-gray-400">
                                {result.symbol} • {result.mint_address.slice(0, 4)}...{result.mint_address.slice(-4)}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
} 