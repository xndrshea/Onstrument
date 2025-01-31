import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

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
                    `/api/search/tokens?q=${encodeURIComponent(query)}`
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
                placeholder="Search projects..."
                className="w-64 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />

            {(results.length > 0 || isLoading || error) && query && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                    {isLoading && (
                        <div className="p-4 text-gray-500 text-center">Loading...</div>
                    )}

                    {error && (
                        <div className="p-4 text-red-500 text-center">{error}</div>
                    )}

                    {!isLoading && !error && results.map((result) => (
                        <button
                            key={result.mint_address}
                            onClick={() => handleSelect(result)}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 focus:outline-none"
                        >
                            <div className="font-medium text-gray-900">{result.name}</div>
                            <div className="text-sm text-gray-500">
                                {result.symbol} • {result.mint_address.slice(0, 4)}...{result.mint_address.slice(-4)}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
} 