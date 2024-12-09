import { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve, TOKEN_DECIMALS } from '../../services/bondingCurve'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { dexService } from '../../services/dexService'
import { BN } from '@project-serum/anchor'
import { WebSocketService } from '../../services/websocketService'

interface TradingInterfaceProps {
    token: TokenRecord
}

export function TradingInterface({ token }: TradingInterfaceProps) {
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
    const [trades, setTrades] = useState<TradeHistory[]>([]);
    const wsService = WebSocketService.getInstance();

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
        // Initial fetch
        const fetchInitialData = async () => {
            if (isDexToken) {
                const dexService = DexService.getInstance();
                const price = await dexService.getTokenPrice(token.mintAddress);
                setSpotPrice(price);
            }
        };
        fetchInitialData();

        // WebSocket subscription
        if (isDexToken) {
            const unsubscribe = wsService.subscribe(token.mintAddress, (data) => {
                setSpotPrice(data.price);
                setPriceInfo(prev => prev ? { ...prev, price: data.price } : null);
                setTrades(prev => [data.trade, ...prev].slice(0, 50));
            });
            return () => unsubscribe();
        }
    }, [isDexToken, token.mintAddress]);

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

    useEffect(() => {
        const handleTrade = (trade: TradeHistory) => {
            setTrades(prev => [trade, ...prev].slice(0, 50));
        };

        wsService.subscribe(token.mintAddress, handleTrade);
        return () => wsService.unsubscribe(token.mintAddress, handleTrade);
    }, [token.mintAddress]);

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
                        <div className="p-3 bg-gray-100 border border-gray-200 rounded-md shadow-sm">
                            <p className="text-sm text-gray-700">Your SOL Balance</p>
                            <p className="text-lg font-semibold text-gray-900">{solBalance.toFixed(4)} SOL</p>
                        </div>
                        <div className="p-3 bg-gray-100 border border-gray-200 rounded-md shadow-sm">
                            <p className="text-sm text-gray-700">Your {token.symbol} Balance</p>
                            <p className="text-lg font-semibold text-gray-900">
                                {Number(userBalance) / (10 ** TOKEN_DECIMALS)} {token.symbol}
                            </p>
                        </div>
                    </div>

                    {/* Current Price Display */}
                    <div className="mb-4 p-3 bg-gray-100 border border-gray-200 rounded-md shadow-sm">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-700">Current Token Price</span>
                            <span className="font-medium text-gray-900">
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
                                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
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
                                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                                placeholder="Enter slippage %"
                            />
                        </div>

                        {/* Price Information */}
                        {amount && !isNaN(parseFloat(amount)) && (
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md shadow-sm">
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm text-blue-700">
                                        {isSelling ? 'SOL You Will Receive' : 'SOL Cost'}
                                    </span>
                                    <span className="font-medium text-blue-900">
                                        {((priceInfo?.totalCost ?? 0) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-900 rounded-md shadow-sm">
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <p className="text-sm font-medium">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* Transaction Status */}
                        {isLoading && (
                            <div className="mb-4 p-4 bg-blue-100 border border-blue-400 text-blue-900 rounded-md shadow-sm">
                                <div className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    <p className="text-sm font-medium">Processing transaction...</p>
                                </div>
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
                    <div className="mt-6 p-3 bg-gray-100 border border-gray-200 rounded-md shadow-sm">
                        <h3 className="text-sm font-medium text-gray-900 mb-2">Pool Information</h3>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-700">
                                {isDexToken ? 'DEX Liquidity' : 'Pool Balance'}
                            </span>
                            <span className="text-sm font-medium text-gray-900">
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