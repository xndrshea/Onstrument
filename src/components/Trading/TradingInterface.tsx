import React, { useState, useEffect } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { BondingCurve, DEFAULT_BONDING_CURVE_CONFIG } from '../../services/bondingCurve'
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
    createBurnInstruction
} from '@solana/spl-token'
import { TokenData } from '../../services/tokenService'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { sendAndConfirmTransaction } from '@solana/web3.js'
import { initializeToken } from '../../utils/tokenCreation'
import { tokenService } from '../../services/tokenService'
import { verifyDevnetConnection } from '../../utils/network'

interface TradingInterfaceProps {
    token: TokenData
}

// Add this helper function at the top of the file
function deserializeKeypair(serializedKeypair: string): Keypair {
    const secretKey = Buffer.from(serializedKeypair, 'base58');
    return Keypair.fromSecretKey(secretKey);
}

export function TradingInterface({ token }: TradingInterfaceProps) {
    const { connection } = useConnection()
    const { publicKey, sendTransaction, connected } = useWallet()
    const [amount, setAmount] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [currentPrice, setCurrentPrice] = useState<number>(0)
    const [totalCost, setTotalCost] = useState<number>(0)
    const [availableSupply, setAvailableSupply] = useState<number>(0)
    const [userBalance, setUserBalance] = useState<number>(0)
    const [isSelling, setIsSelling] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')
    const [solBalance, setSolBalance] = useState<number>(0)
    const [reserveBalance, setReserveBalance] = useState<number>(0)

    // Initialize bonding curve with token's metadata
    const bondingCurve = new BondingCurve({
        initialPrice: token.bondingCurveConfig?.initialPrice || DEFAULT_BONDING_CURVE_CONFIG.initialPrice,
        slope: token.bondingCurveConfig?.slope || DEFAULT_BONDING_CURVE_CONFIG.slope,
        initialSupply: token.metadata?.currentSupply || token.metadata?.initialSupply || DEFAULT_BONDING_CURVE_CONFIG.initialSupply,
        maxSupply: token.total_supply,
        reserveRatio: token.bondingCurveConfig?.reserveRatio || DEFAULT_BONDING_CURVE_CONFIG.reserveRatio
    })

    // Update price calculation useEffect
    useEffect(() => {
        if (!amount || isNaN(parseFloat(amount))) {
            setCurrentPrice(0);
            setTotalCost(0);
            return;
        }

        try {
            const amountNum = parseFloat(amount);
            if (isSelling) {
                // For selling, calculate how much SOL user will receive
                const returnAmount = bondingCurve.getReturn(amountNum);
                setCurrentPrice(returnAmount / LAMPORTS_PER_SOL / amountNum); // Price per token in SOL
                setTotalCost(returnAmount / LAMPORTS_PER_SOL); // Total SOL to receive
            } else {
                // For buying, calculate how much SOL user needs to pay
                const costAmount = bondingCurve.getCost(amountNum);
                setCurrentPrice(costAmount / LAMPORTS_PER_SOL / amountNum); // Price per token in SOL
                setTotalCost(costAmount / LAMPORTS_PER_SOL); // Total SOL to pay
            }
        } catch (error) {
            console.error('Error calculating price:', error);
            setCurrentPrice(0);
            setTotalCost(0);
        }
    }, [amount, isSelling, bondingCurve]);

    // Format supply numbers correctly
    const formatSupply = (supply: number): string => {
        // First convert from raw units to token units
        const adjustedSupply = supply / Math.pow(10, 9);

        if (adjustedSupply >= 1e9) {
            return `${(adjustedSupply / 1e9).toFixed(2)}B`
        } else if (adjustedSupply >= 1e6) {
            return `${(adjustedSupply / 1e6).toFixed(2)}M`
        } else if (adjustedSupply >= 1e3) {
            return `${(adjustedSupply / 1e3).toFixed(2)}K`
        }
        return adjustedSupply.toFixed(2)
    }

    // Update the balance fetching logic
    useEffect(() => {
        let mounted = true;
        const fetchBalances = async () => {
            if (!publicKey || !token.mint_address) return;

            try {
                // Add delay between requests
                await new Promise(resolve => setTimeout(resolve, 1000));

                const bondingCurveATA = await getAccount(
                    connection,
                    new PublicKey(token.metadata?.bondingCurveATA || '')
                );

                if (mounted) {
                    console.log('Bonding Curve ATA balance:', bondingCurveATA.amount.toString());
                    setBondingCurveBalance(bondingCurveATA.amount);
                }
            } catch (error) {
                console.error('Error fetching balances:', error);
            }
        };

        fetchBalances();
        // Increase polling interval to avoid rate limits
        const interval = setInterval(fetchBalances, 30000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [publicKey, connection, token.mint_address, token.metadata?.bondingCurveATA]);

    const handlePurchase = async () => {
        if (!publicKey || !token.mint_address || !token.metadata?.bondingCurveATA || !token.metadata?.reserveAccount) {
            alert('Missing required token data');
            return;
        }

        try {
            setIsLoading(true);
            setTransactionStatus('Processing purchase...');

            const purchaseAmount = parseFloat(amount);
            const costInLamports = bondingCurve.getCost(purchaseAmount);

            // Create transaction
            const transaction = new Transaction();

            // Always create ATA instruction first
            const userATA = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            try {
                await getAccount(connection, userATA);
            } catch (error) {
                // If account doesn't exist, add create instruction
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey,
                        userATA,
                        publicKey,
                        new PublicKey(token.mint_address)
                    )
                );
            }

            // 1. Transfer SOL to reserve
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: new PublicKey(token.metadata.reserveAccount),
                    lamports: costInLamports
                })
            );

            // 2. Mint new tokens to user
            transaction.add(
                createMintToInstruction(
                    new PublicKey(token.mint_address),
                    userATA.address,
                    new PublicKey(token.metadata.bondingCurveATA),
                    Math.floor(purchaseAmount * Math.pow(10, 9))
                )
            );

            // Get recent blockhash and sign
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // Send and confirm
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            // Update UI state
            setTransactionStatus('Purchase successful!');
            await updateBalances();
            setAmount('');

        } catch (error) {
            console.error('Purchase error:', error);
            setTransactionStatus('');
            if (error instanceof TokenAccountNotFoundError) {
                alert('Setting up your token account...');
                // Transaction will handle this case
            } else {
                alert('Error processing purchase. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSell = async () => {
        if (!publicKey || !token.mint_address || !token.metadata?.bondingCurveATA || !token.metadata?.reserveAccount) {
            alert('Missing required token data');
            return;
        }

        try {
            setIsLoading(true);
            setTransactionStatus('Processing sale...');

            const sellAmount = parseFloat(amount);
            const returnAmount = bondingCurve.getReturn(sellAmount);

            // Create transaction
            const transaction = new Transaction();

            // Get user's ATA
            const userATA = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            // 1. Burn tokens from user
            transaction.add(
                createBurnInstruction(
                    userATA,
                    new PublicKey(token.mint_address),
                    publicKey,
                    Math.floor(sellAmount * Math.pow(10, 9))
                )
            );

            // 2. Transfer SOL from reserve to user
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: new PublicKey(token.metadata.reserveAccount),
                    toPubkey: publicKey,
                    lamports: returnAmount
                })
            );

            // Get recent blockhash and sign
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

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

    const updateBalances = async () => {
        if (!publicKey || !token.mint_address) return;

        try {
            // Get SOL balance
            const solBalanceRaw = await connection.getBalance(publicKey);
            setSolBalance(solBalanceRaw / LAMPORTS_PER_SOL);

            // Get token balance
            const userATA = await getAssociatedTokenAddress(
                new PublicKey(token.mint_address),
                publicKey
            );

            try {
                const tokenAccount = await getAccount(connection, userATA);
                setUserBalance(Number(tokenAccount.amount) / Math.pow(10, 9));
            } catch (e) {
                setUserBalance(0);
            }

            // Get available supply
            if (token.metadata?.bondingCurveATA) {
                try {
                    const bondingCurveATA = await getAccount(
                        connection,
                        new PublicKey(token.metadata.bondingCurveATA)
                    );
                    setAvailableSupply(Number(bondingCurveATA.amount) / Math.pow(10, 9));
                } catch (e) {
                    setAvailableSupply(0);
                }
            }

            // Get reserve balance
            if (token.metadata?.reserveAccount) {
                const reserveBalanceRaw = await connection.getBalance(
                    new PublicKey(token.metadata.reserveAccount)
                );
                setReserveBalance(reserveBalanceRaw);
            }
        } catch (error) {
            console.error('Error updating balances:', error);
        }
    };

    // Add to useEffect
    useEffect(() => {
        updateBalances();
        // Set up polling for balance updates
        const interval = setInterval(updateBalances, 10000);
        return () => clearInterval(interval);
    }, [publicKey, token.mint_address, token.metadata?.bondingCurveATA, connection]);

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
                userBalance: userBalance / Math.pow(10, 9),
                availableSupply: availableSupply / Math.pow(10, 9),
                totalCost,
                solBalance,
                isDisabled: isLoading ||
                    !amount ||
                    parseFloat(amount) <= 0 ||
                    (isSelling ?
                        parseFloat(amount) > userBalance :
                        parseFloat(amount) > availableSupply
                    ) ||
                    (isSelling ?
                        totalCost > (reserveBalance / LAMPORTS_PER_SOL) :
                        totalCost > solBalance
                    )
            });
        }
    }, [amount, isLoading, userBalance, availableSupply, totalCost, solBalance, reserveBalance, isSelling]);

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
                        max={isSelling ? userBalance : availableSupply}
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
                    disabled={
                        isLoading ||
                        !amount ||
                        parseFloat(amount) <= 0 ||
                        (isSelling ?
                            parseFloat(amount) > userBalance :
                            parseFloat(amount) > availableSupply
                        ) ||
                        (isSelling ?
                            totalCost > (reserveBalance / LAMPORTS_PER_SOL) :
                            totalCost > solBalance
                        )
                    }
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