import { Link } from 'react-router-dom'
import { TokenRecord } from '../../../shared/types/token'
import { TOKEN_DECIMALS } from '../../services/bondingCurve'
import { useState, useEffect } from 'react'
import { formatMarketCap } from '../../utils/formatting';

interface TokenCardProps {
    token: TokenRecord;
    volumePeriod: '5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all' | 'newest' | 'oldest' | 'marketCap';
}

interface TokenMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    attributes: any[];
}

export function TokenCard({ token, volumePeriod }: TokenCardProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        const fetchMetadata = async () => {
            if (!token.metadataUri) return;

            try {
                const response = await fetch(token.metadataUri);
                const metadata: TokenMetadata = await response.json();
                setImageUrl(metadata.image);
            } catch (error) {
                // Silently fail for metadata fetch errors
            }
        };

        fetchMetadata();
    }, [token.metadataUri, token.name]);

    const marketCap = token.currentPrice && token.totalSupply
        ? token.currentPrice * token.totalSupply
        : null;

    return (
        <div className="bg-[#232427] rounded-lg border border-transparent hover:border-white transition-colors">
            <Link
                to={`/token/${token.mintAddress}`}
                state={{ tokenType: 'custom' }}
                className="flex flex-col sm:flex-row p-4 gap-4"
            >
                {/* Image container */}
                <div className="w-full sm:w-40 h-40 sm:h-40 md:w-48 md:h-48 flex-shrink-0">
                    {imageUrl && (
                        <img
                            src={imageUrl}
                            alt={token.name}
                            className="w-full h-full object-contain rounded-md"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                </div>

                {/* Content container */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-medium truncate">{token.name || 'Unnamed Token'}</h3>
                        <span className="text-gray-400 text-sm whitespace-nowrap">({token.symbol || 'UNKNOWN'})</span>
                    </div>

                    <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                        {token.description || 'No description available'}
                    </p>

                    <div className="flex justify-between items-center mt-2">
                        <div className="text-sm text-gray-400">
                            Market Cap: {marketCap ? formatMarketCap(marketCap) : 'N/A'}
                        </div>
                        <div className="text-sm text-gray-400">
                            Price: {token.currentPrice ? `${token.currentPrice.toFixed(4)} SOL` : 'N/A'}
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
} 