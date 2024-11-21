import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { createToken } from '../../utils/tokenCreation'
import { tokenService } from '../../services/tokenService'
import { ConfirmOptions } from '@solana/web3.js'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { clusterApiUrl } from '@solana/web3.js'
import { DEFAULT_BONDING_CURVE_CONFIG } from '../../services/bondingCurve'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Transaction } from '@solana/web3.js'
import { Keypair } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { getMint, getAccount } from '@solana/spl-token'
import { Connection, PublicKey } from '@solana/web3.js'

interface TokenFormData {
    name: string
    symbol: string
    description: string
    image: File | null
    supply: number
    initialPrice: string
    slope: string
    initialSupply: string
    reserveRatio: string
}

interface TokenCreationFormProps {
    onSuccess?: () => void
    onTokenCreated?: () => void
}

function serializeKeypair(keypair: Keypair): string {
    return Buffer.from(keypair.secretKey).toString('base58')
}

export function TokenCreationForm({ onSuccess, onTokenCreated }: TokenCreationFormProps) {
    const { connection } = useConnection()
    const { connected, publicKey, sendTransaction } = useWallet()
    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        description: '',
        image: null,
        supply: 1000000,
        initialPrice: '0.1',
        slope: '0.1',
        initialSupply: '1000000',
        reserveRatio: '0.5'
    })
    const [isCreating, setIsCreating] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!connected || !publicKey) {
            alert('Please connect your wallet first')
            return
        }

        setIsCreating(true)
        setTransactionStatus('Creating token...')

        try {
            const { mintKeypair, bondingCurveKeypair, reserveAccount, transaction, bondingCurveATA, metadata, bondingCurveConfig } =
                await createToken(connection, publicKey, formData)

            // Get the latest blockhash
            const { blockhash } = await connection.getLatestBlockhash()
            transaction.recentBlockhash = blockhash
            transaction.feePayer = publicKey

            // Add all signers
            transaction.sign(mintKeypair, bondingCurveKeypair, reserveAccount)

            // Send and confirm transaction
            const signature = await sendTransaction(transaction, connection)
            console.log('Transaction sent:', signature)
            await connection.confirmTransaction(signature, 'confirmed')
            console.log('Transaction confirmed')

            // Save token with actual on-chain data
            await tokenService.saveToken({
                mint_address: mintKeypair.publicKey.toBase58(),
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                creator: publicKey.toBase58(),
                total_supply: metadata.initialSupply,
                metadata: {
                    bondingCurveATA,
                    reserveAccount: reserveAccount.publicKey.toBase58(),
                    initialSupply: metadata.initialSupply,
                    currentSupply: metadata.currentSupply
                },
                bondingCurveConfig: {
                    initialPrice: parseFloat(formData.initialPrice),
                    slope: parseFloat(formData.slope),
                    reserveRatio: parseFloat(formData.reserveRatio)
                }
            })

            setTransactionStatus('Token created successfully!')
            if (onSuccess) onSuccess()
            if (onTokenCreated) onTokenCreated()

        } catch (error) {
            console.error('Token creation error:', error)
            setTransactionStatus('')
            alert(error instanceof Error ? error.message : 'Failed to create token')
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
            supply: 1000000,
            initialPrice: '0.1',
            slope: '0.1',
            initialSupply: '1000000',
            reserveRatio: '0.5'
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

                <div className="form-group">
                    <label htmlFor="initialPrice">Initial Price (SOL)</label>
                    <input
                        type="number"
                        id="initialPrice"
                        value={formData.initialPrice}
                        onChange={(e) => setFormData(prev => ({ ...prev, initialPrice: e.target.value }))}
                        step="0.000001"
                        min="0"
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="slope">Price Slope</label>
                    <input
                        type="number"
                        id="slope"
                        value={formData.slope}
                        onChange={(e) => setFormData(prev => ({ ...prev, slope: e.target.value }))}
                        step="0.01"
                        min="0"
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="initialSupply">Initial Supply</label>
                    <input
                        type="number"
                        id="initialSupply"
                        value={formData.initialSupply}
                        onChange={(e) => setFormData(prev => ({ ...prev, initialSupply: e.target.value }))}
                        min="1"
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="reserveRatio">Reserve Ratio</label>
                    <input
                        type="number"
                        id="reserveRatio"
                        value={formData.reserveRatio}
                        onChange={(e) => setFormData(prev => ({ ...prev, reserveRatio: e.target.value }))}
                        step="0.01"
                        min="0"
                        max="1"
                        required
                    />
                </div>

                <button type="submit" disabled={!connected || isCreating}>
                    {isCreating ? 'Creating Token...' : 'Create Token'}
                </button>
            </form>
            {transactionStatus && <div className="transaction-status">{transactionStatus}</div>}
        </div>
    )
} 