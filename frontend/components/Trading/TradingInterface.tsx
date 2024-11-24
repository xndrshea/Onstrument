import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { BondingCurve } from '../../services/bondingCurve'
import { PublicKey, Transaction, LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js'
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    getAccount,
    TokenAccountNotFoundError,
    createTransferInstruction
} from '@solana/spl-token'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { verifyDevnetConnection } from '../../utils/network'
import { bondingCurveManager } from '../../services/bondingCurveManager'
import { Token } from '../../../shared/types/token'
import { formatSupply } from '../../utils/formatting'
import { getProgramErrorMessage, BondingCurveError } from '../../types/errors'
import { Alert, AlertIcon, AlertTitle, AlertDescription } from '@chakra-ui/react'

interface TradingInterfaceProps {
    token: Token
    onTradeComplete: () => void
}

export function TradingInterface({ token, onTradeComplete }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const { publicKey, sendTransaction, connected, signTransaction } = useWallet()
    const [amount, setAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [currentPrice, setCurrentPrice] = useState<number>(0)
    const [userBalance, setUserBalance] = useState<bigint>(BigInt(0))
    const [isSelling, setIsSelling] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')
    const [solBalance, setSolBalance] = useState<number>(0)
    const [bondingCurveBalance, setBondingCurveBalance] = useState<bigint>(BigInt(0))
    const [actualSolReserves, setActualSolReserves] = useState<number>(0)
    const [totalCost, setTotalCost] = useState<number>(0)
    const [availableSupply, setAvailableSupply] = useState<number>(0)
    const [expectedTokens, setExpectedTokens] = useState<number>(0)
    const [error, setError] = useState<string | null>(null)
    const [slippageWarning, setSlippageWarning] = useState<boolean>(false)
    const [priceImpact, setPriceImpact] = useState<number>(0)
    const [maxSlippage, setMaxSlippage] = useState<number>(0.5)

    // Initialize bonding curve from token config
    const bondingCurve = useMemo(() => {
        try {
            if (!token.bonding_curve_config) {
                return null;
            }

            const curve = BondingCurve.fromToken(token);
            return curve;
        } catch (error) {
            return null;
        }
    }, [token]);

    // Simplify updateBalances to only track what we need
    const updateBalances = useCallback(async () => {
        if (!publicKey || !token.mint_address) return;

        try {
            const [curve] = PublicKey.findProgramAddressSync(
                [Buffer.from("bonding_curve"), new PublicKey(token.mint_address).toBuffer()],
                PROGRAM_ID
            );

            const userATA = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            const [solBalance, curveData] = await Promise.all([
                connection.getBalance(publicKey),
                bondingCurve.program.account.curve.fetch(curve)
            ]);

            const [userTokenATA] = await Promise.all([
                getAccount(connection, userATA).catch(error => {
                    if (error instanceof TokenAccountNotFoundError) {
                        return { amount: BigInt(0) };
                    }
                    throw error;
                })
            ]);

            setSolBalance(solBalance / LAMPORTS_PER_SOL);
            setUserBalance(userTokenATA.amount);
            setTotalSupply(curveData.totalSupply);

        } catch (error) {
            console.error('Error updating balances:', error);
            setSolBalance(0);
            setUserBalance(BigInt(0));
            setTotalSupply(0);
        }
    }, [publicKey, token.mint_address, connection, bondingCurve]);

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

    // Modify the price calculation effect
    useEffect(() => {
        if (!bondingCurve || !amount) return;

        const fetchPrice = async () => {
            try {
                setError(null);
                setSlippageWarning(false);

                const parsedAmount = parseFloat(amount);
                const priceResult = await bondingCurve.program.account.curve.fetch(
                    bondingCurve.curveAddress
                );

                // Check for high price impact
                if (priceResult.priceImpact > 5) { // 5% threshold
                    setSlippageWarning(true);
                }

                setCurrentPrice(priceResult.spotPrice);
                setTotalCost(priceResult.totalCost);
                setExpectedTokens(parsedAmount);
            } catch (error) {
                console.error('Error fetching price:', error);
                setError(getProgramErrorMessage(error));
            }
        };

        fetchPrice();
    }, [amount, bondingCurve]);

    const handleTransaction = async (
        operation: 'buy' | 'sell',
        amount: string
    ) => {
        if (!publicKey || !amount || !bondingCurve || !signTransaction) {
            setError('Please connect your wallet and enter an amount');
            return;
        }

        try {
            setError(null);
            setIsLoading(true);
            setTransactionStatus(`Preparing ${operation}...`);

            // Validate amount
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                throw new Error('Invalid amount');
            }

            // Get user's ATA
            const userATA = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            // Create transaction
            const transaction = new Transaction();

            // Check if ATA exists and create if needed
            try {
                await getAccount(connection, userATA);
            } catch (error) {
                if (error instanceof TokenAccountNotFoundError) {
                    transaction.add(
                        createAssociatedTokenAccountInstruction(
                            publicKey,
                            userATA,
                            publicKey,
                            new PublicKey(token.mint_address)
                        )
                    );
                }
            }

            // Get operation instructions
            const instructions = operation === 'buy'
                ? await bondingCurve.getBuyInstructions({
                    buyer: publicKey,
                    amount: parsedAmount,
                    userATA,
                    connection
                })
                : await bondingCurve.getSellInstructions({
                    seller: publicKey,
                    amount: parsedAmount,
                    userATA,
                    connection
                });

            transaction.add(...instructions);

            // Send transaction
            setTransactionStatus('Confirming transaction...');
            const signature = await sendTransaction(transaction, connection, {
                skipPreflight: false,
                preflightCommitment: 'confirmed'
            });

            // Wait for confirmation
            setTransactionStatus('Finalizing transaction...');
            const confirmation = await connection.confirmTransaction(signature, 'confirmed');

            // Check for transaction errors
            if (confirmation.value.err) {
                throw new Error('Transaction failed to confirm');
            }

            setTransactionStatus(`${operation === 'buy' ? 'Purchase' : 'Sale'} successful!`);
            await updateBalances();
            onTradeComplete();

        } catch (error: any) {
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

    // Add state to track network check
    const [networkChecked, setNetworkChecked] = useState(false);

    // Replace the existing network check useEffect
    useEffect(() => {
        const checkNetwork = async () => {
            if (!connected || !publicKey || networkChecked) return;

            try {
                const isDevnet = await verifyDevnetConnection(connection);
                if (!isDevnet && !networkChecked) {
                    alert('Please switch to Devnet network in your wallet to trade this token');
                }
            } catch (error) {
                // Remove console.error
            } finally {
                setNetworkChecked(true);
            }
        };

        checkNetwork();
    }, [connected, connection, publicKey, networkChecked]);

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
            {error && (
                <div className="error-message">
                    <Alert status="error">
                        <AlertIcon />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                </div>
            )}

            {slippageWarning && (
                <div className="slippage-warning">
                    <Alert status="warning">
                        <AlertIcon />
                        <AlertTitle>High Price Impact</AlertTitle>
                        <AlertDescription>
                            This trade will significantly impact the price.
                            Consider reducing the amount to get a better price.
                        </AlertDescription>
                    </Alert>
                </div>
            )}

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
                            Number(availableSupply) / Math.pow(10, 9)}
                        step="1"
                    />
                </div>

                {amount && (
                    <div className="validation-messages">
                        {parseFloat(amount) <= 0 && <p className="warning">Amount must be greater than 0</p>}
                        {isSelling && parseFloat(amount) > Number(userBalance) / Math.pow(10, 9) &&
                            <p className="warning">Insufficient token balance</p>
                        }
                        {!isSelling && parseFloat(amount) > availableSupply &&
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
                    onClick={isSelling ? handleTransaction.bind(null, 'sell') : handleTransaction.bind(null, 'buy')}
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

            {amount && !isSelling && (
                <div className="transaction-preview">
                    <p>You will receive: {expectedTokens.toFixed(4)} tokens</p>
                    <p>Total cost: {totalCost.toFixed(4)} SOL</p>
                    <p>Price per token: {currentPrice.toFixed(6)} SOL</p>
                </div>
            )}
        </div>
    );
} 