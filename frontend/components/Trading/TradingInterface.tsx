import { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve, TOKEN_DECIMALS } from '../../services/bondingCurve'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import BN from 'bn.js'
import { DexService } from '../../services/dexService'
import { getConnectionForToken } from '../../config'
import { priceClient } from '../../services/priceClient'
import { UserService } from '../../services/userService'
import { TokenTransactionService } from '../../services/TokenTransactionService'

interface TradingInterfaceProps {
    token: TokenRecord
    currentPrice: number | null
    onPriceUpdate?: (price: number) => void
}

// Helper function to format small numbers with subscript notation
const formatSmallNumber = (num: number | null): JSX.Element | string => {
    if (num === null) return 'Loading...';
    if (typeof num !== 'number') return 'Invalid price';
    if (num === 0) return '0';

    // For very small numbers
    if (num < 0.01) {
        const numStr = num.toFixed(8);
        let zeroCount = 0;
        for (let i = 2; i < numStr.length; i++) {
            if (numStr[i] === '0') {
                zeroCount++;
            } else {
                break;
            }
        }

        // Only use subscript notation if there are more than 3 consecutive zeros
        if (zeroCount > 3) {
            const remainingDigits = numStr.slice(2 + zeroCount);
            return (
                <span>
                    0.0<sub>{zeroCount}</sub>{remainingDigits} SOL
                </span>
            );
        }
    }

    // For regular numbers
    return `${num.toFixed(4)} SOL`;
};

