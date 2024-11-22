import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { BondingCurve, CurveType } from '../../services/bondingCurve'
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, clusterApiUrl, Connection, Keypair } from '@solana/web3.js'
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    TOKEN_PROGRAM_ID,
    getOrCreateAssociatedTokenAccount,
    getAccount,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createMintToInstruction,
    createBurnInstruction,
    TokenAccountNotFoundError
} from '@solana/spl-token'
import { TokenData } from '../../services/tokenService'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { sendAndConfirmTransaction } from '@solana/web3.js'
import * as tokenCreation from '../../utils/tokenCreation'
import { tokenService } from '../../services/tokenService'
import { verifyDevnetConnection } from '../../utils/network'
import bs58 from 'bs58'
import { BONDING_CURVE_KEYPAIR } from '../../config/constants'
import { formatSupply, convertBigIntToNumber } from '../../utils/formatting'

interface TradingInterfaceProps {
    token: TokenData
    onTradeComplete: () => void
}

interface TokenState {
    currentSupply: bigint
    solReserves: number
    price: number
}

interface PriceCalculationResult {
    spotPrice: number
    totalCost: number
    priceImpact: number
}

export function TradingInterface({ token, onTradeComplete }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const { publicKey, sendTransaction, connected } = useWallet()
    const [amount, setAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [currentPrice, setCurrentPrice] = useState<number>(0)
    const [availableSupply, setAvailableSupply] = useState<bigint>(BigInt(0))
    const [userBalance, setUserBalance] = useState<bigint>(BigInt(0))
    const [isSelling, setIsSelling] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')
    const [solBalance, setSolBalance] = useState<number>(0)
    const [bondingCurveBalance, setBondingCurveBalance] = useState<bigint>(BigInt(0))
    const [actualSolReserves, setActualSolReserves] = useState<number>(0)
    const [totalCost, setTotalCost] = useState<number>(0)
    const [priceData, setPriceData] = useState<PriceCalculationResult>({
        spotPrice: 0,
        totalCost: 0,
        priceImpact: 0
    });

    // Token-specific state
    const [tokenState, setTokenState] = useState<TokenState>({
        currentSupply: BigInt(0),
        solReserves: token.metadata?.solReserves || 0,
        price: 0
    });

    // User-specific state
    const [userState, setUserState] = useState({
        solBalance: 0,
        tokenBalance: BigInt(0)
    });

    // Add this near the top of the component
    console.log("Full token data:", {
        mint_address: token.mint_address,
        metadata: token.metadata,
        rawMetadata: token.metadata ? JSON.stringify(token.metadata) : null
    });

    // Initialize bonding curve from token config
    const bondingCurve = useMemo(() => {
        try {
            if (!token.bonding_curve_config) {
                console.error('Token is missing bonding curve configuration:', token.mint_address);
                return null;
            }

            console.log('Detailed Bonding Curve Config:', {
                curveType: token.bonding_curve_config.curveType,
                basePrice: token.bonding_curve_config.basePrice,
                slope: token.bonding_curve_config.slope,
                exponent: token.bonding_curve_config.exponent,
                logBase: token.bonding_curve_config.logBase,
                totalSupply: token.metadata?.totalSupply,
                currentSupply: token.metadata?.currentSupply,
                solReserves: token.metadata?.solReserves
            });

            const curve = BondingCurve.fromToken(token);

            const testPrice = curve.calculatePrice({
                currentSupply: 0,
                solReserves: 0,
                amount: 1,
                isSelling: false
            });
            console.log('Test price calculation:', testPrice);

            return curve;
        } catch (error) {
            console.error('Bonding Curve Initialization Error:', error);
            console.error('Full token data at error:', token);
            return null;
        }
    }, [token]);

    // Simplify updateBalances to only track what we need
    const updateBalances = useCallback(async () => {
        if (!publicKey || !token.metadata?.bondingCurveATA) return;

        try {
            console.log('Updating Balances - Starting with:', {
                bondingCurveATA: token.metadata.bondingCurveATA,
                publicKey: publicKey.toString()
            });

            const [
                userSolBalance,
                bondingCurveAccount,
                userTokenAccount,
                bondingCurveSolBalance
            ] = await Promise.all([
                connection.getBalance(publicKey),
                getAccount(connection, new PublicKey(token.metadata.bondingCurveATA)),
                getAccount(connection, await getAssociatedTokenAddress(
                    new PublicKey(token.mint_address),
                    publicKey
                )).catch(() => null),
                connection.getBalance(BONDING_CURVE_KEYPAIR.publicKey)
            ]);

            console.log('Balance Update Results:', {
                userSolBalance: userSolBalance / LAMPORTS_PER_SOL,
                bondingCurveAmount: bondingCurveAccount.amount.toString(),
                userTokenAmount: userTokenAccount?.amount.toString() || '0',
                bondingCurveSolBalance: bondingCurveSolBalance / LAMPORTS_PER_SOL
            });

            // Use bondingCurveAccount.amount as the single source of truth
            const currentSupply = bondingCurveAccount.amount;

            // Update all states that depend on supply with the same value
            setSolBalance(userSolBalance / LAMPORTS_PER_SOL);
            setUserBalance(userTokenAccount?.amount || BigInt(0));
            setBondingCurveBalance(currentSupply);
            setAvailableSupply(currentSupply);

            setTokenState(prev => ({
                ...prev,
                currentSupply: currentSupply, // Use the same value here
                solReserves: bondingCurveSolBalance / LAMPORTS_PER_SOL
            }));
        } catch (error) {
            console.error('Balance Update Error:', error);
            console.error('Error Stack:', error instanceof Error ? error.stack : 'No stack trace');
        }
    }, [publicKey, connection, token.metadata?.bondingCurveATA, token.mint_address]);

    // Add initial load effect
    useEffect(() => {
        updateBalances();
    }, [updateBalances]); // Run once when component mounts

    // Modify the polling interval effect to prevent race conditions
    useEffect(() => {
        let mounted = true;
        const interval = setInterval(async () => {
            if (mounted) {
                await updateBalances();
            }
        }, 5000);

        return () => {
            mounted = false;
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
            if (userBalance < BigInt(Math.floor(amountNum * Math.pow(10, 9)))) return true;
        } else {
            // Check bonding curve's token balance for buying
            if (amountNum > Number(bondingCurveBalance) / Math.pow(10, 9)) return true;
            if (totalCost > solBalance) return true;
        }

        return false;
    }, [publicKey, amount, isLoading, isSelling, userBalance, bondingCurveBalance, totalCost, solBalance]);

    // Modify the price calculation effect for better debugging
    useEffect(() => {
        if (!bondingCurve) {
            console.error('Price calculation failed: No bonding curve initialized');
            return;
        }

        try {
            const parsedAmount = amount ? parseFloat(amount) : 0;

            // Log all inputs to price calculation
            console.log('Price Calculation Inputs:', {
                currentSupply: Number(tokenState.currentSupply) / Math.pow(10, 9),
                solReserves: tokenState.solReserves,
                amount: parsedAmount,
                isSelling,
                bondingCurveConfig: token.bonding_curve_config,
                tokenState
            });

            const priceResult = bondingCurve.calculatePrice({
                currentSupply: Number(tokenState.currentSupply) / Math.pow(10, 9),
                solReserves: tokenState.solReserves,
                amount: parsedAmount,
                isSelling
            });

            console.log('Price Calculation Result:', priceResult);

            setCurrentPrice(priceResult.spotPrice);
            setTotalCost(priceResult.totalCost);
            setPriceData(priceResult);
        } catch (error) {
            console.error('Price Calculation Error:', error);
            console.error('Error Stack:', error instanceof Error ? error.stack : 'No stack trace');
            console.error('Current State:', {
                token,
                tokenState,
                amount,
                bondingCurve: !!bondingCurve
            });
        }
    }, [amount, bondingCurve, isSelling, tokenState.currentSupply, tokenState.solReserves, token]);

    const handlePurchase = async () => {
        if (!publicKey || !amount || !token.metadata?.bondingCurveATA || !bondingCurve) {
            return;
        }

        const purchaseAmount = parseFloat(amount);

        // Validate the user has enough SOL
        if (priceData.totalCost > solBalance) {
            alert(`Insufficient SOL balance. Required: ${priceData.totalCost.toFixed(4)} SOL`);
            return;
        }

        // Add price impact warning
        if (priceData.priceImpact > 0.05) { // 5% impact
            const proceed = window.confirm(
                `Warning: This trade will impact the price by ${(priceData.priceImpact * 100).toFixed(2)}%. Do you want to proceed?`
            );
            if (!proceed) return;
        }

        setIsLoading(true);
        setTransactionStatus('Preparing transaction...');

        try {
            const costInLamports = Math.floor(priceData.totalCost * LAMPORTS_PER_SOL);

            const transaction = new Transaction();
            const bondingCurveKeypair = BONDING_CURVE_KEYPAIR;
            const mintPubkey = new PublicKey(token.mint_address);
            const bondingCurveATA = new PublicKey(token.metadata.bondingCurveATA);
            const userATA = await getAssociatedTokenAddress(mintPubkey, publicKey);

            // Check if user's ATA exists
            try {
                await getAccount(connection, userATA);
            } catch (error) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey,
                        userATA,
                        publicKey,
                        mintPubkey,
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            // Transfer SOL to bonding curve
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: bondingCurveKeypair.publicKey,
                    lamports: costInLamports
                })
            );

            // Transfer tokens to user
            transaction.add(
                createTransferInstruction(
                    bondingCurveATA,
                    userATA,
                    bondingCurveKeypair.publicKey,
                    Math.floor(purchaseAmount * Math.pow(10, 9))
                )
            );

            // Get latest blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // Sign with bonding curve keypair
            transaction.partialSign(bondingCurveKeypair);

            setTransactionStatus('Please approve the transaction...');
            const signature = await sendTransaction(transaction, connection);

            setTransactionStatus('Confirming transaction...');
            await connection.confirmTransaction(signature, 'confirmed');

            // Update local state immediately
            const newSolReserves = (token.metadata?.solReserves || 0) + (costInLamports / LAMPORTS_PER_SOL);
            setTokenState(prev => ({
                ...prev,
                solReserves: newSolReserves,
                currentSupply: prev.currentSupply + BigInt(Math.floor(purchaseAmount * Math.pow(10, 9)))
            }));

            // Try to update backend, but don't fail if it doesn't work
            try {
                const updateResult = await tokenService.updateTokenReserves(token.mint_address, newSolReserves);
                if (updateResult.localOnly) {
                    console.warn('Token reserves updated locally only');
                }
            } catch (error) {
                console.warn('Failed to update token reserves on server:', error);
                // Don't fail the transaction, just log the warning
            }

            setTransactionStatus('Purchase successful!');
            await updateBalances();
            setAmount('');
            onTradeComplete();

        } catch (error) {
            console.error('Purchase error:', error);
            setTransactionStatus('Purchase failed');
            if (!(error instanceof Error && error.message.includes('updateTokenReserves'))) {
                alert(error instanceof Error ? error.message : 'Transaction failed');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSell = async () => {
        if (!publicKey || !amount || !token.metadata?.bondingCurveATA || !bondingCurve) {
            return;
        }

        const sellAmount = parseFloat(amount);

        // Use priceData that's already calculated from our bonding curve
        const requiredSOL = Math.floor(priceData.totalCost * LAMPORTS_PER_SOL) + 5000; // Add buffer for fees

        // Check if bonding curve has enough SOL
        if (tokenState.solReserves * LAMPORTS_PER_SOL < requiredSOL) {
            setTransactionStatus('Bonding curve has insufficient SOL for this sale');
            return;
        }

        try {
            setIsLoading(true);
            setTransactionStatus('Processing sale...');

            const transaction = new Transaction();
            const bondingCurveKeypair = BONDING_CURVE_KEYPAIR;

            // First, add the bonding curve as a signer if there's a SOL transfer
            if (tokenState.solReserves > 0) {
                transaction.add(
                    SystemProgram.transfer({
                        fromPubkey: bondingCurveKeypair.publicKey,
                        toPubkey: publicKey,
                        lamports: Math.floor(priceData.totalCost * LAMPORTS_PER_SOL)
                    })
                );
            }

            // Then add the token transfer instruction
            const userATA = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            const bondingCurveATA = new PublicKey(token.metadata.bondingCurveATA);
            const tokenAmount = BigInt(Math.floor(sellAmount * Math.pow(10, 9)));

            transaction.add(
                createTransferInstruction(
                    userATA,
                    bondingCurveATA,
                    publicKey,
                    tokenAmount
                )
            );

            // Get latest blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // Add bonding curve as signer if there's a SOL transfer
            if (tokenState.solReserves > 0) {
                transaction.signatures = [];  // Clear existing signatures
                transaction.sign(bondingCurveKeypair);  // Sign with bonding curve first
            }

            // Send transaction for user to sign
            setTransactionStatus('Please approve the transaction...');
            const signature = await sendTransaction(transaction, connection);

            setTransactionStatus('Confirming transaction...');
            await connection.confirmTransaction(signature, 'confirmed');

            // Update local state
            const newSolReserves = Math.max(0, tokenState.solReserves - (priceData.totalCost || 0));
            setTokenState(prev => ({
                ...prev,
                solReserves: newSolReserves,
                currentSupply: prev.currentSupply - tokenAmount
            }));

            // Update backend
            await tokenService.updateTokenReserves(token.mint_address, newSolReserves);

            setTransactionStatus('Sale successful!');
            await updateBalances();
            setAmount('');
            onTradeComplete();

        } catch (error) {
            console.error('Sale error:', error);
            setTransactionStatus(error instanceof Error ? error.message : 'Transaction failed');
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
                if (!isDevnet) {
                    console.warn('Not connected to Devnet network:', connection.rpcEndpoint);
                    // Only show alert once
                    if (!networkChecked) {
                        alert('Please switch to Devnet network in your wallet to trade this token');
                    }
                }
            } catch (error) {
                console.error('Network check failed:', error);
            } finally {
                setNetworkChecked(true);
            }
        };

        checkNetwork();
    }, [connected, connection, publicKey, networkChecked]);

    // Add this near the top of the component
    useEffect(() => {
        console.log('Token data:', {
            mint_address: token.mint_address,
            metadata: token.metadata,
            currentSupply: token.metadata?.currentSupply,
            bondingCurveATA: token.metadata?.bondingCurveATA,
        });
    }, [token]);

    // Update the debug logging useEffect to remove reserveBalance reference
    useEffect(() => {
        if (publicKey && token.mint_address) {
            console.debug('Trading Interface State:', {
                wallet: publicKey.toString(),
                network: connection.rpcEndpoint,
                tokenMint: token.mint_address,
                bondingCurveATA: token.metadata?.bondingCurveATA,
                currentPrice,
                availableSupply: Number(bondingCurveBalance) / Math.pow(10, 9),
                userBalance,
                solBalance,
                solReserves: tokenState.solReserves,
                bondingCurveBalance: Number(bondingCurveBalance) / Math.pow(10, 9)
            });
        }
    }, [publicKey, token, connection, currentPrice, bondingCurveBalance, userBalance, solBalance, tokenState.solReserves]);

    useEffect(() => {
        if (amount) {
            console.debug('Button State:', {
                isLoading,
                amount,
                parsedAmount: parseFloat(amount),
                userBalance: convertBigIntToNumber(userBalance) / Math.pow(10, 9),
                availableSupply: convertBigIntToNumber(availableSupply) / Math.pow(10, 9),
                totalCost,
                solBalance,
                isDisabled: isLoading ||
                    !amount ||
                    parseFloat(amount) <= 0 ||
                    (isSelling ?
                        parseFloat(amount) > convertBigIntToNumber(userBalance) / Math.pow(10, 9) :
                        parseFloat(amount) > convertBigIntToNumber(availableSupply) / Math.pow(10, 9)
                    ) ||
                    (isSelling ?
                        totalCost > (tokenState.solReserves) :
                        totalCost > solBalance
                    )
            });
        }
    }, [amount, isLoading, userBalance, availableSupply, totalCost, solBalance, tokenState.solReserves, isSelling, connected]);

    useEffect(() => {
        console.log("Token metadata in TradingInterface:", {
            metadata: token.metadata,
            bondingCurveATA: token.metadata?.bondingCurveATA
        });
    }, [token]);

    // Update the initial state setup
    useEffect(() => {
        if (!bondingCurve || !token.metadata) {
            console.log('Skipping initial state setup:', {
                hasBondingCurve: !!bondingCurve,
                hasMetadata: !!token.metadata
            });
            return;
        }

        console.log('Setting initial token state:', {
            currentSupply: token.metadata.currentSupply || 0,
            solReserves: token.metadata.solReserves || 0
        });

        setTokenState({
            currentSupply: BigInt(token.metadata.currentSupply || 0),
            solReserves: token.metadata.solReserves || 0,
            price: 0
        });
    }, [token.metadata, bondingCurve]);

    // Add validation to token state updates
    useEffect(() => {
        if (!token.metadata) {
            console.log('Token metadata missing');
            return;
        }

        console.log('Setting token state with:', {
            currentSupply: token.metadata.currentSupply,
            solReserves: token.metadata.solReserves
        });

        setTokenState({
            currentSupply: BigInt(token.metadata.currentSupply || 0),
            solReserves: token.metadata.solReserves || 0,
            price: 0
        });
    }, [token.metadata]);

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
                <p>Available Supply: {formatSupply(availableSupply)} {token.symbol}</p>
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
                        {isSelling && parseFloat(amount) > userBalance &&
                            <p className="warning">Insufficient token balance</p>
                        }
                        {!isSelling && parseFloat(amount) > availableSupply &&
                            <p className="warning">Amount exceeds available supply</p>
                        }
                        {isSelling && totalCost > (tokenState.solReserves) &&
                            <p className="warning">Insufficient liquidity in reserve</p>
                        }
                        {!isSelling && totalCost > solBalance &&
                            <p className="warning">Insufficient SOL balance</p>
                        }
                    </div>
                )}

                <button
                    onClick={isSelling ? handleSell : handlePurchase}
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
        </div>
    );
} 