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
            <div className="max-w-6xl mx-auto">
                <div className="flex items-center gap-4 mb-4">
                    {imageUrl && (
                        <img
                            src={imageUrl}
                            alt={token.name}
                            className="w-16 h-16 rounded-full object-cover"
                            onError={(e) => {
                                // Fallback if image fails to load
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    )}
                    <h1 className="text-2xl font-bold">{token.name} ({token.symbol})</h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-[#232427] rounded-lg p-4 mb-4">
                        <h2 className="text-xl mb-4">Price Chart</h2>
                        <PriceChart
                            token={token}
                            width={window.innerWidth > 1024 ? 500 : window.innerWidth - 48}
                            height={300}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="bg-[#232427] rounded-lg p-4">
                            <h2 className="text-xl mb-4">Token Info</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="mb-2">Name: {token.name}</p>
                                    <p className="mb-2">Symbol: {token.symbol}</p>
                                    <p className="mb-2">Description: {token.description || 'No description available'}</p>
                                    <p className="mb-2">Total Supply: {Number(token.totalSupply) / (10 ** token.decimals)} {token.symbol}</p>
                                    <p className="mb-2">Decimals: {token.decimals}</p>
                                    <p className="mb-2">Token Type: {token.tokenType}</p>
                                    <p className="mb-2">Verified: {token.verified ? 'Yes' : 'No'}</p>
                                </div>
                                <div>
                                    <p className="mb-2">Mint Address: {token.mintAddress}</p>
                                    {token.curveAddress && (
                                        <p className="mb-2">Curve Address: {token.curveAddress}</p>
                                    )}
                                    {token.curveConfig && (
                                        <p className="mb-2">Virtual SOL: {token.curveConfig.virtualSol?.toString()}</p>
                                    )}
                                    {token.content?.metadata?.collection?.name && (
                                        <p className="mb-2">Collection: {token.content.metadata.collection.name}</p>
                                    )}
                                    {token.metadataUri && (
                                        <p className="mb-2">Metadata URI: {token.metadataUri}</p>
                                    )}
                                    <p className="mb-2">Created: {new Date(token.createdAt).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#232427] rounded-lg p-4">
                            <TradingInterface token={token} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
