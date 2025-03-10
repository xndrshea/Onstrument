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

export function TokenCard({ token, volumePeriod }: TokenCardProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [volume, setVolume] = useState<number | null>(null);

    useEffect(() => {
        const fetchMetadata = async () => {
            if (!token.metadataUrl) return;

            try {
                // Extract the IPFS hash from the URL
                const ipfsHash = token.metadataUrl.split('/ipfs/')[1];

                // Try different IPFS gateways in order
                const gateways = [
                    `https://ipfs.io/ipfs/${ipfsHash}`,
                    `https://dweb.link/ipfs/${ipfsHash}`,
                    `https://cloudflare-ipfs.com/ipfs/${ipfsHash}`,
                    // Pinata as last resort
                    `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
                ];

                for (const gateway of gateways) {
                    try {
                        console.log(`Trying gateway: ${gateway}`);
                        const response = await fetch(gateway);
                        if (!response.ok) continue;
                        const metadata = await response.json();

                        // If we get the metadata, also transform the image URL to use a working gateway
                        if (metadata.image) {
                            const imageIpfsHash = metadata.image.split('/ipfs/')[1];
                            setImageUrl(`https://ipfs.io/ipfs/${imageIpfsHash}`);
                        }
                        break;
                    } catch (error) {
                        console.warn(`Failed to fetch from ${gateway}:`, error);
                        continue;
                    }
                }
            } catch (error) {
                console.error('Failed to fetch metadata:', error);
            }
        };

        const fetchVolume = async () => {
            try {
                // Always fetch 24h volume regardless of sorting period
                const response = await fetch(
                    `/api/price-history/${token.mintAddress}/volume?period=24h`,
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
    }, [token.metadataUrl, token.mintAddress]);

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