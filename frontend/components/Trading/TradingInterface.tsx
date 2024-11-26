import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { formatSupply } from '../../utils/formatting'
import { getProgramErrorMessage } from '../../types/errors'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve } from '../../services/bondingCurve'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'

interface TradingInterfaceProps {
    token: TokenRecord
    onTradeComplete: () => void
}

const MAX_SLIPPAGE = 0.05 // 5% slippage tolerance

export function TradingInterface({ token, onTradeComplete }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const { publicKey, connected } = wallet

    // State management
    const [amount, setAmount] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [isSelling, setIsSelling] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')
    const [error, setError] = useState<string | null>(null)
    const [solBalance, setSolBalance] = useState<number>(0)
    const [userBalance, setUserBalance] = useState<bigint>(BigInt(0))
    const [bondingCurveBalance, setBondingCurveBalance] = useState<bigint>(BigInt(0))
    const [currentPrice, setCurrentPrice] = useState<number>(0)
    const [totalCost, setTotalCost] = useState<number>(0)
    const [slippageWarning, setSlippageWarning] = useState(false)

    // Initialize local interface for interacting with the bonding curve program
    const bondingCurve = useMemo(() => {
        if (!connection || !wallet || !wallet.publicKey || !token.mint_address) {
            return null;
        }

        try {
            return new BondingCurve(
                connection,
                wallet,
                new PublicKey(token.mint_address),
                new PublicKey(token.curve_address)
            );
        } catch (error) {
            console.error('Error creating bonding curve interface:', error);
            setError('Failed to initialize trading interface');
            return null;
        }
    }, [connection, wallet, token.mint_address, token.curve_address]);

    // Update balances and price info
    const updateBalances = useCallback(async () => {
        if (!publicKey || !bondingCurve) return;

        try {
            setError(null);

            // Get the user's Associated Token Account (ATA) address
            const ata = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            const [solBal, tokenAccountInfo, priceInfo] = await Promise.all([
                connection.getBalance(publicKey),
                connection.getTokenAccountBalance(ata),
                bondingCurve.getPriceQuote(1_000_000, true)
            ]);

            setSolBalance(solBal / LAMPORTS_PER_SOL);
            setUserBalance(BigInt(tokenAccountInfo.value.amount));
            setCurrentPrice(priceInfo.price);

            const [tokenVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("token_vault"), new PublicKey(token.mint_address).toBuffer()],
                new PublicKey("DCdi7f8kPoeYRciGUnVCrdaZqrFP5HhMqJUhBVEsXSCw") // Program ID from IDL
            );

            const balance = await connection.getTokenAccountBalance(tokenVault);
            setBondingCurveBalance(BigInt(balance.value.amount));
        } catch (error) {
            console.error('Error updating balances:', error);
            setError('Failed to fetch current balances. Please try again.');
            setSolBalance(0);
            setUserBalance(BigInt(0));
            setCurrentPrice(0);
            setBondingCurveBalance(BigInt(0));
        }
    }, [publicKey, bondingCurve, connection, token.mint_address]);

    // Handle price updates when amount changes
    useEffect(() => {
        if (!bondingCurve || !amount || isNaN(parseFloat(amount))) {
            setTotalCost(0);
            setCurrentPrice(0);
            setSlippageWarning(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const parsedAmount = parseFloat(amount) * 1e9;
                if (parsedAmount <= 0) {
                    setError('Please enter a positive amount');
                    return;
                }

                const priceInfo = await bondingCurve.getPriceQuote(parsedAmount, !isSelling);
                setTotalCost(priceInfo.price);
                setCurrentPrice(priceInfo.price / parsedAmount);

                const priceImpact = Math.abs(priceInfo.supplyDelta) / parsedAmount;
                setSlippageWarning(priceImpact > MAX_SLIPPAGE);
                setError(null);
            } catch (error) {
                console.error('Error fetching price:', error);
                setError(getProgramErrorMessage(error));
                setTotalCost(0);
                setCurrentPrice(0);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [amount, bondingCurve, isSelling]);

    // Handle transaction execution
    const handleTransaction = async (operation: 'buy' | 'sell', amount: string) => {
        if (!publicKey || !amount || !bondingCurve) {
            setError('Please connect your wallet and enter an amount');
            return;
        }

        const parsedAmount = parseFloat(amount) * 1e9;
        if (parsedAmount <= 0) {
            setError('Please enter a positive amount');
            return;
        }

        if (operation === 'buy' && totalCost > solBalance * LAMPORTS_PER_SOL) {
            setError('Insufficient SOL balance');
            return;
        }

        if (operation === 'sell' && parsedAmount > Number(userBalance)) {
            setError('Insufficient token balance');
            return;
        }

        try {
            setError(null);
            setIsLoading(true);
            setTransactionStatus(`Preparing ${operation}...`);

            let signature;
            if (operation === 'buy') {
                signature = await bondingCurve.buy({
                    amount: parsedAmount,
                    maxSolCost: totalCost * (1 + MAX_SLIPPAGE)
                });
            } else {
                signature = await bondingCurve.sell({
                    amount: parsedAmount,
                    minSolReturn: totalCost * (1 - MAX_SLIPPAGE)
                });
            }

            setTransactionStatus('Confirming transaction...');
            await connection.confirmTransaction(signature, 'confirmed');

            setTransactionStatus('Transaction successful!');
            await updateBalances();
            onTradeComplete();

        } catch (error) {
            console.error(`${operation} failed:`, error);
            setError(getProgramErrorMessage(error));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 bg-white rounded-lg shadow">
            {/* Connection Status */}
            {!connected && (
                <div className="text-center mb-4">
                    <p className="text-gray-600 mb-2">Connect your wallet to trade</p>
                    <WalletMultiButton />
                </div>
            )}

            {connected && (
                <>
                    {/* Balance Information */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 bg-gray-50 rounded">
                            <p className="text-sm text-gray-500">Your SOL Balance</p>
                            <p className="text-lg font-semibold">{solBalance.toFixed(4)} SOL</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded">
                            <p className="text-sm text-gray-500">Your {token.symbol} Balance</p>
                            <p className="text-lg font-semibold">
                                {formatSupply(userBalance)}
                            </p>
                        </div>
                    </div>

                    {/* Trading Interface */}
                    <div className="mb-4">
                        {/* Buy/Sell Toggle */}
                        <div className="flex mb-4">
                            <button
                                className={`flex-1 py-2 px-4 text-center ${!isSelling
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700'
                                    }`}
                                onClick={() => setIsSelling(false)}
                            >
                                Buy
                            </button>
                            <button
                                className={`flex-1 py-2 px-4 text-center ${isSelling
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700'
                                    }`}
                                onClick={() => setIsSelling(true)}
                            >
                                Sell
                            </button>
                        </div>

                        {/* Amount Input */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Amount ({token.symbol})
                            </label>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter amount"
                                disabled={isLoading}
                            />
                        </div>

                        {/* Price Information */}
                        {amount && !isNaN(parseFloat(amount)) && (
                            <div className="mb-4 p-3 bg-gray-50 rounded">
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-gray-500">Current Price</span>
                                    <span className="font-medium">
                                        {(currentPrice / LAMPORTS_PER_SOL).toFixed(4)} SOL
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Total Cost</span>
                                    <span className="font-medium">
                                        {(totalCost / LAMPORTS_PER_SOL).toFixed(4)} SOL
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Slippage Warning */}
                        {slippageWarning && (
                            <div className="mb-4 p-3 bg-yellow-50 text-yellow-700 rounded">
                                <p className="text-sm">
                                    Warning: This trade may have high price impact due to limited liquidity
                                </p>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">
                                <p className="text-sm">{error}</p>
                            </div>
                        )}

                        {/* Transaction Status */}
                        {transactionStatus && (
                            <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded">
                                <p className="text-sm">{transactionStatus}</p>
                            </div>
                        )}

                        {/* Trade Button */}
                        <button
                            className={`w-full py-2 px-4 rounded font-medium ${isLoading
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                            onClick={() => handleTransaction(isSelling ? 'sell' : 'buy', amount)}
                            disabled={isLoading || !amount || isNaN(parseFloat(amount))}
                        >
                            {isLoading ? (
                                <span>Processing...</span>
                            ) : (
                                <span>{isSelling ? 'Sell' : 'Buy'} {token.symbol}</span>
                            )}
                        </button>
                    </div>

                    {/* Pool Information */}
                    <div className="mt-6 p-3 bg-gray-50 rounded">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Pool Information</h3>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Pool Balance</span>
                            <span className="text-sm font-medium">
                                {formatSupply(bondingCurveBalance)} {token.symbol}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
} 