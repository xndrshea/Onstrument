import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { createToken } from '../../utils/tokenCreation'
import { tokenService } from '../../services/tokenService'

interface TokenFormData {
    name: string
    symbol: string
    description: string
    image: File | null
    supply: number
}

interface TokenCreationFormProps {
    onSuccess?: () => void
}

export function TokenCreationForm({ onSuccess }: TokenCreationFormProps) {
    const { connection } = useConnection()
    const { connected, publicKey, sendTransaction } = useWallet()
    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        description: '',
        image: null,
        supply: 1000000000,
    })
    const [isCreating, setIsCreating] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!connected || !publicKey) {
            alert('Please connect your wallet first')
            return
        }

        try {
            setIsCreating(true)

            // Create the token with fixed 9 decimals
            const { transaction, mintKeypair } = await createToken(
                connection,
                publicKey,
                9
            )

            // Send the transaction
            const signature = await sendTransaction(transaction, connection, {
                signers: [mintKeypair]
            })

            // Wait for confirmation
            await connection.confirmTransaction(signature)

            // Save token data
            await tokenService.createToken({
                mint: mintKeypair.publicKey.toString(),
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                creator: publicKey.toString(),
                supply: formData.supply,
                // Handle image upload separately in production
            })

            alert(`Token created successfully! Mint address: ${mintKeypair.publicKey.toString()}`)

            if (onSuccess) {
                onSuccess()
            }

            // Reset form
            setFormData({
                name: '',
                symbol: '',
                description: '',
                image: null,
                supply: 1000000000,
            })
        } catch (error) {
            console.error('Error creating token:', error)
            alert('Failed to create token. See console for details.')
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className="token-creation-form">
            <h2>Create Your Token</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="name">Token Name</label>
                    <input
                        type="text"
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., My Awesome Token"
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="symbol">Token Symbol</label>
                    <input
                        type="text"
                        id="symbol"
                        value={formData.symbol}
                        onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                        placeholder="e.g., MAT"
                        maxLength={5}
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Describe your token..."
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="image">Token Logo (Optional)</label>
                    <input
                        type="file"
                        id="image"
                        accept="image/*"
                        onChange={(e) => {
                            if (e.target.files?.[0]) {
                                setFormData(prev => ({ ...prev, image: e.target.files![0] }))
                            }
                        }}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="supply">Total Supply</label>
                    <input
                        type="number"
                        id="supply"
                        value={formData.supply}
                        onChange={(e) => {
                            const value = parseInt(e.target.value)
                            if (value > 0) {
                                setFormData(prev => ({ ...prev, supply: value }))
                            }
                        }}
                        min="1"
                        required
                    />
                    <small className="help-text">The total number of tokens to create (with 9 decimal places)</small>
                </div>

                <button type="submit" disabled={!connected || isCreating}>
                    {isCreating ? 'Creating Token...' : 'Create Token'}
                </button>
            </form>
        </div>
    )
} 