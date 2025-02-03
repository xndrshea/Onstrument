import { Link } from 'react-router-dom'
import { TokenRecord } from '../../../shared/types/token'
import { TOKEN_DECIMALS } from '../../services/bondingCurve'
import { useState, useEffect } from 'react'
import { formatMarketCap } from '../../utils/formatting';
import { getCsrfHeaders } from '../../utils/headers';

interface TokenCardProps {
    token: TokenRecord;
    volumePeriod: '5m' | '30m' | '1h' | '4h' | '12h' | '24h' | 'all' | 'newest' | 'oldest' | 'marketCapUsd';
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
    const [volume, setVolume] = useState<number | null>(null);

    useEffect(() => {
        const fetchMetadata = async () => {
            if (!token.metadataUrl) return;
            try {
                const response = await fetch(token.metadataUrl);
                const metadata = await response.json();
                setImageUrl(metadata.image);
            } catch (error) {
                console.error('Failed to fetch metadata:', error);
            }
        };

        const fetchVolume = async () => {
            try {
                // Always use 24h for volume display when sorting by newest/oldest/marketCapUsd
                const displayPeriod = ['newest', 'oldest', 'marketCapUsd'].includes(volumePeriod)
                    ? '24h'
                    : volumePeriod;

                const response = await fetch(
                    `/api/price-history/${token.mintAddress}/volume?period=${displayPeriod}`,
                    { headers: await getCsrfHeaders() }
                );
                const data = await response.json();
                setVolume(data.volume);
            } catch (error) {
                console.error('Failed to fetch volume:', error);
            }
        };

        fetchMetadata();
        fetchVolume();
    }, [token.metadataUrl, token.mintAddress, volumePeriod]);

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all">
            <Link
                to={`/token/${token.mintAddress}`}
                state={{ tokenType: 'custom' }}
                className="flex flex-col sm:flex-row p-6 gap-6"
            >
                {/* Image container */}
                <div className="w-full sm:w-40 h-40 sm:h-40 md:w-48 md:h-48 flex-shrink-0 bg-gray-50 rounded-lg p-2">
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
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-gray-900 font-semibold text-lg truncate">{token.name || 'Unnamed Token'}</h3>
                        <span className="text-gray-500 text-sm whitespace-nowrap">({token.symbol || 'UNKNOWN'})</span>
                    </div>

                    <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                        {token.description || 'No description available'}
                    </p>

                    <div className="flex justify-between items-center mt-auto">
                        <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium text-gray-700">
                                Market Cap: {token.marketCapUsd ? formatMarketCap(token.marketCapUsd) : 'N/A'}
                            </div>
                            <div className="text-sm text-gray-600">
                                24h Volume: {volume ? `$${volume.toLocaleString()}` : 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
} 