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


// Add new styled components for the terminal look
const TerminalCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
    <div className={`bg-[#1E222D] border border-gray-800 rounded-lg ${className}`}>
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

            // hello
            // Success - clear form and update balances
            setAmount('')
            setRawInput('')
            await updateBalances()

            // Record trading stats (sending SOL amount, conversion happens in backend)
            await fetch(`/api/users/${publicKey.toString()}/trading-stats`, {
                method: 'POST',
                headers: await getFullHeaders(),
                body: JSON.stringify({
                    mintAddress: token.mintAddress,
                    totalVolume: parseFloat(amount),
                    isSelling
                })
            });

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
        <TerminalCard className="p-4">
            {!connected ? (
                <div className="text-center mb-4">
                    <p className="text-gray-400 mb-4">Please connect your wallet to trade</p>
                    <button
                        onClick={() => setVisible(true)}
                        className="bg-purple-600 hover:bg-purple-700 transition-colors duration-200 rounded-lg px-4 py-2 text-sm font-medium text-white"
                    >
                        Connect Wallet
                    </button>
                </div>
            ) : (
                <>
                    {/* Price Display - Terminal Style */}
                    <div className="mb-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[#808591] text-sm">Price (SOL)</span>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-mono text-white">
                                    {spotPrice ? `${spotPrice.toFixed(6)} SOL` : 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Trading Type Selector */}
                    <div className="grid grid-cols-2 gap-1 mb-4 bg-[#2C3038] p-1 rounded">
                        <button
                            className={`py-2 px-4 rounded ${!isSelling ? 'bg-[#22C55E] text-white' : 'text-gray-400 hover:text-white'}`}
                            onClick={() => setIsSelling(false)}
                        >
                            Buy
                        </button>
                        <button
                            className={`py-2 px-4 rounded ${isSelling ? 'bg-[#EF4444] text-white' : 'text-gray-400 hover:text-white'}`}
                            onClick={() => setIsSelling(true)}
                        >
                            Sell
                        </button>
                    </div>

                    {/* Amount Input - Terminal Style */}
                    <div className="mb-4">
                        <input
                            type="text"
                            value={rawInput}
                            onChange={handleInputChange}
                            className="w-full p-3 bg-[#2C3038] border border-gray-700 rounded text-white font-mono"
                            placeholder={`0.00 ${isSelling ? token.symbol : 'SOL'}`}
                        />
                    </div>

                    {/* Balance Display - Terminal Style */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <span className="text-[#808591] text-sm">Available</span>
                            <div className="font-mono text-white">
                                {solBalance.toFixed(4)} SOL
                            </div>
                        </div>
                        <div>
                            <span className="text-[#808591] text-sm">Balance</span>
                            <div className="font-mono text-white">
                                {token.decimals ? Number(userBalance) / (10 ** token.decimals) : 'Loading...'} {token.symbol}
                            </div>
                        </div>
                    </div>

                    {/* Slippage Control - Terminal Style */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[#808591] text-sm">Slippage</span>
                            <input
                                type="text"
                                value={slippageTolerance * 100}
                                onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    if (!isNaN(value)) {
                                        setSlippageTolerance(value / 100);
                                    }
                                }}
                                className="w-20 p-1 bg-[#2C3038] border border-gray-700 rounded text-white font-mono text-right"
                            />
                        </div>
                    </div>

                    {/* Trade Button - Terminal Style */}
                    <button
                        onClick={handleTransaction}
                        disabled={isLoading || !amount || !isTokenTradable}
                        className={`w-full py-3 rounded font-semibold ${isLoading
                            ? 'bg-gray-600 cursor-not-allowed'
                            : isSelling
                                ? 'bg-[#EF4444] hover:bg-[#DC2626]'
                                : 'bg-[#22C55E] hover:bg-[#16A34A]'
                            } text-white`}
                    >
                        {isLoading ? 'Processing...' : `${isSelling ? 'Sell' : 'Buy'} ${token.symbol}`}
                    </button>

                    {/* Quote Display - Terminal Style */}
                    {priceInfo && (
                        <div className="mt-4 p-3 bg-[#2C3038] rounded">
                            <div className="flex justify-between text-sm">
                                <span className="text-[#808591]">Expected Output</span>
                                <span className="text-white font-mono">
                                    {isSelling
                                        ? `${priceInfo.totalCost.toFixed(6)} SOL`
                                        : `${priceInfo.price.toFixed(6)} ${token.symbol}`
                                    }
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Error Display - Terminal Style */}
                    {error && (
                        <div className="mt-4 p-3 bg-red-900/20 border border-red-500 text-red-400 rounded text-sm">
                            {error}
                        </div>
                    )}
                </>
            )}
        </TerminalCard>
    );
} 