import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { createTokenParams } from '../../../shared/types/token'
import { BN } from 'bn.js'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { TokenFormData } from '../../../shared/types/token'
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
        supply: 0,
        totalSupply: new BN(0),
        curveConfig: {
            migrationStatus: 'active',
            isSubscribed: false,
            developer: wallet.publicKey?.toString() || ''
        }
    })

    const validateForm = (): boolean => {
        if (!wallet.publicKey) {
            setError('Please connect your wallet')
            return false
        }
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
        return true
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!validateForm()) return

        setIsLoading(true)
        setError(null)
        setSuccess(false)

        try {
            const params: createTokenParams = {
                name: formData.name,
                symbol: formData.symbol,
                totalSupply: formData.totalSupply,
                metadataUri: `https://arweave.net/test-metadata`,
                curveConfig: {
                    migrationStatus: 'active',
                    isSubscribed: false,
                    developer: wallet.publicKey!.toString()
                }
            }

            const result = await tokenTransactionService.createToken(params, formData.description)

            if (!result || !result.mintAddress) {
                throw new Error('Transaction failed - invalid result')
            }

            const mintAccount = await connection.getAccountInfo(new PublicKey(result.mintAddress))
            if (!mintAccount) {
                throw new Error('Failed to verify mint account creation')
            }

            setSuccess(true)
            onSuccess?.()
            onTokenCreated?.()
        } catch (error: any) {
            console.error('Token creation failed:', error)
            setError(error.message || 'Failed to create token')
        } finally {
            setIsLoading(false)
        }
    }

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
                <label>Total Supply</label>
                <input
                    type="number"
                    onChange={e => setFormData({
                        ...formData,
                        totalSupply: new BN(parseInt(e.target.value) * (10 ** TOKEN_DECIMALS))
                    })}
                    min="1"
                    required
                />
            </div>

            <button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating Token...' : 'Create Token'}
            </button>
        </form>
    )
} 