import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { priceClient } from '../../services/priceClient';
import { getFullHeaders } from '../../utils/headers';

interface Creation {
    mintAddress: string;
    symbol?: string;
    creator: string;
    timestamp: number;
}

export function LiveCreationsDisplay() {
    const [creations, setCreations] = useState<Creation[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecentCreations = async () => {
            try {
                const response = await fetch('/api/recent-creations', {
                    headers: await getFullHeaders()
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch recent creations');
                }
                const recentCreations = await response.json();
                setCreations(Array.isArray(recentCreations) ? recentCreations : []);
            } catch (error) {
                console.error('Error fetching creations:', error);
                setError('Failed to load recent creations');
                setCreations([]);
            }
        };

        fetchRecentCreations();

        // WebSocket subscription for live updates
        const handleCreation = (creation: Creation) => {
            setCreations(prev => {
                const newCreations = [
                    {
                        mintAddress: creation.mintAddress,
                        symbol: creation.symbol,
                        creator: creation.creator,
                        timestamp: creation.timestamp
                    },
                    ...prev
                ].slice(0, 50); // Keep last 50 creations
                return newCreations;
            });
        };

        const unsubscribe = priceClient.wsClient.subscribeToCreations(handleCreation);
        return () => {
            unsubscribe();
        };
    }, []);

    if (error) {
        return <div className="text-red-500 text-sm">{error}</div>;
    }

    return (
        <div className="flex items-center space-x-4 whitespace-nowrap px-4 py-2 relative flex-shrink-0">
            {creations.map((creation, index) => (
                <div key={`${creation.mintAddress}-${index}`}
                    className="flex items-center space-x-2 px-4 py-1.5 rounded-full text-sm bg-blue-100 text-blue-800 flex-shrink-0">
                    <span className="text-xs opacity-75 truncate">
                        {creation.creator.slice(0, 4)}... created
                    </span>
                    <Link
                        to={`/token/${creation.mintAddress}`}
                        className="text-xs font-medium hover:underline truncate max-w-[100px]"
                    >
                        {creation.symbol || 'New Token'}
                    </Link>
                </div>
            ))}
        </div>
    );
} 