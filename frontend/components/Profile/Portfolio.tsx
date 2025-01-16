import { useEffect, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useNavigate } from 'react-router-dom';
import { formatMarketCap, formatNumber } from '../../utils/formatting';
import { API_BASE_URL } from '../../config';

interface Asset {
    interface: string;
    id: string;
    content: {
        json_uri: string;
        files: { uri: string; cdn_uri: string }[];
        metadata: {
            name: string;
            symbol: string;
            description?: string;
        };
    };
    ownership: {
        owner: string;
    };
    creators: {
        address: string;
        share: number;
        verified: boolean;
    }[];
    marketCapUsd?: number;
    volume24h?: number;
    currentPrice?: number;
}

interface PortfolioProps {
    walletAddress: string;
}

export function Portfolio({ walletAddress }: PortfolioProps) {
    const { connection } = useConnection();
    const navigate = useNavigate();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const handleTokenClick = (asset: Asset) => {
        navigate(`/token/${asset.id}`, {
            state: { tokenType: 'nft' }
        });
    };

    useEffect(() => {
        const fetchAssets = async () => {
            try {
                const isDevnet = connection.rpcEndpoint.includes('devnet');

                const response = await fetch(`${API_BASE_URL}/helius/assets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress, isDevnet })
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();
                setAssets(data.result.items);
            } catch (err) {
                console.error('Portfolio fetch error:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch portfolio');
            } finally {
                setIsLoading(false);
            }
        };

        fetchAssets();
    }, [walletAddress, connection.rpcEndpoint]);

    if (isLoading) {
        return (
            <div className="bg-[#232427] rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Portfolio</h2>
                <div className="text-gray-400">Loading assets...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-[#232427] rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">Portfolio</h2>
                <div className="text-red-400">Error: {error}</div>
                <div className="mt-2 text-sm text-gray-400">
                    Network: {connection.rpcEndpoint.includes('devnet') ? 'Devnet' : 'Mainnet'}<br />
                    Wallet: {walletAddress}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-[#232427] rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">
                Portfolio
                <span className="text-sm font-normal text-gray-400 ml-2">
                    ({connection.rpcEndpoint.includes('devnet') ? 'Devnet' : 'Mainnet'})
                </span>
            </h2>

            {assets.length === 0 ? (
                <div className="text-gray-400">
                    No assets found in this wallet.<br />
                    <span className="text-sm">Wallet address: {walletAddress}</span>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="text-left text-sm text-gray-400">
                                <th className="px-6 py-3">Token</th>
                                <th className="px-6 py-3">Price</th>
                                <th className="px-6 py-3">Market Cap</th>
                                <th className="px-6 py-3">Volume (24h)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assets.map((asset) => (
                                <tr
                                    key={asset.id}
                                    onClick={() => handleTokenClick(asset)}
                                    className="border-t border-gray-700 hover:bg-[#2A2D31] cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {asset.content?.files?.[0]?.cdn_uri && (
                                                <img
                                                    src={asset.content.files[0].cdn_uri}
                                                    alt={asset.content.metadata.name}
                                                    className="w-8 h-8 rounded-full"
                                                />
                                            )}
                                            <div>
                                                <div className="font-medium text-white">
                                                    {asset.content.metadata.name}
                                                </div>
                                                <div className="text-sm text-gray-400">
                                                    {asset.content.metadata.symbol}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        ${formatNumber(asset.currentPrice || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {formatMarketCap(asset.marketCapUsd || null)}
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        ${formatNumber(asset.volume24h || 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
} 