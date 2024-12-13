import { Connection, VersionedTransaction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { NATIVE_SOL_MINT } from '../constants';
import { BN } from '@project-serum/anchor';
import { TOKEN_DECIMALS } from './bondingCurve';

interface TradeParams {
    mintAddress: string;
    amount: BN;
    isSelling: boolean;
    slippageTolerance: number;
    wallet: WalletContextState;
    connection: Connection;
}

export const dexService = {
    calculateTradePrice: async (
        mintAddress: string,
        amount: number,
        isSelling: boolean,
        connection: Connection
    ) => {
        try {
            const inputMint = isSelling ? mintAddress : NATIVE_SOL_MINT;
            const outputMint = isSelling ? NATIVE_SOL_MINT : mintAddress;
            const rawAmount = Math.floor(amount * (10 ** TOKEN_DECIMALS));

            const quoteResponse = await fetch(
                `https://quote-api.jup.ag/v6/quote?` +
                `inputMint=${inputMint}` +
                `&outputMint=${outputMint}` +
                `&amount=${rawAmount}`
            ).then(res => res.json());

            if (!quoteResponse || quoteResponse.error) {
                throw new Error(quoteResponse.error || 'Failed to get quote');
            }

            const outAmount = Number(quoteResponse.outAmount) / (10 ** TOKEN_DECIMALS);
            const price = isSelling ? outAmount / amount : amount / outAmount;

            return {
                price,
                totalCost: isSelling ? outAmount : amount,
                isSelling
            };
        } catch (error) {
            console.error('Error calculating trade price:', error);
            throw new Error('Failed to calculate trade price');
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

            const quoteResponse = await fetch(
                `https://quote-api.jup.ag/v6/quote?` +
                `inputMint=${inputMint}` +
                `&outputMint=${outputMint}` +
                `&amount=${amount.toString()}` +
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