export function TradingInterface({ token, currentPrice: _currentPrice, onPriceUpdate }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const { publicKey, connected } = wallet

    // State management
    const [rawInput, setRawInput] = useState('');
    const [amount, setAmount] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false)
    const [isSelling, setIsSelling] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [solBalance, setSolBalance] = useState<number>(0)
    const [userBalance, setUserBalance] = useState<bigint>(BigInt(0))
    const [priceInfo, setPriceInfo] = useState<{ price: number; totalCost: number } | null>(null)
    const [slippageTolerance, setSlippageTolerance] = useState<number>(0.05)
    const [isTokenTradable, setIsTokenTradable] = useState<boolean>(true)
    const [isUserSubscribed, setIsUserSubscribed] = useState(false)
    const [isMigrating, setIsMigrating] = useState(false)
    const [spotPrice, setSpotPrice] = useState<number | null>(_currentPrice || null);

    // Create instance at component level
    const dexService = new DexService();
    const tokenService = useMemo(() => {
        if (!connected || !publicKey) return null;
        return new TokenTransactionService(wallet, connection, token);
    }, [connected, publicKey, wallet, connection, token]);

    // Now bondingCurve can use getAppropriateConnection
    const bondingCurve = useMemo(() => {
        if (!publicKey || !token.mintAddress || !token.curveAddress) {
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
    }, [publicKey, token.mintAddress, token.curveAddress, wallet, connection]);

    const checkTokenTradability = async () => {
        if (token.tokenType === 'custom') {
            // If token has curveConfig and is active, it should be tradeable via bonding curve
            if (token.curveConfig?.migrationStatus === "active") {
                setIsTokenTradable(true);
                setIsMigrating(false);
                return;
            }

            // If token is in migration status, set appropriate flags
            if (token.curveConfig?.migrationStatus === "migrated") {
                setIsMigrating(true);  // Set migrating to true
                setIsTokenTradable(false);  // Disable trading while migrating
                return;  // Exit early
            }

            // Only check Raydium if we get here
            try {
                const quote = await dexService.calculateTradePrice(
                    token.mintAddress,
                    1,
                    true,
                    connection
                );
                setIsTokenTradable(Boolean(quote && quote.price > 0));
                setIsMigrating(false);
            } catch (error) {
                setIsTokenTradable(false);
                setIsMigrating(false);
            }
        } else {
            // Handle pool tokens as before
            try {
                const quote = await dexService.calculateTradePrice(
                    token.mintAddress,
                    1,
                    true,
                    connection
                );
                setIsTokenTradable(Boolean(quote && quote.price > 0));
                setIsMigrating(false);
            } catch (error) {
                setIsTokenTradable(false);
            }
        }
    };

    const updateBalances = async () => {
        if (!publicKey) return;

        try {
            // Get SOL balance from the appropriate network
            const solBal = await connection.getBalance(publicKey);
            setSolBalance(solBal / LAMPORTS_PER_SOL);

            const ata = await getAssociatedTokenAddress(
                new PublicKey(token.mintAddress),
                publicKey
            );

            const ataInfo = await connection.getAccountInfo(ata);
            if (ataInfo) {
                const tokenAccountInfo = await connection.getTokenAccountBalance(ata);
                setUserBalance(BigInt(tokenAccountInfo.value.amount));
            } else {
                setUserBalance(BigInt(0));
            }

            // Skip spot price check if we already know token isn't tradable
            if (token.tokenType === 'dex' && isTokenTradable) {
                await checkTokenTradability();
            }
        } catch (error) {
            console.error('Balance update error:', error);
            setError('Failed to fetch balances');
        }
    };

    useEffect(() => {
        const updatePrice = async () => {
            try {
                // For custom tokens that aren't migrated, use bonding curve
                if (token.tokenType === 'custom' &&
                    token.curveConfig?.migrationStatus !== 'migrated' &&
                    bondingCurve) {
                    const spotPrice = await bondingCurve.getCurrentPrice();
                    setSpotPrice(spotPrice);
                    if (onPriceUpdate) onPriceUpdate(spotPrice);
                } else if (token.tokenType === 'dex' || token.curveConfig?.migrationStatus === 'migrated') {
                    // For DEX tokens and migrated custom tokens, use Jupiter
                    const quote = await dexService.calculateTradePrice(
                        token.mintAddress,
                        1,
                        true,
                        connection
                    );
                    if (quote) {
                        setSpotPrice(quote.price);
                        if (onPriceUpdate) onPriceUpdate(quote.price);
                    }
                }
            } catch (error) {
                console.error('Error updating price:', error);
                setSpotPrice(null);
            }
        };

        // Only run updatePrice if we have the necessary dependencies
        if (connected && publicKey) {
            updatePrice();
        }

        // Set up WebSocket subscription only for custom tokens
        let cleanupFn: (() => void) | undefined;

        if (token.tokenType === 'custom' &&
            token.curveConfig?.migrationStatus !== 'migrated' &&
            bondingCurve) {  // Add this check
            priceClient.subscribeToPrice(
                token.mintAddress,
                (update) => {
                    if (typeof update.price === 'number') {
                        setSpotPrice(update.price);
                        if (onPriceUpdate) onPriceUpdate(update.price);
                    }
                },
                'devnet'
            ).then(cleanup => {
                cleanupFn = cleanup;
            });
        }

        return () => {
            if (cleanupFn) cleanupFn();
        };
    }, [token.mintAddress, token.tokenType, token.curveConfig?.migrationStatus, bondingCurve, connected, publicKey]);

    // Price quote updates
    useEffect(() => {
        const updatePriceQuote = async () => {

            // Clear price info if input is empty or invalid
            if (!rawInput || rawInput.trim() === '') {
                setPriceInfo(null);
                return;
            }

            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                setPriceInfo(null);
                return;
            }

            try {
                // For DEX tokens and migrated custom tokens, use Jupiter
                if (token.tokenType === 'dex' ||
                    (token.tokenType === 'custom' && token.curveConfig?.migrationStatus === 'migrated')) {
                    const quote = await dexService.calculateTradePrice(
                        token.mintAddress,
                        parsedAmount,
                        isSelling,
                        connection
                    );
                    setPriceInfo(quote);
                }
                // For unmigrated custom tokens, use bonding curve
                else if (bondingCurve) {
                    const quote = await bondingCurve.getPriceQuote(parsedAmount, isSelling);
                    setPriceInfo(quote);
                }
            } catch (error: any) {
                console.error('Error fetching price quote:', error);
                setPriceInfo(null);
                setError(error.message);
            }
        };

        updatePriceQuote();
    }, [amount, rawInput, isSelling, token.tokenType, token.mintAddress]);

    // Initial balance fetch and periodic updates
    useEffect(() => {
        if (connected && publicKey) {
            updateBalances();

            const interval = setInterval(() => {
                updateBalances();
            }, 10000);

            return () => clearInterval(interval);
        }
    }, [connected, publicKey, token.mintAddress]);

    // Load saved values
    useEffect(() => {
        const savedAmount = localStorage.getItem(`trade_amount_${token.mintAddress}`)
        const savedIsSelling = localStorage.getItem(`trade_isSelling_${token.mintAddress}`)

        if (savedAmount) setAmount(savedAmount)
        if (savedIsSelling) setIsSelling(savedIsSelling === 'true')
    }, [token.mintAddress])

    // Update localStorage when values change
    useEffect(() => {
        if (amount) {
            localStorage.setItem(`trade_amount_${token.mintAddress}`, amount)
        }
        localStorage.setItem(`trade_isSelling_${token.mintAddress}`, isSelling.toString())
    }, [amount, isSelling, token.mintAddress])

    const handleTransaction = async () => {
        if (!publicKey || !amount || !wallet || !tokenService) {
            setError('Please connect your wallet')
            return
        }

        setIsLoading(true)

        try {
            if (token.tokenType === 'dex') {
                // Add balance check for DEX trades
                const parsedAmount = parseFloat(amount)
                const requiredSol = isSelling ? 0.01 : parsedAmount + 0.01 // Add 0.01 SOL buffer for fees

                if (!isSelling && solBalance < requiredSol) {
                    throw new Error(`Insufficient SOL. Need at least ${requiredSol.toFixed(4)} SOL (including fees)`)
                }

                await dexService.executeTrade({
                    mintAddress: token.mintAddress,
                    amount: new BN(parseFloat(amount) * (isSelling ? (10 ** token.decimals) : LAMPORTS_PER_SOL)),
                    isSelling,
                    slippageTolerance,
                    wallet,
                    connection: connection,
                    isSubscribed: isUserSubscribed
                })
            } else if (bondingCurve && priceInfo) {
                if (isSelling) {
                    // Selling uses token amounts
                    const parsedAmount = new BN(parseFloat(amount) * (10 ** token.decimals))
                    const minReturn = new BN(Math.floor(priceInfo.totalCost * (1 - slippageTolerance)))
                    await bondingCurve.sell({
                        amount: parsedAmount,
                        minSolReturn: minReturn,
                        isSubscribed: isUserSubscribed,
                        slippageTolerance
                    })
                } else {
                    // Buying uses SOL amounts
                    const solAmount = parseFloat(amount)
                    const feeAmount = isUserSubscribed ? 0 : (solAmount * 0.01) // 100 BPS = 1%
                    const minRequired = solAmount + feeAmount + 0.001 // Add 0.001 SOL for rent/gas
                    if (solBalance < minRequired) {
                        throw new Error(`Insufficient SOL. Need ${minRequired.toFixed(4)} SOL (including fees)`)
                    }
                    await bondingCurve.buyWithSol({
                        solAmount,
                        slippageTolerance,
                        isSubscribed: isUserSubscribed
                    })
                }
            }

            // Success - clear form and update balances
            setAmount('')
            setRawInput('')
            await updateBalances()

        } catch (error: any) {
            console.error('Transaction error:', error)
            setError(error.message || 'Transaction failed')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
    }, [token.tokenType, token.tokenType === 'dex', isTokenTradable, token.decimals]);

    // Update price display to use currentPrice prop
    useEffect(() => {
        if (token.tokenType === 'dex') {
            // For DEX tokens, get initial price quote
            const getInitialPrice = async () => {
                try {
                    const quote = await dexService.calculateTradePrice(
                        token.mintAddress,
                        1,
                        true,  // isSelling
                        connection
                    );
                    if (quote) {
                        const price = quote.price;
                        setSpotPrice(price);
                        if (onPriceUpdate) {
                            onPriceUpdate(price);
                        }
                    }
                } catch (error) {
                    console.error('Error getting initial price:', error);
                }
            };

            getInitialPrice();
            const interval = setInterval(getInitialPrice, 10000);
            return () => clearInterval(interval);
        }
    }, [token.mintAddress, token.tokenType]);

    useEffect(() => {
        async function checkSubscription() {
            if (publicKey) {
                const user = await UserService.getUser(publicKey.toString());
                setIsUserSubscribed(user?.isSubscribed || false);
            }
        }
        checkSubscription();
    }, [publicKey]);

    // Add this useEffect to check tradability when component mounts
    useEffect(() => {
        if (connected && publicKey) {
            checkTokenTradability();
        }
    }, [connected, publicKey, token.mintAddress]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Allow empty string or valid numbers only
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setRawInput(value);
            // Only update amount if it's a valid number
            if (value && !isNaN(parseFloat(value))) {
                setAmount(value);
            }
        }
    };

    return (
        <div className="p-4 bg-[#1a1b1f] rounded-lg">
            {!connected && (
                <div className="text-center mb-4">
                    <p className="text-gray-400 mb-2">Connect your wallet to trade</p>
                    <WalletMultiButton />
                </div>
            )}

            {connected && (
                <>
                    {/* Balance Information */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-4 bg-[#1e2025] rounded-lg">
                            <p className="text-gray-400 text-[14px]">Your SOL Balance</p>
                            <p className="text-white text-[20px]">{solBalance.toFixed(4)} SOL</p>
                        </div>
                        <div className="p-4 bg-[#1e2025] rounded-lg">
                            <p className="text-gray-400 text-[14px]">Your {token.symbol} Balance</p>
                            <p className="text-white text-[20px]">
                                {Number(userBalance) / (10 ** token.decimals)} {token.symbol}
                            </p>
                        </div>
                    </div>

                    {/* Current Price Display */}
                    <div className="mb-4 p-4 bg-[#1e2025] rounded-lg">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-[14px]">Current Token Price</span>
                            <span className="text-white text-[20px]">
                                {spotPrice !== null ? formatSmallNumber(spotPrice) : 'Loading...'}
                            </span>
                        </div>
                    </div>

                    {/* Buy/Sell Toggle */}
                    <div className="flex mb-4">
                        <button
                            className={`flex-1 py-2 text-[16px] ${!isSelling ? 'bg-[#22c55e] text-white' : 'bg-white text-[#1a1b1f]'}`}
                            onClick={() => setIsSelling(false)}
                            disabled={!isTokenTradable || isLoading || isMigrating}
                        >
                            Buy
                        </button>
                        <button
                            className={`flex-1 py-2 text-[16px] ${isSelling ? 'bg-[#ef4444] text-white' : 'bg-white text-[#1a1b1f]'}`}
                            onClick={() => setIsSelling(true)}
                            disabled={!isTokenTradable || isLoading || isMigrating}
                        >
                            Sell
                        </button>
                    </div>

                    {/* Amount Input */}
                    <div className="mb-4">
                        <label className="block text-gray-400 text-[14px] mb-2">
                            Amount ({isSelling ? token.symbol : 'SOL'})
                        </label>
                        <input
                            type="text"
                            value={rawInput}
                            onChange={handleInputChange}
                            className="w-full p-3 bg-white rounded-lg text-[#1a1b1f] text-[16px]"
                            placeholder={`Enter amount in ${isSelling ? token.symbol : 'SOL'}`}
                            disabled={!isTokenTradable || isLoading}
                        />
                    </div>

                    {/* Slippage Tolerance Input */}
                    <div className="mb-4">
                        <label className="block text-gray-400 text-[14px] mb-2">
                            Slippage Tolerance (%)
                        </label>
                        <input
                            type="text"
                            value={slippageTolerance * 100}
                            onChange={(e) => {
                                const value = e.target.value
                                if (value === '') {
                                    setSlippageTolerance(0)
                                } else {
                                    const parsed = parseFloat(value)
                                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
                                        setSlippageTolerance(parsed / 100)
                                    }
                                }
                            }}
                            className="w-full p-3 bg-white rounded-lg text-[#1a1b1f] text-[16px]"
                            placeholder="Enter slippage %"
                            disabled={!isTokenTradable || isLoading}
                        />
                    </div>

                    {/* Trade Button */}
                    <button
                        className={`w-full py-3 rounded-lg text-[16px] ${isLoading || !isTokenTradable
                            ? 'bg-gray-600 cursor-not-allowed'
                            : isSelling
                                ? 'bg-[#ef4444] hover:bg-[#dc2626] text-white'
                                : 'bg-[#22c55e] hover:bg-[#16a34a] text-white'
                            }`}
                        onClick={handleTransaction}
                        disabled={isLoading || !amount || isNaN(parseFloat(amount)) || !isTokenTradable}
                    >
                        {isLoading ? (
                            <span>Processing...</span>
                        ) : (
                            <span>{isSelling ? `Sell ${token.symbol}` : `Buy ${token.symbol}`}</span>
                        )}
                    </button>

                    {/* Price Quote Display */}
                    {priceInfo && amount && amount.trim() !== '' && parseFloat(amount) > 0 && (
                        <>
                            <div className="mt-4 p-3 bg-[#1e2025] rounded-lg">
                                <p className="text-gray-400 text-[14px]">
                                    {isSelling ? 'You will receive' : 'You will receive'}
                                </p>
                                <p className="text-white text-[20px]">
                                    {isSelling
                                        ? `${priceInfo.totalCost.toString()} SOL`
                                        : `${priceInfo.price.toString()} ${token.symbol}`
                                    }
                                </p>
                            </div>
                        </>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="mt-4 p-3 bg-red-900/20 border border-red-500 text-red-400 rounded-lg text-[14px]">
                            {error}
                        </div>
                    )}
                </>
            )}
        </div>
    )
} 