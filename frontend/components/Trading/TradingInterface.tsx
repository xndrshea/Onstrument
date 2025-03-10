import { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve, TOKEN_DECIMALS } from '../../services/bondingCurve'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import BN from 'bn.js'
import { DexService } from '../../services/dexService'
import { UserService } from '../../services/userService'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { getFullHeaders } from '../../utils/headers'

interface TradingInterfaceProps {
    token: TokenRecord
    currentPrice: number | null
    onPriceUpdate?: (price: number) => void
}


// Update styled component for light theme
const TerminalCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className}`}>
        {children}
    </div>
);

export function TradingInterface({ token, currentPrice: _currentPrice, onPriceUpdate }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const { publicKey, connected } = wallet
    const { setVisible } = useWalletModal()

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
    const [isUserSubscribed, setIsUserSubscribed] = useState(true)
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
            // Set up polling interval
            const interval = setInterval(updatePrice, 10000); // Poll every 10 seconds
            return () => clearInterval(interval);
        }
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

                if (!token.decimals) {
                    throw new Error('Token decimals not found');
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
                    if (!token.decimals) {
                        throw new Error('Token decimals not found');
                    }
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
                    const feeAmount = 0; // Previously: isUserSubscribed ? 0 : (solAmount * 0.01)
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

            // hello
            // Success - clear form and update balances
            setAmount('')
            setRawInput('')
            await updateBalances()

            // Record trading stats (sending SOL amount)
            await fetch(`/api/users/${publicKey.toString()}/trading-stats`, {
                method: 'POST',
                headers: await getFullHeaders(),
                body: JSON.stringify({
                    mintAddress: token.mintAddress,
                    totalVolume: isSelling ? (priceInfo?.totalCost || 0) : parseFloat(amount),
                    isSelling
                })
            });

            if (token.tokenType === 'dex') {
                // Broadcast trade
                await fetch('/api/trades/dex', {
                    method: 'POST',
                    headers: await getFullHeaders(),
                    body: JSON.stringify({
                        mintAddress: token.mintAddress,
                        price: priceInfo?.price || 0,
                        volume: priceInfo?.totalCost || 0,
                        isSell: isSelling,
                        walletAddress: publicKey.toString()
                    })
                });
            }

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
        <TerminalCard className="p-4">
            {!connected ? (
                <div className="text-center mb-4">
                    <p className="text-gray-600 mb-4">Please connect your wallet to trade</p>
                    <button
                        onClick={() => setVisible(true)}
                        className="bg-blue-500 hover:bg-blue-600 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                    >
                        Connect Wallet
                    </button>
                </div>
            ) : (
                <>
                    {/* Price Display */}
                    <div className="mb-4">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">Price (SOL)</span>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-mono text-gray-900">
                                    {spotPrice ? `${spotPrice.toFixed(6)} SOL` : 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Trading Type Selector */}
                    <div className="grid grid-cols-2 gap-1 mb-4 bg-gray-50 p-1 rounded">
                        <button
                            className={`py-2 px-4 rounded ${!isSelling ? 'bg-green-500 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                            onClick={() => setIsSelling(false)}
                        >
                            Buy
                        </button>
                        <button
                            className={`py-2 px-4 rounded ${isSelling ? 'bg-red-500 text-white' : 'text-gray-600 hover:text-gray-900'}`}
                            onClick={() => setIsSelling(true)}
                        >
                            Sell
                        </button>
                    </div>

                    {/* Amount Input */}
                    <div className="mb-4">
                        <input
                            type="text"
                            value={rawInput}
                            onChange={handleInputChange}
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded text-gray-900 font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder={`0.00 ${isSelling ? token.symbol : 'SOL'}`}
                        />
                    </div>

                    {/* Balance Display */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <span className="text-gray-600 text-sm">Available</span>
                            <div className="font-mono text-gray-900">
                                {solBalance.toFixed(4)} SOL
                            </div>
                        </div>
                        <div>
                            <span className="text-gray-600 text-sm">Balance</span>
                            <div className="font-mono text-gray-900">
                                {token.decimals ? Number(userBalance) / (10 ** token.decimals) : 'Loading...'} {token.symbol}
                            </div>
                        </div>
                    </div>

                    {/* Slippage Control */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-600 text-sm">Slippage</span>
                            <input
                                type="text"
                                value={slippageTolerance * 100}
                                onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    if (!isNaN(value)) {
                                        setSlippageTolerance(value / 100);
                                    }
                                }}
                                className="w-20 p-1 bg-gray-50 border border-gray-200 rounded text-gray-900 font-mono text-right focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Trade Button */}
                    <button
                        onClick={handleTransaction}
                        disabled={isLoading || !amount || !isTokenTradable}
                        className={`w-full py-3 rounded font-semibold ${isLoading
                            ? 'bg-gray-300 cursor-not-allowed'
                            : isSelling
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-green-500 hover:bg-green-600'
                            } text-white transition-colors duration-200`}
                    >
                        {isLoading ? 'Processing...' : `${isSelling ? 'Sell' : 'Buy'} ${token.symbol}`}
                    </button>

                    {/* Quote Display */}
                    {priceInfo && (
                        <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Expected Output</span>
                                <span className="text-gray-900 font-mono">
                                    {isSelling
                                        ? `${priceInfo.totalCost.toFixed(6)} SOL`
                                        : `${priceInfo.price.toFixed(6)} ${token.symbol}`
                                    }
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Error Display */}
                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded text-sm">
                            {error}
                        </div>
                    )}
                </>
            )}
        </TerminalCard>
    );
} 