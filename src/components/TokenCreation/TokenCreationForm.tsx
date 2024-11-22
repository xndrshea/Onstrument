import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { createToken } from '../../utils/tokenCreation'
import { tokenService } from '../../services/tokenService'
import { ConfirmOptions } from '@solana/web3.js'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { clusterApiUrl } from '@solana/web3.js'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Transaction } from '@solana/web3.js'
import { Keypair } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { getMint, getAccount } from '@solana/spl-token'
import { Connection, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58';

interface TokenFormData {
    name: string
    symbol: string
    description: string
    image: File | null
    supply: number
}

interface TokenCreationFormProps {
    onSuccess?: () => void
    onTokenCreated?: () => void
}

export function TokenCreationForm({ onSuccess, onTokenCreated }: TokenCreationFormProps) {
    const { connection } = useConnection()
    const { connected, publicKey, sendTransaction } = useWallet()
    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        description: '',
        image: null,
        supply: 1000000
    })
    const [isCreating, setIsCreating] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!publicKey) return

        setIsCreating(true)
        setTransactionStatus('Creating token...')

        try {
            const result = await createToken({
                connection,
                wallet: { publicKey, sendTransaction },
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                totalSupply: formData.supply
            })

            setTransactionStatus('Sending transaction...')

            const signature = await sendTransaction(result.transaction, connection)
            setTransactionStatus('Confirming transaction...')

            const confirmation = await connection.confirmTransaction({
                signature,
                lastValidBlockHeight: result.lastValidBlockHeight,
                blockhash: result.transaction.recentBlockhash!
            })

            if (confirmation.value.err) {
                throw new Error('Transaction failed to confirm')
            }

            setTransactionStatus('Saving token data...')

            await tokenService.saveToken({
                mint_address: result.mintKeypair.publicKey.toBase58(),
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                creator: publicKey.toBase58(),
                total_supply: formData.supply,
                metadata: {
                    bondingCurveATA: result.bondingCurveATA,
                    reserveAccount: result.metadata.reserveAccount
                }
            })

            setTransactionStatus('Token created successfully!')
            if (onSuccess) onSuccess()
            if (onTokenCreated) onTokenCreated()
        } catch (error) {
            console.error('Error creating token:', error)
            setTransactionStatus(`Error: ${error.message}`)
        } finally {
            setIsCreating(false)
        }
    }

    const resetForm = () => {
        setFormData({
            name: '',
            symbol: '',
            description: '',
            image: null,
            supply: 0
        })
        setIsCreating(false)
    }

    return (
        <div className="token-creation-form">
            <div className="network-warning" style={{
                backgroundColor: '#fff3cd',
                color: '#856404',
                padding: '1rem',
                marginBottom: '1rem',
                borderRadius: '4px'
            }}>
                ⚠️ You are creating a token on Devnet. Make sure your wallet is connected to Devnet network.
            </div>
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
                    <label htmlFor="symbol">Symbol</label>
                    <input
                        type="text"
                        id="symbol"
                        value={formData.symbol}
                        onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                        placeholder="e.g., TOKEN"
                        maxLength={10}
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
                        onChange={(e) => setFormData(prev => ({ ...prev, supply: parseInt(e.target.value) }))}
                        min="1"
                        required
                    />
                    <small className="help-text">The total number of tokens to create. Initial price will be based on 1 SOL liquidity already being provided.</small>
                </div>

                <button type="submit" disabled={!connected || isCreating}>
                    {isCreating ? 'Creating Token...' : 'Create Token'}
                </button>
            </form>
            {transactionStatus && <div className="transaction-status">{transactionStatus}</div>}
        </div>
    )
} 