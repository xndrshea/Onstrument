import type { Connection } from '@solana/web3.js';
import { VersionedTransaction, PublicKey, Transaction } from '@solana/web3.js';
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
    // Try Phantom first
    if ('phantom' in window) {
        const provider = (window as any).phantom?.solana;
        if (provider?.isPhantom) {
            return provider;
        }
    }

    // Fallback to standard wallet adapter
    return {
        signAndSendTransaction: async (tx: Transaction | VersionedTransaction) => {
            const signature = await wallet.sendTransaction(tx, connection);
            return { signature };
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
            const inputMint = isSelling ? mintAddress : NATIVE_SOL_MINT;
            const outputMint = isSelling ? NATIVE_SOL_MINT : mintAddress;
            const platformFeeBps = isSubscribed ? 0 : 100;

            const quoteResponse = await fetch(
                `https://quote-api.jup.ag/v6/quote?` +
                `inputMint=${inputMint}` +
                `&outputMint=${outputMint}` +
                `&amount=${amount}` +
                `&slippageBps=${Math.floor(slippageTolerance * 10000)}` +
                `&platformFeeBps=${platformFeeBps}` +
                `&computeUnitPriceMicroLamports=500000` +
                `&asLegacyTransaction=true`
            ).then(res => res.json());

            if (!quoteResponse || quoteResponse.error) {
                throw new Error(quoteResponse.error || 'Failed to get quote');
            }

            const { swapTransaction } = await fetch('https://quote-api.jup.ag/v6/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse,
                    userPublicKey: wallet.publicKey!.toString(),
                    wrapAndUnwrapSol: true,
                    feeAccount: platformFeeBps > 0 ? 'E5Qsw5J8F7WWZT69sqRsmCrYVcMfqcoHutX31xCxhM9L' : undefined,
                    computeUnitLimit: 300000,
                    computeUnitPrice: 500000,
                    asLegacyTransaction: true,
                    dynamicComputeUnitLimit: true
                })
            }).then(res => res.json());

            const provider = getProvider(wallet, connection);
            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

            const { signature } = await provider.signAndSendTransaction(transaction);

            let done = false;
            let retries = 30;
            while (!done && retries > 0) {
                const status = await connection.getSignatureStatus(signature);

                if (status?.value?.confirmationStatus === 'confirmed') {
                    done = true;
                } else if (status?.value?.confirmationStatus === 'processed' || status?.value?.confirmationStatus === 'finalized') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries--;
                } else if (!status?.value) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retries--;
                } else {
                    throw new Error(`Transaction failed with status: ${status?.value?.confirmationStatus}`);
                }
            }

            if (!done) {
                throw new Error('Transaction confirmation timeout');
            }

            return signature;

        } catch (error) {
            console.error('Swap error:', error);
            throw new Error('Failed to execute swap');
        }
    }
}