import { Link } from 'react-router-dom'
import { TokenRecord } from '../../../shared/types/token'
import { TOKEN_DECIMALS } from '../../services/bondingCurve'
import { useState, useEffect } from 'react'

interface TokenCardProps {
    token: TokenRecord
}

interface TokenMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    attributes: any[];
}

export function TokenCard({ token }: TokenCardProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        const fetchMetadata = async () => {
            if (!token.metadataUri) return;

            try {
                const response = await fetch(token.metadataUri);
                const metadata: TokenMetadata = await response.json();
                setImageUrl(metadata.image);
            } catch (error) {
                console.error('Error fetching metadata for token:', token.name, error);
            }
        };

        fetchMetadata();
    }, [token.metadataUri, token.name]);

    return (
        <div className="bg-[#232427] rounded-lg border border-transparent hover:border-gray-700 transition-colors">
            <Link
                to={`/token/${token.mintAddress}`}
                state={{ tokenType: 'custom' }}
                className="flex p-6 gap-6"
            >
                {/* Image container */}
                <div className="w-40 h-40 md:w-48 md:h-48 flex-shrink-0">
                    {imageUrl && (
                        <img
                            src={imageUrl}
                            alt={token.name}
                            className="w-full h-full object-contain rounded-md"
                            onError={(e) => {
                                console.error('Image load error for token:', token.name);
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                </div>

                {/* Content container */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-medium truncate">{token.name || 'Unnamed Token'}</h3>
                        <span className="text-gray-400 text-sm">({token.symbol || 'UNKNOWN'})</span>
                    </div>

                    <p className="text-sm text-gray-400 line-clamp-2 mb-2">
                        {token.description || 'No description available'}
                    </p>

                </div>
            </Link>
        </div>
    );
} 