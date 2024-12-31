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
        <div className="bg-[#232427] p-3 rounded-lg border border-transparent outline-none hover:border-white transition-colors">
            <Link
                to={`/token/${token.mintAddress}`}
                state={{ tokenType: 'custom' }}
                className="outline-none"
            >
                {imageUrl && (
                    <img
                        src={imageUrl}
                        alt={token.name}
                        className="w-full h-48 object-cover rounded-lg mb-3"
                        onError={(e) => {
                            console.error('Image load error for token:', token.name);
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                )}
                <h3>{token.name || 'Unnamed Token'}</h3>
                <p className="token-symbol">{token.symbol || 'UNKNOWN'}</p>
                <p className="token-mint">
                    Mint: {token.mintAddress ?
                        `${token.mintAddress.slice(0, 4)}...${token.mintAddress.slice(-4)}` :
                        'N/A'}
                </p>
                <p className="token-supply">
                    Supply: {Number(token.totalSupply) / (10 ** TOKEN_DECIMALS)} {token.symbol}
                </p>
            </Link>
        </div>
    );
} 