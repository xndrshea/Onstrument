import React, { useState, useEffect, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { BondingCurve } from '../../services/bondingCurve'
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

interface TradingInterfaceProps {
    token: TokenData
}

export function TradingInterface({ token }: TradingInterfaceProps) {
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
    const [reserveBalance, setReserveBalance] = useState<number>(0)
    const [bondingCurveBalance, setBondingCurveBalance] = useState<bigint>(BigInt(0))

    // Add this near the top of the component
    console.log("Full token data:", {
        mint_address: token.mint_address,
        metadata: token.metadata,
        rawMetadata: token.metadata ? JSON.stringify(token.metadata) : null
    });

    // Update bondingCurve initialization to not use config
    const bondingCurve = useMemo(() => {
        return BondingCurve.getInstance();
    }, []); // Empty dependency array since we don't use any config

    // Calculate total cost in SOL using the same bondingCurve instance
    const totalCost = useMemo(() => {
        if (!amount || !bondingCurve) return 0;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum)) return 0;

        const currentSupply = Number(bondingCurveBalance) / Math.pow(10, 9);
        const currentReserve = reserveBalance / LAMPORTS_PER_SOL;

        if (isSelling) {
            return bondingCurve.getReturn(amountNum, currentSupply, currentReserve);
        } else {
            return bondingCurve.getCost(amountNum, currentSupply, currentReserve);
        }
    }, [amount, bondingCurve, isSelling, bondingCurveBalance, reserveBalance]);

    // Update price calculation useEffect
    useEffect(() => {
        if (!bondingCurve) {
            setCurrentPrice(0);
            return;
        }

        const currentSupply = Number(bondingCurveBalance) / Math.pow(10, 9);
        const currentReserve = reserveBalance / LAMPORTS_PER_SOL;
        const price = bondingCurve.getPrice(currentSupply, currentReserve);
        setCurrentPrice(price);
    }, [bondingCurve, bondingCurveBalance, reserveBalance]);

    // Update the formatSupply function to handle BigInt
    const formatSupply = (supply: bigint | number | undefined): string => {
        if (supply === undefined) return '0.00';

        // Convert BigInt to number safely
        const numericSupply = typeof supply === 'bigint' ?
            Number(supply) : supply;

        // Convert to human readable format (divide by 10^9)
        const humanReadable = numericSupply / Math.pow(10, 9);

        // Format with 2 decimal places
        return humanReadable.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    // Convert BigInt to number safely
    const convertBigIntToNumber = (value: bigint | number): number => {
        if (typeof value === 'bigint') {
            return Number(value)
        }
        return value
    }

    // Move updateBalances outside useEffect and make it a function declaration
    const updateBalances = async () => {
        if (!publicKey || !token.mint_address || !token.metadata?.bondingCurveATA) {
            return;
        }

        try {
            // Get user's SOL balance
            const solBalance = await connection.getBalance(publicKey) / LAMPORTS_PER_SOL;
            setSolBalance(solBalance);

            // Get bonding curve ATA balance (available supply)
            const bondingCurveATA = new PublicKey(token.metadata.bondingCurveATA);
            const bondingCurveAccount = await getAccount(connection, bondingCurveATA);
            const availableSupplyBigInt = bondingCurveAccount.amount;
            setAvailableSupply(availableSupplyBigInt);
            setBondingCurveBalance(availableSupplyBigInt);

            // Get user's token balance
            try {
                const userATA = await getAssociatedTokenAddress(
                    new PublicKey(token.mint_address),
                    publicKey
                );
                const userAccount = await getAccount(connection, userATA);
                setUserBalance(userAccount.amount);
            } catch (e) {
                if (e instanceof TokenAccountNotFoundError) {
                    setUserBalance(BigInt(0));
                } else {
                    throw e;
                }
            }

            // Get reserve balance if available
            if (token.metadata?.reserveAccount) {
                const reserveBalance = await connection.getBalance(new PublicKey(token.metadata.reserveAccount));
                setReserveBalance(reserveBalance);
            }
        } catch (error) {
            console.error('Error updating balances:', error);
        }
    };

    // Use updateBalances in useEffect
    useEffect(() => {
        updateBalances();
        const interval = setInterval(updateBalances, 5000);
        return () => clearInterval(interval);
    }, [publicKey, connection, token.mint_address, token.metadata?.bondingCurveATA, token.metadata?.reserveAccount]);

    // Update button disabled logic
    const isButtonDisabled = useMemo(() => {
        if (!publicKey || !amount || isLoading) return true;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) return true;

        if (isSelling) {
            // Selling checks
            if (userBalance < BigInt(Math.floor(amountNum * Math.pow(10, 9)))) return true;
            const bondingCurveSOLBalance = solBalance;
            if (totalCost > bondingCurveSOLBalance) return true;
        } else {
            // Buying checks
            if (amountNum > Number(availableSupply) / Math.pow(10, 9)) return true;
            if (totalCost > solBalance) return true;
        }

        return false;
    }, [publicKey, amount, isLoading, isSelling, userBalance, availableSupply, totalCost, solBalance]);

    const handlePurchase = async () => {
        if (!publicKey || !amount || !token.metadata?.bondingCurveATA) {
            return;
        }

        setIsLoading(true);
        setTransactionStatus('Preparing transaction...');

        try {
            const transaction = new Transaction();
            const bondingCurveKeypair = BONDING_CURVE_KEYPAIR;
            const mintPubkey = new PublicKey(token.mint_address);
            const bondingCurveATA = new PublicKey(token.metadata.bondingCurveATA);

            // Get or create user's token account
            const userATA = await createUserTokenAccount(
                connection,
                publicKey,
                mintPubkey
            );

            // Calculate the cost in lamports
            const costInLamports = Math.floor(totalCost * LAMPORTS_PER_SOL);

            // Transfer SOL from user to bonding curve
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: bondingCurveKeypair.publicKey,
                    lamports: costInLamports
                })
            );

            // Transfer tokens from bonding curve to user
            transaction.add(
                createTransferInstruction(
                    bondingCurveATA,
                    userATA,
                    bondingCurveKeypair.publicKey,
                    Math.floor(parseFloat(amount) * Math.pow(10, 9))
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

            setTransactionStatus('Purchase successful!');
            await updateBalances();
        } catch (error) {
            console.error('Purchase error:', error);
            setTransactionStatus('Transaction failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSell = async () => {
        if (!publicKey || !token.mint_address || !token.metadata?.bondingCurveATA) {
            alert('Missing required token data');
            return;
        }

        try {
            setIsLoading(true);
            setTransactionStatus('Processing sale...');

            const sellAmount = parseFloat(amount);
            const currentSupply = Number(bondingCurveBalance) / Math.pow(10, 9);
            const currentReserve = reserveBalance / LAMPORTS_PER_SOL;
            const returnAmount = Math.floor(bondingCurve.getReturn(sellAmount, currentSupply, currentReserve) * LAMPORTS_PER_SOL);

            // Create transaction
            const transaction = new Transaction();
            const bondingCurveKeypair = BONDING_CURVE_KEYPAIR;

            // Get user's ATA
            const userATA = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            // Transfer tokens back to bonding curve ATA
            transaction.add(
                createTransferInstruction(
                    userATA,                                          // from: user's ATA
                    new PublicKey(token.metadata.bondingCurveATA),   // to: bonding curve ATA
                    publicKey,                                        // owner
                    BigInt(Math.floor(sellAmount * Math.pow(10, 9))) // amount (convert to BigInt)
                )
            );

            // Transfer SOL from bonding curve to user
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: bondingCurveKeypair.publicKey,  // Changed from reserveAccount
                    toPubkey: publicKey,
                    lamports: returnAmount
                })
            );

            // Get recent blockhash and sign
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // Sign with bonding curve keypair since it's transferring SOL
            transaction.partialSign(bondingCurveKeypair);

            // Send and confirm
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            // Update UI state
            setTransactionStatus('Sale successful!');
            await updateBalances();
            setAmount('');

        } catch (error) {
            console.error('Sale error:', error);
            setTransactionStatus('Sale failed');
            alert(error instanceof Error ? error.message : 'Transaction failed');
        } finally {
            setIsLoading(false);
        }
    };

    const createUserTokenAccount = async (
        connection: import('@solana/web3.js').Connection,
        publicKey: PublicKey,
        mintAddress: PublicKey
    ): Promise<PublicKey> => {
        try {
            const userATA = await getAssociatedTokenAddress(mintAddress, publicKey)

            // Check if account already exists
            try {
                await getAccount(connection, userATA)
                return userATA
            } catch (error) {
                // Account doesn't exist, create it
                const transaction = new Transaction().add(
                    createAssociatedTokenAccountInstruction(
                        publicKey,
                        userATA,
                        publicKey,
                        mintAddress,
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                )

                const signature = await sendTransaction(transaction, connection)
                await connection.confirmTransaction(signature, 'confirmed')
                return userATA
            }
        } catch (error) {
            console.error('Error creating token account:', error)
            throw new Error('Failed to create token account')
        }
    }

    // Add this near the top of the component
    useEffect(() => {
        const checkNetwork = async () => {
            if (!connected) return;
            const isDevnet = await verifyDevnetConnection(connection);
            if (!isDevnet) {
                alert('Please switch to Devnet network to trade this token');
            }
        };
        checkNetwork();
    }, [connected, connection]);

    // Add this near the top of the component
    useEffect(() => {
        console.log('Token data:', {
            mint_address: token.mint_address,
            metadata: token.metadata,
            bondingCurveConfig: token.bondingCurveConfig,
            currentSupply: token.metadata?.currentSupply,
            bondingCurveATA: token.metadata?.bondingCurveATA,
            reserveAccount: token.metadata?.reserveAccount
        });
    }, [token]);

    // Add near the top of the component, after the state declarations
    useEffect(() => {
        if (publicKey && token.mint_address) {
            console.debug('Trading Interface State:', {
                wallet: publicKey.toString(),
                network: connection.rpcEndpoint,
                tokenMint: token.mint_address,
                bondingCurveATA: token.metadata?.bondingCurveATA,
                reserveAccount: token.metadata?.reserveAccount,
                currentPrice,
                availableSupply,
                userBalance,
                solBalance,
                reserveBalance
            });
        }
    }, [publicKey, token, connection, currentPrice, availableSupply, userBalance, solBalance, reserveBalance]);

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
                        totalCost > (convertBigIntToNumber(reserveBalance) / LAMPORTS_PER_SOL) :
                        totalCost > solBalance
                    )
            });
        }
    }, [amount, isLoading, userBalance, availableSupply, totalCost, solBalance, reserveBalance, isSelling]);

    useEffect(() => {
        console.log("Token metadata in TradingInterface:", {
            metadata: token.metadata,
            bondingCurveATA: token.metadata?.bondingCurveATA,
            reserveAccount: token.metadata?.reserveAccount
        });
    }, [token]);

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
                ⚠️ This token is on Devnet network. Make sure your wallet is connected to Devnet.
            </div>

            <div className="price-info">
                <h3>Current Price: {currentPrice.toFixed(6)} SOL</h3>
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
                            availableSupply}
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
                        {isSelling && totalCost > (reserveBalance / LAMPORTS_PER_SOL) &&
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