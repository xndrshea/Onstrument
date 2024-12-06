import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { createTokenParams } from '../../../shared/types/token'
import { BN } from 'bn.js'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { TokenFormData } from '../../../shared/types/token';
import { PublicKey } from '@solana/web3.js'
import { TOKEN_DECIMALS } from '../../services/bondingCurve'
interface TokenCreationFormProps {
    onSuccess?: () => void
    onTokenCreated?: () => void
}

export function TokenCreationForm({ onSuccess, onTokenCreated }: TokenCreationFormProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const tokenTransactionService = new TokenTransactionService(connection, wallet)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        description: '',
        image: null,
        supply: 1000000,
        virtualSol: 30,
    })

    const validateForm = (): boolean => {
        if (!formData.name.trim()) {
            setError('Token name is required')
            return false
        }
        if (!formData.symbol.trim()) {
            setError('Token symbol is required')
            return false
        }
        if (formData.symbol.length > 10) {
            setError('Token symbol must be 10 characters or less')
            return false
        }
        if (formData.supply <= 0) {
            setError('Supply must be greater than 0')
            return false
        }
        if (formData.virtualSol <= 0) {
            setError('Base price must be greater than 0')
            return false
        }
        return true
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccess(false);

        try {
            // Create the params object for on-chain creation
            const params: createTokenParams = {
                name: formData.name,
                symbol: formData.symbol,
                totalSupply: new BN(formData.supply * (10 ** TOKEN_DECIMALS)),
                metadataUri: `https://arweave.net/test-metadata`,
                curveConfig: {
                    virtualSol: new BN(formData.virtualSol * LAMPORTS_PER_SOL),
                }
            };

            // Pass both the params and the description
            const result = await tokenTransactionService.createToken(params, formData.description);

            // Verify the transaction was successful
            if (!result || !result.mintAddress) {
                throw new Error('Transaction failed - invalid result');
            }

            // Additional verification could be added here
            const mintAccount = await connection.getAccountInfo(new PublicKey(result.mintAddress));
            if (!mintAccount) {
                throw new Error('Failed to verify mint account creation');
            }

            console.log('Token created successfully:', result);
            setSuccess(true);
            onSuccess?.();
            onTokenCreated?.();
        } catch (error: any) {
            console.error('Token creation failed:', error);

            // Enhanced error handling
            let errorMessage = 'Failed to create token';

            if (error.message?.includes('Simulation failed')) {
                errorMessage = 'Transaction simulation failed. Please check your wallet balance and parameters.';
            } else if (error.message?.includes('0x1')) {
                errorMessage = 'Insufficient balance to create token';
            } else if (error.message?.includes('6007')) {
                errorMessage = 'Invalid curve configuration parameters';
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }

            setError(errorMessage);
            setSuccess(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="token-creation-form">
            <h2>Create New Token</h2>

            {error && (
                <div className="alert error">
                    <p>{error}</p>
                </div>
            )}

            {success && (
                <div className="alert success">
                    <p>Token created successfully!</p>
                </div>
            )}

            <div className="form-group">
                <label>Token Name</label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter token name"
                    required
                />
            </div>

            <div className="form-group">
                <label>Symbol</label>
                <input
                    type="text"
                    value={formData.symbol}
                    onChange={e => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    placeholder="Enter token symbol"
                    maxLength={10}
                    required
                />
            </div>

            <div className="form-group">
                <label>Description</label>
                <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter token description"
                />
            </div>

            <div className="form-group">
                <label>Supply</label>
                <input
                    type="number"
                    value={formData.supply}
                    onChange={e => setFormData({ ...formData, supply: parseInt(e.target.value) })}
                    min="1"
                    required
                />
            </div>

            <div className="form-group">
                <label>Virtual SOL / Starting Market Cap</label>
                <input
                    type="number"
                    value={formData.virtualSol}
                    onChange={e => setFormData({ ...formData, virtualSol: parseFloat(e.target.value) })}
                    min="0.000001"
                    step="0.000001"
                    required
                />
            </div>

            <button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating Token...' : 'Create Token'}
            </button>
        </form>
    );
} 