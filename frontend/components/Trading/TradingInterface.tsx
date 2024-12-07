import { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve, TOKEN_DECIMALS } from '../../services/bondingCurve'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { dexService } from '../../services/dexService'
import { BN } from '@project-serum/anchor'

interface TradingInterfaceProps {
    token: TokenRecord
    onTradeComplete: () => void
}

export function TradingInterface({ token, onTradeComplete }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const { publicKey, connected } = wallet

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
    const [spotPrice, setSpotPrice] = useState<number | null>(null);

    // Add token type check
    const isDexToken = token.token_type === 'dex';

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
        if (!publicKey) return;

        try {
            const ata = await getAssociatedTokenAddress(
                new PublicKey(token.mintAddress),
                publicKey
            );

            // Check if ATA exists first
            const ataInfo = await connection.getAccountInfo(ata);

            const solBal = await connection.getBalance(publicKey);
            setSolBalance(solBal / LAMPORTS_PER_SOL);

            // Only fetch token balance if ATA exists
            if (ataInfo) {
                const tokenAccountInfo = await connection.getTokenAccountBalance(ata);
                setUserBalance(BigInt(tokenAccountInfo.value.amount));
            } else {
                setUserBalance(BigInt(0));
            }

            if (!isDexToken && bondingCurve) {
                try {
                    const [tokenVault] = PublicKey.findProgramAddressSync(
                        [Buffer.from("token_vault"), new PublicKey(token.mintAddress).toBuffer()],
                        bondingCurve.program.programId
                    );
                    const vaultInfo = await connection.getAccountInfo(tokenVault);

                    if (vaultInfo) {
                        const vaultBalance = await connection.getTokenAccountBalance(tokenVault);
                        setBondingCurveBalance(BigInt(vaultBalance.value.amount));
                    } else {
                        setBondingCurveBalance(BigInt(0));
                    }
                } catch (vaultError) {
                    console.warn('Error fetching vault balance:', vaultError);
                    setBondingCurveBalance(BigInt(0));
                }
            }
        } catch (error) {
            console.error('Error updating balances:', error);
            setError('Failed to fetch balances');
        }
    };

    // Add new effect to fetch spot price
    useEffect(() => {
        const fetchSpotPrice = async () => {
            if (isDexToken) {
                try {
                    const price = await dexService.getTokenPrice(token.mintAddress);
                    setSpotPrice(price);
                    setError(null);
                } catch (error: any) {
                    console.error('Error fetching DEX price:', error);
                    setError(error.message || 'Failed to fetch price');
                }
            } else if (bondingCurve) {
                try {
                    // Try to get price quote with a small amount first
                    const result = await bondingCurve.getPriceQuote(0.1, !isSelling);
                    setSpotPrice(result.price);
                    setError(null);
                } catch (error: any) {
                    console.error('Error fetching spot price:', error);
                    // Don't show error if it's just initialization
                    if (!error.message?.includes('could not find account')) {
                        setError('Price quote unavailable');
                    }
                    setSpotPrice(null);
                }
            }
        };

        fetchSpotPrice();
        const interval = setInterval(fetchSpotPrice, 10000);
        return () => clearInterval(interval);
    }, [bondingCurve, isDexToken, token.mintAddress, isSelling]);

    // Separate price quote calculation
    useEffect(() => {
        const updatePriceQuote = async () => {
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                setPriceInfo(null);
                return;
            }

            try {
                if (isDexToken) {
                    const price = await dexService.getTokenPrice(token.mintAddress);
                    const totalCost = price * parseFloat(amount);
                    setPriceInfo({ price, totalCost });
                } else if (bondingCurve) {
                    const quote = await bondingCurve.getPriceQuote(parseFloat(amount), !isSelling);
                    setPriceInfo(quote);
                }
                setError(null);
            } catch (error: any) {
                console.error('Error fetching price quote:', error);
                setPriceInfo(null);
                setError(error.message || 'Failed to fetch price quote');
            }
        };

        updatePriceQuote();
    }, [amount, isSelling, bondingCurve, isDexToken, token.mintAddress]);

    // Handle transaction
    const handleTransaction = async () => {
        if (!publicKey || !amount) {
            setError('Invalid transaction parameters');
            return;
        }

        try {
            setIsLoading(true);
            const parsedAmount = new BN(parseFloat(amount) * (10 ** TOKEN_DECIMALS));

            if (isDexToken) {
                // Handle DEX trading
                await dexService.executeTrade({
                    mintAddress: token.mintAddress,
                    amount: parsedAmount,
                    isSelling,
                    slippageTolerance
                });
            } else if (bondingCurve && priceInfo) {
                // Existing bonding curve logic
                if (isSelling) {
                    const minReturn = new BN(Math.floor(priceInfo.totalCost * (1 - slippageTolerance)));
                    await bondingCurve.sell({
                        amount: parsedAmount,
                        minSolReturn: minReturn
                    });
                } else {
                    const minRequired = priceInfo.totalCost + (0.01 * LAMPORTS_PER_SOL);
                    if (solBalance * LAMPORTS_PER_SOL < minRequired) {
                        throw new Error(`Insufficient SOL. Need ${(minRequired / LAMPORTS_PER_SOL).toFixed(4)} SOL (including fees)`);
                    }

                    await bondingCurve.buy({
                        amount: parsedAmount,
                        maxSolCost: priceInfo.totalCost * (1 + slippageTolerance),
                    });
                }
            }

            // Record price history for both types
            const newPrice = isDexToken
                ? await dexService.getTokenPrice(token.mintAddress)
                : (await bondingCurve?.getPriceQuote(1, !isSelling))?.price;

            if (newPrice) {
                await fetch('/api/price-history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tokenMintAddress: token.mintAddress,
                        price: newPrice,
                        totalSupply: Number(token.totalSupply.toString()) / (10 ** token.decimals)
                    })
                });
            }

            await updateBalances();
            onTradeComplete();
            setAmount('');
        } catch (error: any) {
            console.error('Transaction error:', error);
            setError(error.message || 'Transaction failed');
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

    // Add at the top of the component, after the state declarations
    useEffect(() => {
        // Load saved values
        const savedAmount = localStorage.getItem(`trade_amount_${token.mintAddress}`);
        const savedIsSelling = localStorage.getItem(`trade_isSelling_${token.mintAddress}`);

        if (savedAmount) setAmount(savedAmount);
        if (savedIsSelling) setIsSelling(savedIsSelling === 'true');
    }, [token.mintAddress]);

    // Update localStorage when values change
    useEffect(() => {
        if (amount) {
            localStorage.setItem(`trade_amount_${token.mintAddress}`, amount);
        }
        localStorage.setItem(`trade_isSelling_${token.mintAddress}`, isSelling.toString());
    }, [amount, isSelling, token.mintAddress]);

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
                                {Number(userBalance) / (10 ** TOKEN_DECIMALS)} {token.symbol}
                            </p>
                        </div>
                    </div>

                    {/* Current Price Display - Always visible */}
                    <div className="mb-4 p-3 bg-gray-50 rounded">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Current Token Price</span>
                            <span className="font-medium">
                                {spotPrice !== null
                                    ? `${spotPrice.toFixed(6)} SOL`
                                    : 'Loading...'}
                            </span>
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
                                type="text"
                                value={slippageTolerance * 100}
                                onChange={(e) => {
                                    // Allow empty string or valid numbers
                                    const value = e.target.value;
                                    if (value === '') {
                                        setSlippageTolerance(0);
                                    } else {
                                        const parsed = parseFloat(value);
                                        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                                            setSlippageTolerance(parsed / 100);
                                        }
                                    }
                                }}
                                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter slippage %"
                            />
                        </div>

                        {/* Price Information */}
                        {amount && !isNaN(parseFloat(amount)) && (
                            <div className="mb-4 p-3 bg-gray-50 rounded">
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-gray-500">
                                        {isSelling ? 'SOL You Will Receive' : 'SOL Cost'}
                                    </span>
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
                            <span className="text-sm text-gray-500">
                                {isDexToken ? 'DEX Liquidity' : 'Pool Balance'}
                            </span>
                            <span className="text-sm font-medium">
                                {isDexToken ? (
                                    `${token.liquidity?.toFixed(2) || 'Loading...'} SOL`
                                ) : (
                                    `${Number(bondingCurveBalance) / (10 ** TOKEN_DECIMALS)} ${token.symbol}`
                                )}
                            </span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
} 