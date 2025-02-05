import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { priceClient } from '../../services/priceClient';

export function LiveCreationsDisplay() {
    const [creations, setCreations] = useState<Array<{
        mintAddress: string;
        symbol?: string;
        creator: string;
        timestamp: number;
    }>>([]);

    useEffect(() => {
        const handleCreation = (creation: any) => {
            setCreations(prev => [
                {
                    mintAddress: creation.mintAddress,
                    symbol: creation.symbol,
                    creator: creation.creator,
                    timestamp: creation.timestamp
                },
                ...prev
            ].slice(0, 10));
        };

        const unsubscribe = priceClient.wsClient.subscribeToCreations(handleCreation);
        return () => {
            unsubscribe();
        };
    }, []);

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