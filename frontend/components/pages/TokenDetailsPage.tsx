import { useParams, useLocation } from 'react-router-dom';
import { TradingInterface } from '../Trading/TradingInterface';
import { PriceChart } from '../Trading/PriceChart';
import { useEffect, useState, useMemo } from 'react';
import { TokenRecord } from '../../../shared/types/token';
import { tokenService } from '../../services/tokenService';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { BondingCurve } from '../../services/bondingCurve';
import { PublicKey } from '@solana/web3.js';
import { priceClient } from '../../services/priceClient';

export function TokenDetailsPage() {
    const { mintAddress } = useParams();
    const location = useLocation();
    const tokenType = location.state?.tokenType;
    const [token, setToken] = useState<TokenRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { connection } = useConnection();
    const wallet = useWallet();

    // Initialize bonding curve
    const bondingCurve = useMemo(() => {
        if (!connection || !wallet.publicKey || !token?.mintAddress || !token?.curveAddress) {
            return null;
        }

        try {
            return new BondingCurve(
                connection,
                wallet,
                new PublicKey(token.mintAddress),
                new PublicKey(token.curveAddress)
            );
        } catch (error) {
            console.error('Error creating bonding curve interface:', error);
            return null;
        }
    }, [connection, wallet, token]);

    useEffect(() => {
        if (mintAddress) {
            setLoading(true);
            tokenService.getByMintAddress(mintAddress, tokenType)
                .then(token => {
                    if (token) {
                        setToken(token);
                    } else {
                        setError('Token not found');
                    }
                    setLoading(false);
                })
                .catch(error => {
                    setError(error.message);
                    setLoading(false);
                });
        }
    }, [mintAddress, tokenType]);

    if (loading) return <div className="p-4 text-white">Loading...</div>;
    if (error) return <div className="p-4 text-white">Error: {error}</div>;
    if (!token) return <div className="p-4 text-white">Token not found</div>;

    return (
        <div className="p-4 text-white">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold mb-4">{token.name} ({token.symbol})</h1>

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
                            <p className="mb-2">Description: {token.description}</p>
                            <p className="mb-2">Total Supply: {Number(token.totalSupply) / (10 ** token.decimals)} {token.symbol}</p>
                            <p>Mint Address: {token.mintAddress}</p>
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
