import type { Connection } from '@solana/web3.js';
import { VersionedTransaction, PublicKey, Transaction, TransactionMessage, VersionedMessage } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { NATIVE_SOL_MINT } from '../constants';
import type { BN } from '@project-serum/anchor';
import { getConnection, getConnectionForToken } from '../config';
import { getMint } from '@solana/spl-token';

interface TradeParams {
    mintAddress: string;
    amount: BN;
    isSelling: boolean;
    slippageTolerance: number;
    wallet: WalletContextState;
    connection: Connection;
    isSubscribed: boolean;
}

type PriceQuote = {
    price: number;
    totalCost: number;
    outAmount: string | number;
    isSelling: boolean;
};

function getProvider(wallet: WalletContextState, connection: Connection) {
    // Enhanced provider detection with Phantom priority
    const phantomProvider = (window as any).phantom?.solana;
    if (phantomProvider?.isPhantom) return phantomProvider;

    // Updated fallback to use modern signing method
    return {
        signAndSendTransaction: async (transaction: VersionedTransaction) => {
            // Use wallet-adapter's sendTransaction instead of manual signing
            return await wallet.sendTransaction(transaction, connection);
        }
    };
}

export class DexService {
    constructor() {
        // No need to create connection here
    }

    getTokenPrice = async (
        mintAddress: string,
        _connection: Connection
    ): Promise<number | null> => {
        try {
            const response = await fetch(
                `https://price.jup.ag/v4/price?` +
                `ids=${mintAddress}` +
                `&vsToken=SOL`
            );

            if (!response.ok) return null;

            const priceData = await response.json();
            return priceData.data[mintAddress]?.price || null;
        } catch (error) {
            console.error('Error fetching token price:', error);
            return null;
        }
    };

    calculateTradePrice = async (
        mintAddress: string,
        amount: number,
        isSelling: boolean,
        connection: Connection
    ): Promise<PriceQuote | null> => {
        if (!amount || isNaN(amount) || amount <= 0) {
            return null;
        }

        try {
            const mintInfo = await getConnectionForToken({ tokenType: 'dex' }).getParsedAccountInfo(
                new PublicKey(mintAddress)
            );

            if (!mintInfo.value?.data || typeof mintInfo.value.data !== 'object') {
                throw new Error('Failed to get mint info');
            }

            const tokenDecimals = (mintInfo.value.data as any).parsed.info.decimals;

            // For buying: amount is in SOL
            // For selling: amount is in tokens
            const inputMint = isSelling ? mintAddress : NATIVE_SOL_MINT;
            const outputMint = isSelling ? NATIVE_SOL_MINT : mintAddress;

            // Convert input amount to smallest units (lamports or token decimals)
            const calculatedAmount = isSelling
                ? Math.floor(amount * (10 ** tokenDecimals))  // Convert token amount to raw units
                : Math.floor(amount * 1e9);                   // Convert SOL to lamports

            const url = `https://quote-api.jup.ag/v6/quote?` +
                `inputMint=${inputMint}` +
                `&outputMint=${outputMint}` +
                `&amount=${calculatedAmount}` +
                `&swapMode=ExactIn`;

            const response = await fetch(url);
            const quoteResponse = await response.json();

            if (!response.ok) {
                console.error('Quote failed:', quoteResponse);
                return null;
            }

            if (isSelling) {
                // Selling tokens for SOL
                const solReceived = Number(quoteResponse.outAmount) / 1e9;  // Convert lamports to SOL
                return {
                    price: solReceived / amount,  // SOL per token
                    totalCost: solReceived,       // Total SOL you'll receive
                    outAmount: solReceived,
                    isSelling: true
                };
            } else {
                // Buying tokens with SOL
                const tokensReceived = Number(quoteResponse.outAmount) / (10 ** tokenDecimals);
                return {
                    price: tokensReceived,  // How many tokens you get for 1 SOL
                    totalCost: amount,      // Total SOL being spent
                    outAmount: tokensReceived,
                    isSelling: false
                };
            }
        } catch (error) {
            console.error('Error calculating trade price:', error);
            return null;
        }
    };

    executeTrade = async ({
        mintAddress,
        amount,
        isSelling,
        slippageTolerance,
        wallet,
        connection,
        isSubscribed
    }: TradeParams) => {
        try {
            const provider = getProvider(wallet, connection);
            if (!provider) throw new Error('Wallet provider not available');

            // Get fresh blockhash for each transaction
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

            // Enhanced swap request with proper blockhash usage
            const { swapTransaction } = await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse: await this.getQuoteResponse(
                        mintAddress,
                        amount,
                        isSelling,
                        slippageTolerance,
                        isSubscribed
                    ),
                    userPublicKey: wallet.publicKey!.toString(),
                    wrapAndUnwrapSol: true,
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: {
                        priorityLevelWithMaxLamports: {
                            maxLamports: 10000000,
                            priorityLevel: "high"
                        }
                    },
                    feeAccount: isSubscribed ? undefined : 'E5Qsw5J8F7WWZT69sqRsmCrYVcMfqcoHutX31xCxhM9L',
                })
            }).then(async res => {
                const response = await res.json();
                if (response.simulationError) {
                    throw new Error(`Swap simulation failed: ${response.simulationError}`);
                }
                return response;
            });

            // Deserialize with versioned transaction validation
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const versionedTx = VersionedTransaction.deserialize(swapTransactionBuf);

            // Validate transaction structure
            if (!(versionedTx instanceof VersionedTransaction)) {
                throw new Error('Invalid transaction format from Jupiter API');
            }

            // Sign and send with proper blockhash context
            const { signature } = await provider.signAndSendTransaction(versionedTx);

            // Confirm with transaction-specific blockhash
            const confirmation = await connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight
            }, 'confirmed');

            if (confirmation.value.err) {
                throw new Error('Transaction failed on-chain execution');
            }

            return signature;
        } catch (error) {
            console.error('Swap execution error:', error);
            throw new Error(`Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private getQuoteResponse = async (
        mintAddress: string,
        amount: BN,
        isSelling: boolean,
        slippageTolerance: number,
        isSubscribed: boolean
    ) => {
        const mint = await getMint(getConnection(), new PublicKey(mintAddress));
        const inputMint = isSelling ? mintAddress : NATIVE_SOL_MINT;
        const outputMint = isSelling ? NATIVE_SOL_MINT : mintAddress;
        const calculatedAmount = isSelling
            ? amount.toNumber()
            : amount.toNumber() * 1e9;

        const response = await fetch(
            `https://quote-api.jup.ag/v6/quote?` +
            `inputMint=${inputMint}` +
            `&outputMint=${outputMint}` +
            `&amount=${calculatedAmount}` +
            `&slippageBps=${Math.floor(slippageTolerance * 100)}` +
            `&swapMode=ExactIn`
        );

        return response.json();
    };
}