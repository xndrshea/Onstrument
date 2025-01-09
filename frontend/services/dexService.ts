import { Connection, VersionedTransaction, PublicKey } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { NATIVE_SOL_MINT } from '../constants';
import { BN } from '@project-serum/anchor';
import { mainnetConnection } from '../config';
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

export const dexService = {
    getTokenPrice: async (
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
    },

    calculateTradePrice: async (
        mintAddress: string,
        amount: number,
        isSelling: boolean,
        _connection: Connection
    ) => {
        if (!amount || isNaN(amount) || amount <= 0) {
            return null;
        }

        try {
            const mintInfo = await mainnetConnection.getParsedAccountInfo(
                new PublicKey(mintAddress)
            );

            if (!mintInfo.value?.data || typeof mintInfo.value.data !== 'object') {
                throw new Error('Failed to get mint info');
            }

            const tokenDecimals = (mintInfo.value.data as any).parsed.info.decimals;

            // For buying: amount is desired token amount
            // For selling: amount is token amount to sell
            const inputMint = isSelling ? mintAddress : NATIVE_SOL_MINT;
            const outputMint = isSelling ? NATIVE_SOL_MINT : mintAddress;
            const calculatedAmount = Math.floor(amount * 10 ** tokenDecimals);

            console.log('Trade calculation:', {
                isSelling,
                rawAmount: amount,
                calculatedAmount,
                tokenDecimals,
                inputMint,
                outputMint
            });

            const url = `https://quote-api.jup.ag/v6/quote?` +
                `inputMint=${inputMint}` +
                `&outputMint=${outputMint}` +
                `&amount=${calculatedAmount}` +
                `&swapMode=${isSelling ? 'ExactIn' : 'ExactOut'}`;

            const response = await fetch(url);
            const quoteResponse = await response.json();

            if (!response.ok || !quoteResponse.outAmount) {
                console.error('Invalid quote response:', quoteResponse);
                return null;
            }

            let price, totalCost;

            if (isSelling) {
                const solReceived = Number(quoteResponse.outAmount) / 1e9;
                price = solReceived / amount;  // Price per token
                totalCost = solReceived;
            } else {
                const solNeeded = Number(quoteResponse.inAmount) / 1e9;
                price = solNeeded / amount;  // Price per token
                totalCost = solNeeded;
            }

            return {
                price,
                totalCost,
                isSelling
            };
        } catch (error) {
            console.error('Error calculating trade price:', error);
            return null;
        }
    },

    executeTrade: async ({
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
            const latestBlockhash = await mainnetConnection.getLatestBlockhash();

            const signature = await mainnetConnection.sendRawTransaction(signedTx.serialize(), {
                skipPreflight: true,
                maxRetries: 2
            });

            await mainnetConnection.confirmTransaction({
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