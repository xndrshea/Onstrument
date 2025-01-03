import { useParams, useLocation } from 'react-router-dom';
import { TradingInterface } from '../Trading/TradingInterface';
import { PriceChart } from '../Trading/PriceChart';
import { useEffect, useState } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { tokenService } from '../../services/tokenService';
import { priceClient } from '../../services/priceClient';

export function TokenDetailsPage() {
    const { mintAddress } = useParams();
    const location = useLocation();
    const tokenType = location.state?.tokenType || 'pool';
    const [token, setToken] = useState<TokenRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTokenInfoExpanded, setIsTokenInfoExpanded] = useState(false);

    useEffect(() => {
        if (!mintAddress) {
            setError('No mint address provided');
            return;
        }

        setLoading(true);
        console.log('Fetching token details for mintAddress:', mintAddress, 'type:', tokenType);

        tokenService.getByMintAddress(mintAddress, tokenType)
            .then(tokenData => {
                if (!tokenData) {
                    throw new Error('Token not found');
                }
                console.log('Token data received:', tokenData);

                // Validate required fields
                if (!tokenData.mintAddress) {
                    throw new Error(`Invalid token data: missing mintAddress for ${tokenData.name}`);
                }

                setToken(tokenData);
                setLoading(false);
            })
            .catch(error => {
                console.error('Error fetching token:', error);
                setError(error.message);
                setLoading(false);
            });
    }, [mintAddress, tokenType]);

    if (loading) return <div className="p-4 text-white">Loading...</div>;
    if (error) return <div className="p-4 text-white">Error: {error}</div>;
    if (!token) return <div className="p-4 text-white">Token not found</div>;

    // Get image URL from content metadata
    const imageUrl = token.content?.metadata?.image || token.imageUrl;

    return (
        <div className="p-4 text-white">
            <div className="max-w-[1920px] mx-auto">
                <div className="flex items-center gap-4 mb-4">
                    {imageUrl && (
                        <img
                            src={imageUrl}
                            alt={token.name}
                            className="w-16 h-16 rounded-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                    <h1 className="text-2xl font-bold">{token.name} ({token.symbol})</h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                    <div className="bg-[#232427] rounded-lg p-4">
                        <TradingInterface token={token} />
                    </div>

                    <div className="space-y-6">
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Price Chart</h2>
                            <PriceChart
                                token={token}
                                width={window.innerWidth > 1024 ? window.innerWidth - 500 : window.innerWidth - 48}
                                height={400}
                            />
                        </div>

                        <div className="bg-[#232427] rounded-lg p-4 hover:bg-[#2a2b2f] transition-colors duration-200">
                            <button
                                onClick={() => setIsTokenInfoExpanded(!isTokenInfoExpanded)}
                                className="w-full flex justify-between items-center text-xl font-medium text-gray-200 hover:text-white transition-colors duration-200"
                            >
                                <div className="flex items-center gap-2">
                                    <span>Token Info</span>
                                    <span className="text-sm text-gray-400 font-normal">Click to {isTokenInfoExpanded ? 'collapse' : 'expand'}</span>
                                </div>
                                <span className="text-2xl text-gray-400 hover:text-white transition-colors duration-200">
                                    {isTokenInfoExpanded ? '−' : '+'}
                                </span>
                            </button>

                            {isTokenInfoExpanded && (
                                <div className="grid grid-cols-2 gap-4 mt-4 text-gray-300">
                                    <div className="space-y-3">
                                        <p>Name: <span className="text-white">{token.name}</span></p>
                                        <p>Symbol: <span className="text-white">{token.symbol}</span></p>
                                        <p>Description: <span className="text-white">{token.description || 'No description available'}</span></p>
                                        <p>Total Supply: <span className="text-white">{Number(token.totalSupply) / (10 ** token.decimals)} {token.symbol}</span></p>
                                        <p>Decimals: <span className="text-white">{token.decimals}</span></p>
                                        <p>Token Type: <span className="text-white">{token.tokenType}</span></p>
                                        <p>Verified: <span className="text-white">{token.verified ? 'Yes' : 'No'}</span></p>
                                    </div>
                                    <div className="space-y-3">
                                        <p>Mint Address: <span className="text-white">{token.mintAddress}</span></p>
                                        {token.curveAddress && (
                                            <p>Curve Address: <span className="text-white">{token.curveAddress}</span></p>
                                        )}
                                        {token.content?.metadata?.collection?.name && (
                                            <p>Collection: <span className="text-white">{token.content.metadata.collection.name}</span></p>
                                        )}
                                        {token.metadataUri && (
                                            <p>Metadata URI: <span className="text-white">{token.metadataUri}</span></p>
                                        )}
                                        <p>Created: <span className="text-white">{new Date(token.createdAt).toLocaleString()}</span></p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
