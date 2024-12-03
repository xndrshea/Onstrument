import { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { formatSupply } from '../../utils/formatting'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve } from '../../services/bondingCurve'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { BN } from '@project-serum/anchor';

// Program-specific error codes from IDL
const ERROR_CODES = {
    SLIPPAGE_EXCEEDED: 6000,
    INSUFFICIENT_LIQUIDITY: 6001,
    MATH_OVERFLOW: 6002,
    PRICE_EXCEEDS_MAX_COST: 6003,
    PRICE_BELOW_MIN_RETURN: 6004,
    // ... other error codes as needed
} as const;

interface TradingInterfaceProps {
    token: TokenRecord
    onTradeComplete: () => void
}

export function TradingInterface({ token, onTradeComplete }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const { publicKey, connected, sendTransaction } = wallet

    // State management
    const [amount, setAmount] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [isSelling, setIsSelling] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [solBalance, setSolBalance] = useState<number>(0)
    const [userBalance, setUserBalance] = useState<bigint>(BigInt(0))
    const [bondingCurveBalance, setBondingCurveBalance] = useState<bigint>(BigInt(0))
    const [priceInfo, setPriceInfo] = useState<{ price: number; totalCost: number } | null>(null)
    const [slippageTolerance, setSlippageTolerance] = useState<number>(0.05); // Default 5%

    // Initialize bonding curve interface
    const bondingCurve = useMemo(() => {
        if (!connection || !publicKey || !token.mintAddress || !token.curveAddress) {
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
    }, [connection, publicKey, token.mintAddress, token.curveAddress, wallet]);

    // Fetch balances and price
    const updateBalances = async () => {
        if (!publicKey || !bondingCurve) return;

        try {
            const [tokenVault] = PublicKey.findProgramAddressSync(
                [Buffer.from("token_vault"), new PublicKey(token.mintAddress).toBuffer()],
                bondingCurve.program.programId
            );

            const ata = await getAssociatedTokenAddress(
                new PublicKey(token.mintAddress),
                publicKey
            );

            const [solBal, tokenAccountInfo, vaultBalance] = await Promise.all([
                connection.getBalance(publicKey),
                connection.getTokenAccountBalance(ata).catch(() => ({ value: { amount: '0', decimals: 9 } })),
                connection.getTokenAccountBalance(tokenVault)
            ]);

            setSolBalance(solBal / LAMPORTS_PER_SOL);
            setUserBalance(BigInt(tokenAccountInfo.value.amount));
            setBondingCurveBalance(BigInt(vaultBalance.value.amount));
        } catch (error) {
            console.error('Error updating balances:', error);
            setError('Failed to fetch balances');
        }
    };

    // Update price when amount changes
    useEffect(() => {
        const updatePrice = async () => {
            if (!bondingCurve || !amount || isNaN(parseFloat(amount))) {
                setPriceInfo(null);
                return;
            }

            try {
                const quote = await bondingCurve.getPriceQuote(
                    parseFloat(amount),
                    !isSelling
                );

                setPriceInfo({
                    price: quote.price,
                    totalCost: quote.price * LAMPORTS_PER_SOL
                });
                setError(null);
            } catch (error) {
                console.error('Error fetching price:', error);
                setPriceInfo(null);
                setError('Failed to fetch price');
            }
        };

        updatePrice();
    }, [amount, isSelling, bondingCurve, token.mintAddress, token.curveAddress]);

    // Handle transaction
    const handleTransaction = async () => {
        if (!publicKey || !amount || !bondingCurve || !priceInfo) {
            setError('Invalid transaction parameters');
            return;
        }

        try {
            setIsLoading(true);
            const parsedAmount = new BN(parseFloat(amount) * 1e9);

            if (isSelling) {
                const minSolReturn = new BN(Math.floor(priceInfo.totalCost * (1 - slippageTolerance)));
                await bondingCurve.sell({ amount: parsedAmount, minSolReturn });
            } else {
                const maxSolCost = new BN(Math.ceil(priceInfo.totalCost * (1 + slippageTolerance)));
                await bondingCurve.buy({ amount: parsedAmount, maxSolCost });
            }

            await updateBalances();
            onTradeComplete();
            setAmount('');
        } catch (error: any) {
            console.error('Transaction failed:', error);
            // Handle program-specific errors
            if (error.code === ERROR_CODES.SLIPPAGE_EXCEEDED) {
                setError('Price changed too much during transaction');
            } else if (error.code === ERROR_CODES.INSUFFICIENT_LIQUIDITY) {
                setError('Insufficient liquidity in pool');
            } else {
                setError('Transaction failed');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Initial balance fetch
    useEffect(() => {
        if (connected && publicKey) {
            updateBalances();
        }
    }, [connected, publicKey]);

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

                        {/* Slippage Tolerance Input */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Slippage Tolerance (%)
                            </label>
                            <input
                                type="number"
                                value={slippageTolerance * 100}
                                onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    if (!isNaN(value) && value >= 0 && value <= 100) {
                                        setSlippageTolerance(value / 100);
                                    }
                                }}
                                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter slippage %"
                                min="0"
                                max="100"
                                step="0.1"
                            />
                        </div>

                        {/* Price Information */}
                        {amount && !isNaN(parseFloat(amount)) && (
                            <div className="mb-4 p-3 bg-gray-50 rounded">
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-gray-500">Current Price</span>
                                    <span className="font-medium">
                                        {((priceInfo?.price ?? 0) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-gray-500">Total Cost</span>
                                    <span className="font-medium">
                                        {((priceInfo?.totalCost ?? 0) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">
                                <p className="text-sm">{error}</p>
                            </div>
                        )}

                        {/* Transaction Status */}
                        {isLoading && (
                            <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded">
                                <p className="text-sm">Processing transaction...</p>
                            </div>
                        )}

                        {/* Trade Button */}
                        <button
                            className={`w-full py-2 px-4 rounded font-medium ${isLoading
                                ? 'bg-gray-300 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                            onClick={handleTransaction}
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