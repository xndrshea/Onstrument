import { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve, TOKEN_DECIMALS } from '../../services/bondingCurve'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { BN } from '@project-serum/anchor'
import { priceClient } from '../../services/priceClient'
import { dexService } from '../../services/dexService'

interface TradeHistory {
    side: 'buy' | 'sell';
    amount: number;
    price: number;
    timestamp: number;
}

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

    // Add token type check
    const isDexToken = token.tokenType === 'dex';

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

    // Add this near the top of the component after state declarations
    useEffect(() => {
        // Verify token address and network
        console.log('Current connection endpoint:', connection.rpcEndpoint);
        console.log('Token details:', {
            mintAddress: token.mintAddress,
            symbol: token.symbol,
            tokenType: token.tokenType,
            curveAddress: token.curveAddress
        });

        // Verify wallet
        if (publicKey) {
            console.log('Connected wallet:', publicKey.toString());
        }
    }, [connection, token, publicKey]);

    // Fetch balances and price
    const updateBalances = async () => {
        if (!publicKey) return;

        try {
            // Verify the token mint account exists
            const mintInfo = await connection.getAccountInfo(new PublicKey(token.mintAddress));
            if (!mintInfo) {
                console.error('Token mint account not found!');
                setError('Invalid token mint address');
                return;
            }
            console.log('Token mint account found:', {
                space: mintInfo.data.length,
                owner: mintInfo.owner.toString()
            });

            const ata = await getAssociatedTokenAddress(
                new PublicKey(token.mintAddress),
                publicKey
            );
            console.log('Looking for ATA at:', ata.toString());

            // Get all token accounts owned by the user
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
            );

            console.log('All user token accounts:',
                tokenAccounts.value.map(ta => ({
                    mint: ta.account.data.parsed.info.mint,
                    address: ta.pubkey.toString(),
                    amount: ta.account.data.parsed.info.tokenAmount.amount
                }))
            );

            console.log('Updating balances for token:', token.mintAddress);
            const ataInfo = await connection.getAccountInfo(ata);
            const solBal = await connection.getBalance(publicKey);
            setSolBalance(solBal / LAMPORTS_PER_SOL);

            // Only fetch token balance if ATA exists
            if (ataInfo) {
                const tokenAccountInfo = await connection.getTokenAccountBalance(ata);
                console.log('User token balance:', tokenAccountInfo.value.amount);
                setUserBalance(BigInt(tokenAccountInfo.value.amount));
            } else {
                console.log('No ATA found, setting balance to 0');
                setUserBalance(BigInt(0));
            }

            // Fetch pool balance with detailed logging
            if (isDexToken) {
                console.log('Fetching DEX pool info');
                try {
                    const TOKEN_DECIMAL_MULTIPLIER = 10 ** TOKEN_DECIMALS;
                    const poolBalance = (token.liquidity || 0) * TOKEN_DECIMAL_MULTIPLIER;
                    console.log('DEX pool balance:', poolBalance);
                    setBondingCurveBalance(BigInt(poolBalance));
                } catch (error) {
                    console.error('DEX pool info error:', error);
                    setBondingCurveBalance(BigInt(0));
                }
            } else if (bondingCurve) {
                console.log('Fetching bonding curve pool info');
                try {
                    const [tokenVault] = PublicKey.findProgramAddressSync(
                        [Buffer.from("token_vault"), new PublicKey(token.mintAddress).toBuffer()],
                        bondingCurve.program.programId
                    );
                    console.log('Token vault address:', tokenVault.toString());

                    const vaultInfo = await connection.getAccountInfo(tokenVault);
                    if (vaultInfo) {
                        const vaultBalance = await connection.getTokenAccountBalance(tokenVault);
                        console.log('Vault balance:', vaultBalance.value.amount);
                        setBondingCurveBalance(BigInt(vaultBalance.value.amount));
                    } else {
                        console.log('No vault found, setting balance to 0');
                        setBondingCurveBalance(BigInt(0));
                    }
                } catch (error) {
                    console.error('Bonding curve pool info error:', error);
                    setBondingCurveBalance(BigInt(0));
                }
            }
        } catch (error) {
            console.error('Balance update error:', error);
            setError('Failed to fetch balances');
        }
    };

    // Replace the WebSocket effect with this:
    useEffect(() => {
        const updateCurrentPrice = async () => {
            try {
                if (isDexToken) {
                    console.log('Fetching DEX pool info for:', token.mintAddress);
                    const poolInfo = await dexService.getPoolInfo(token.mintAddress);
                    console.log('DEX pool info received:', poolInfo);
                    setSpotPrice(poolInfo.price);
                } else if (bondingCurve) {
                    console.log('Fetching bonding curve price for:', token.mintAddress);
                    try {
                        const quote = await bondingCurve.getPriceQuote(1, true);
                        console.log('Bonding curve quote received:', quote);
                        setSpotPrice(quote.price);
                    } catch (error: any) {
                        console.error('Detailed bonding curve error:', {
                            error,
                            message: error.message,
                            stack: error.stack
                        });
                        if (error.message.includes('not found')) {
                            console.log('New token detected, setting initial price to 0');
                            setSpotPrice(0);
                        } else {
                            setError(`Price fetch error: ${error.message}`);
                        }
                    }
                }
            } catch (error: any) {
                console.error('Price update error:', {
                    error,
                    message: error.message,
                    stack: error.stack
                });
                setError(`Failed to update price: ${error.message}`);
                setSpotPrice(0);
            }
        };

        updateCurrentPrice();
        const interval = setInterval(updateCurrentPrice, 5000);
        return () => clearInterval(interval);
    }, [isDexToken, token.mintAddress, bondingCurve]);

    // Separate price quote calculation
    useEffect(() => {
        const updatePriceQuote = async () => {
            if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                setPriceInfo(null);
                return;
            }

            try {
                if (isDexToken && spotPrice !== null) {
                    const totalCost = spotPrice * parseFloat(amount);
                    setPriceInfo({ price: spotPrice, totalCost });
                } else if (bondingCurve) {
                    try {
                        const quote = await bondingCurve.getPriceQuote(parseFloat(amount), !isSelling);
                        setPriceInfo(quote);
                        setError(null);
                    } catch (error: any) {
                        console.error('Price quote error:', error);
                        setPriceInfo(null);
                        // Only set error if it's not a "not found" error for new tokens
                        if (!error.message.includes('not found')) {
                            setError(error.message);
                        }
                    }
                }
            } catch (error: any) {
                console.error('Error fetching price quote:', error);
                setPriceInfo(null);
                setError(error.message);
            }
        };

        updatePriceQuote();
    }, [amount, isSelling, bondingCurve, isDexToken, spotPrice]);

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
                await dexService.executeTrade({
                    mintAddress: token.mintAddress,
                    amount: parsedAmount,
                    isSelling,
                    slippageTolerance
                });
            } else if (bondingCurve && priceInfo) {
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