import type { Connection } from '@solana/web3.js';
import { VersionedTransaction, PublicKey } from '@solana/web3.js';
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

export class DexService {
    connection: Connection;

    constructor(token?: { tokenType: string }) {
        this.connection = getConnectionForToken(token);
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
        _connection: Connection
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
                `&platformFeeBps=${platformFeeBps}`
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
                    dynamicSlippage: { maxBps: Math.floor(slippageTolerance * 10000) },
                    dynamicComputeUnitLimit: true,
                    prioritizationFeeLamports: 'auto'
                })
            }).then(res => res.json());

            const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

            if (!wallet.signTransaction) {
                throw new Error('Wallet does not support signing');
            }

            const signedTx = await wallet.signTransaction(transaction);
            const latestBlockhash = await getConnectionForToken({ tokenType: 'dex' }).getLatestBlockhash();

            const signature = await getConnectionForToken({ tokenType: 'dex' }).sendRawTransaction(signedTx.serialize(), {
                skipPreflight: true,
                maxRetries: 2
            });

            await getConnectionForToken({ tokenType: 'dex' }).confirmTransaction({
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            });

            return signature;

        } catch (error) {
            console.error('Swap error:', error);
            throw new Error('Failed to execute swap');
        }
    }
}