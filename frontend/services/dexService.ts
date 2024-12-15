import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { NATIVE_SOL_MINT } from '../constants';
import { BN } from '@project-serum/anchor';
import { getMint } from '@solana/spl-token';

interface TradeParams {
    mintAddress: string;
    amount: BN;
    isSelling: boolean;
    slippageTolerance: number;
    wallet: WalletContextState;
    connection: Connection;
}

export const dexService = {
    getTokenPrice: async (
        mintAddress: string,
        connection: Connection
    ): Promise<number | null> => {
        try {
            const response = await fetch(
                `https://api.jup.ag/price/v2?ids=${mintAddress}&showExtraInfo=true`
            );

            if (!response.ok) return null;

            const priceData = await response.json();
            return Number(priceData.data[mintAddress]?.price) || null;
        } catch (error) {
            console.error('Error fetching token price:', error);
            return null;
        }
    },

    calculateTradePrice: async (
        mintAddress: string,
        amount: number,
        isSelling: boolean,
        connection: Connection
    ) => {
        try {
            const inputMint = isSelling ? mintAddress : NATIVE_SOL_MINT;
            const outputMint = isSelling ? NATIVE_SOL_MINT : mintAddress;

            // Get token decimals from the mint account
            const tokenMint = await getMint(connection, new PublicKey(mintAddress));
            const baseAmount = isSelling
                ? amount * (10 ** tokenMint.decimals)  // Use actual token decimals
                : amount * (10 ** 9); // SOL always uses 9 decimals

            const response = await fetch(
                `https://quote-api.jup.ag/v6/quote?` +
                `inputMint=${inputMint}` +
                `&outputMint=${outputMint}` +
                `&amount=${baseAmount}`
            );

            const quoteResponse = await response.json();

            if (!response.ok || !quoteResponse.outAmount) {
                return { price: 0, totalCost: 0, isSelling };
            }

            if (isSelling) {
                const solReceived = Number(quoteResponse.outAmount) / (10 ** 9); // Only SOL decimals
                const pricePerToken = solReceived / amount;
                return {
                    price: pricePerToken,
                    totalCost: solReceived,
                    isSelling
                };
            } else {
                const solNeeded = Number(quoteResponse.inAmount) / (10 ** 9); // Only SOL decimals
                const pricePerToken = solNeeded / amount;
                return {
                    price: pricePerToken,
                    totalCost: solNeeded,
                    isSelling
                };
            }
        } catch (error) {
            console.error('Error calculating trade price:', error);
            return { price: 0, totalCost: 0, isSelling };
        }
    },

    executeTrade: async ({
        mintAddress,
        amount,
        isSelling,
        slippageTolerance,
        wallet,
        connection
    }: TradeParams) => {
        try {
            const inputMint = isSelling ? mintAddress : NATIVE_SOL_MINT;
            const outputMint = isSelling ? NATIVE_SOL_MINT : mintAddress;

            // Get token decimals for the amount conversion
            const tokenMint = await getMint(connection, new PublicKey(mintAddress));
            const baseAmount = amount * (10 ** tokenMint.decimals);

            const quoteResponse = await fetch(
                `https://quote-api.jup.ag/v6/quote?` +
                `inputMint=${inputMint}` +
                `&outputMint=${outputMint}` +
                `&amount=${baseAmount}` +
                `&slippageBps=${Math.floor(slippageTolerance * 10000)}`
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
            const latestBlockhash = await connection.getLatestBlockhash();

            const signature = await connection.sendRawTransaction(signedTx.serialize(), {
                skipPreflight: true,
                maxRetries: 2
            });

            await connection.confirmTransaction({
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
};