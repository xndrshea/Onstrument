import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { createToken } from '../../utils/tokenCreation'
import { tokenService } from '../../services/tokenService'
import { ConfirmOptions } from '@solana/web3.js'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { clusterApiUrl } from '@solana/web3.js'

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
        supply: 1000000000,
    })
    const [isCreating, setIsCreating] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!connected || !publicKey) {
            alert('Please connect your wallet first')
            return
        }

        // Check if wallet is on the correct network
        try {
            const currentEndpoint = connection.rpcEndpoint
            const devnetEndpoint = clusterApiUrl(WalletAdapterNetwork.Devnet)

            if (currentEndpoint !== devnetEndpoint) {
                alert('Please switch your wallet to Devnet network before creating a token. In Phantom wallet: Settings -> Developer Settings -> Change Network to Devnet')
                return
            }

            // Check if wallet has enough SOL
            const balance = await connection.getBalance(publicKey)
            if (balance < 10000000) { // 0.01 SOL minimum
                alert('Insufficient SOL balance. You need at least 0.01 SOL on Devnet. You can get free Devnet SOL from https://solfaucet.com')
                return
            }

            setIsCreating(true)
            console.log('Starting token creation process...')

            // Create the token with fixed 9 decimals
            console.log('Creating token transaction...')
            const { transaction, mintKeypair } = await createToken(
                connection,
                publicKey,
                9
            )
            console.log('Token transaction created, mint address:', mintKeypair.publicKey.toString())

            // Set confirmation options
            const confirmOptions: ConfirmOptions = {
                commitment: 'confirmed',
                preflightCommitment: 'confirmed',
                skipPreflight: false,
                maxRetries: 3
            }

            // Send the transaction
            console.log('Sending transaction...')
            const signature = await sendTransaction(transaction, connection, {
                signers: [mintKeypair],
                ...confirmOptions
            })
            console.log('Transaction sent, signature:', signature)

            // Wait for confirmation with longer timeout and better error handling
            console.log('Waiting for confirmation...')
            try {
                const latestBlockhash = await connection.getLatestBlockhash()
                const confirmation = await connection.confirmTransaction({
                    signature,
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
                }, 'confirmed')

                if (confirmation.value.err) {
                    throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`)
                }

                console.log('Transaction confirmed:', confirmation)

                // Add instructions for viewing the token
                const mintAddress = mintKeypair.publicKey.toString()
                const successMessage = `
                    Token created successfully!
                    
                    Mint Address: ${mintAddress}
                    
                    To view your token:
                    1. Make sure your wallet is on Devnet
                    2. Click the "Add Token" button in your wallet
                    3. Paste this mint address: ${mintAddress}
                    
                    Note: This token is on Devnet and won't be visible while your wallet is on Mainnet.
                `

                alert(successMessage)

                // Save token data
                console.log('Saving token data to backend...')
                const tokenData = {
                    mint: mintKeypair.publicKey.toString(),
                    name: formData.name,
                    symbol: formData.symbol,
                    description: formData.description,
                    creator: publicKey.toString(),
                    supply: formData.supply,
                }
                console.log('Token data to save:', tokenData)

                const savedToken = await tokenService.createToken(tokenData)
                console.log('Token data saved:', savedToken)

                if (onSuccess) {
                    onSuccess()
                }

                // Trigger token list refresh
                if (onTokenCreated) {
                    onTokenCreated()
                }

                // Reset form
                setFormData({
                    name: '',
                    symbol: '',
                    description: '',
                    image: null,
                    supply: 1000000000,
                })
            } catch (confirmError) {
                console.error('Confirmation error:', confirmError)

                // Check if transaction was actually successful despite timeout
                const signatureStatus = await connection.getSignatureStatus(signature)
                if (signatureStatus.value?.confirmationStatus === 'confirmed' ||
                    signatureStatus.value?.confirmationStatus === 'finalized') {
                    console.log('Transaction was actually successful!')
                    // Continue with token data saving...
                    const tokenData = {
                        mint: mintKeypair.publicKey.toString(),
                        name: formData.name,
                        symbol: formData.symbol,
                        description: formData.description,
                        creator: publicKey.toString(),
                        supply: formData.supply,
                    }
                    const savedToken = await tokenService.createToken(tokenData)
                    alert(`Token created successfully (despite timeout)! Mint address: ${mintKeypair.publicKey.toString()}`)
                    if (onSuccess) onSuccess()
                } else {
                    throw new Error('Transaction failed or expired')
                }
            }
        } catch (error) {
            console.error('Detailed error creating token:', error)
            alert(`Failed to create token: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
            setIsCreating(false)
        }
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