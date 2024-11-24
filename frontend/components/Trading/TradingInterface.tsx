import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { formatSupply } from '../../utils/formatting'
import { getProgramErrorMessage, BondingCurveError } from '../../types/errors'
import { TokenRecord } from '../../../shared/types/token'
import { BondingCurve } from '../../services/bondingCurve'

interface TradingInterfaceProps {
    token: TokenRecord
    onTradeComplete: () => void
}

export function TradingInterface({ token, onTradeComplete }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const { publicKey, sendTransaction, connected, signTransaction } = wallet
    const [amount, setAmount] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [currentPrice, setCurrentPrice] = useState<number>(0)
    const [userBalance, setUserBalance] = useState<bigint>(BigInt(0))
    const [isSelling, setIsSelling] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')
    const [solBalance, setSolBalance] = useState<number>(0)
    const [bondingCurveBalance, setBondingCurveBalance] = useState<bigint>(BigInt(0))
    const [actualSolReserves, setActualSolReserves] = useState<number>(0)
    const [totalCost, setTotalCost] = useState<number>(0)
    const [error, setError] = useState<string | null>(null)
    const [slippageWarning, setSlippageWarning] = useState<boolean>(false)
    const [maxSlippage, setMaxSlippage] = useState<number>(0.5)

    // Simplify bondingCurve initialization to use the new constructor
    const bondingCurve = useMemo(() => {
        if (!connection || !wallet || !wallet.publicKey || !wallet.signTransaction ||
            !token.mint_address || !token.curve_address) {
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
            console.error('Error initializing bonding curve:', error);
            setError('Failed to initialize trading interface');
            return null;
        }
    }, [connection, wallet, token.mint_address, token.curve_address]);

    // Simplify updateBalances to only track what we need
    const updateBalances = useCallback(async () => {
        if (!publicKey || !bondingCurve) return;

        try {
            const [
                solBalance,
                userTokenBalance,
                curveData
            ] = await Promise.all([
                connection.getBalance(publicKey),
                bondingCurve.getUserBalance(publicKey),
                bondingCurve.getCurveData()
            ]);

            setSolBalance(solBalance / LAMPORTS_PER_SOL);
            setUserBalance(userTokenBalance);
            setBondingCurveBalance(curveData.totalSupply);
        } catch (error) {
            console.error('Error updating balances:', error);
            setError('Failed to fetch current balances');
        }
    }, [publicKey, bondingCurve, connection]);

    // Simplified polling logic with proper cleanup
    useEffect(() => {
        let isSubscribed = true;

        const pollBalances = async () => {
            if (!isSubscribed) return;
            await updateBalances();
        };

        // Initial load
        pollBalances();

        // Set up polling
        const interval = setInterval(pollBalances, 60000);

        return () => {
            isSubscribed = false;
            clearInterval(interval);
        };
    }, [updateBalances]);

    // Update button disabled logic
    const isButtonDisabled = useMemo(() => {
        if (!publicKey || !amount || isLoading) return true;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) return true;

        if (isSelling) {
            // Check user's token balance for selling
            const tokenAmount = BigInt(Math.floor(amountNum * Math.pow(10, 9)));
            return userBalance < tokenAmount;
        } else {
            // For buying:
            // 1. Check if bonding curve has enough tokens
            const availableTokens = Number(bondingCurveBalance) / Math.pow(10, 9);
            if (amountNum > availableTokens) return true;

            // 2. Check if user has enough SOL (add some buffer for transaction fees)
            const requiredSOL = totalCost + 0.001; // Add 0.001 SOL buffer for fees
            return requiredSOL > solBalance;
        }
    }, [publicKey, amount, isLoading, isSelling, userBalance, bondingCurveBalance, totalCost, solBalance]);

    // Fix price quote handling
    useEffect(() => {
        if (!bondingCurve || !amount || isNaN(parseFloat(amount))) return;

        const timer = setTimeout(async () => {
            try {
                const parsedAmount = parseFloat(amount) * 1e9;
                if (parsedAmount <= 0) return;

                const quote = await bondingCurve.getPriceQuote(
                    parsedAmount,
                    !isSelling
                );

                // Handle zero or invalid prices
                if (!isFinite(quote.totalPrice) || quote.totalPrice <= 0) {
                    throw new Error('Invalid price quote received');
                }

                setTotalCost(quote.totalPrice);
                setCurrentPrice(quote.spotPrice);

                // Price impact is already in percentage from BondingCurve
                if (quote.priceImpact > maxSlippage) {
                    setSlippageWarning(true);
                } else {
                    setSlippageWarning(false);
                }
            } catch (error) {
                console.error('Error fetching price quote:', error);
                setError(getProgramErrorMessage(error));
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [amount, bondingCurve, isSelling, maxSlippage]);

    // Simplify handleTransaction to use BondingCurve methods directly
    const handleTransaction = async (operation: 'buy' | 'sell', amount: string) => {
        if (!publicKey || !amount || !bondingCurve) {
            setError('Please connect your wallet and enter an amount');
            return;
        }

        // Add check for required addresses
        if (!bondingCurve.mintAddress || !bondingCurve.curveAddress) {
            setError('Token addresses not properly initialized');
            return;
        }

        try {
            setError(null);
            setIsLoading(true);
            setTransactionStatus(`Preparing ${operation}...`);

            const parsedAmount = parseFloat(amount) * 1e9;
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                throw new Error('Invalid amount');
            }

            // Get price quote using bondingCurve method
            const quote = await bondingCurve.getPriceQuote(parsedAmount, operation === 'buy');

            // Calculate max cost/min return with slippage
            const solAmount = operation === 'buy'
                ? quote.totalPrice * (1 + maxSlippage)
                : quote.totalPrice * (1 - maxSlippage);

            // Execute transaction using bondingCurve methods
            const signature = await (operation === 'buy'
                ? bondingCurve.buy({
                    amount: parsedAmount,
                    maxSolCost: solAmount
                })
                : bondingCurve.sell({
                    amount: parsedAmount,
                    minSolReturn: solAmount
                }));

            setTransactionStatus('Finalizing transaction...');
            const confirmation = await connection.confirmTransaction(signature, 'confirmed');

            if (confirmation.value.err) {
                throw new Error('Transaction failed to confirm');
            }

            setTransactionStatus(`${operation === 'buy' ? 'Purchase' : 'Sale'} successful!`);
            await updateBalances();
            onTradeComplete();

        } catch (error) {
            console.error(`${operation} failed:`, error);

            // Handle program-specific errors
            const errorMessage = getProgramErrorMessage(error);

            // Special handling for slippage errors
            if (errorMessage === BondingCurveError.SlippageExceeded) {
                setSlippageWarning(true);
                setError('Price impact too high. Try a smaller amount or refresh price.');
            } else {
                setError(errorMessage);
            }

            setTransactionStatus('Transaction failed');
        } finally {
            setIsLoading(false);
        }
    };

    if (!connected) {
        return (
            <div className="trading-interface">
                <div className="connect-wallet-notice" style={{
                    padding: '1rem',
                    textAlign: 'center',
                    backgroundColor: 'rgba(0,0,0,0.1)',
                    borderRadius: '8px'
                }}>
                    <p>Connect your wallet to trade this token</p>
                    <WalletMultiButton />
                </div>
            </div>
        );
    }

    return (
        <div className="trading-interface">

            <div className="network-warning" style={{
                backgroundColor: '#fff3cd',
                color: '#856404',
                padding: '0.5rem',
                marginBottom: '1rem',
                borderRadius: '4px',
                fontSize: '0.9rem'
            }}>
                ⚠ This token is on Devnet network. Make sure your wallet is connected to Devnet.
            </div>

            <div className="price-info">
                <h3>Current Price: {isFinite(currentPrice) ? currentPrice.toFixed(6) : '0.000000'} SOL</h3>
                {amount && (
                    <p>Trade Price: {(totalCost / parseFloat(amount)).toFixed(6)} SOL</p>
                )}
                <p>Total Cost: {totalCost.toFixed(6)} SOL</p>
                <p>Available Supply: {formatSupply(bondingCurveBalance)} {token.symbol}</p>
                <p>Your Balance: {formatSupply(userBalance)} {token.symbol}</p>
                <p>Your SOL Balance: {solBalance.toFixed(4)} SOL</p>
            </div>

            <div className="trade-type-selector">
                <button
                    onClick={() => setIsSelling(false)}
                    className={!isSelling ? 'active' : ''}
                >
                    Buy
                </button>
                <button
                    onClick={() => setIsSelling(true)}
                    className={isSelling ? 'active' : ''}
                >
                    Sell
                </button>
            </div>

            <div className="trading-form">
                <div className="form-group">
                    <label>{isSelling ? 'Amount to Sell' : 'Amount to Purchase'}</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={`Enter amount of tokens`}
                        min="0"
                        max={isSelling ?
                            Number(userBalance) / Math.pow(10, 9) :
                            Number(bondingCurveBalance) / Math.pow(10, 9)}
                        step="1"
                    />
                </div>

                {amount && (
                    <div className="validation-messages">
                        {parseFloat(amount) <= 0 && <p className="warning">Amount must be greater than 0</p>}
                        {isSelling && parseFloat(amount) > Number(userBalance) / Math.pow(10, 9) &&
                            <p className="warning">Insufficient token balance</p>
                        }
                        {!isSelling && parseFloat(amount) > Number(bondingCurveBalance) / Math.pow(10, 9) &&
                            <p className="warning">Amount exceeds available supply</p>
                        }
                        {isSelling && totalCost > actualSolReserves &&
                            <p className="warning">Insufficient liquidity in reserve</p>
                        }
                        {!isSelling && totalCost > solBalance &&
                            <p className="warning">Insufficient SOL balance</p>
                        }
                    </div>
                )}

                <button
                    onClick={() => handleTransaction(isSelling ? 'sell' : 'buy', amount)}
                    disabled={isButtonDisabled}
                    className="trading-button"
                >
                    {isLoading ? 'Processing...' : (isSelling ? 'Sell Tokens' : 'Purchase Tokens')}
                </button>
            </div>

            {transactionStatus && (
                <div className={`transaction-status ${transactionStatus.toLowerCase()}`}>
                    {transactionStatus}
                </div>
            )}

            {amount && (
                <div className="transaction-preview">
                    <p>Total cost: {totalCost.toFixed(4)} SOL</p>
                    <p>Price per token: {currentPrice.toFixed(6)} SOL</p>
                </div>
            )}
        </div>
    );
} 