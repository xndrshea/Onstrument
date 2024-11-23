import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { CurveType } from '../../../shared/types/token'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { validateBondingCurveConfig } from '../../../shared/utils/bondingCurveValidator'

interface TokenFormData {
    name: string
    symbol: string
    description: string
    image: File | null
    supply: number
    curveType: CurveType
    basePrice: number
    slope?: number
    exponent?: number
    logBase?: number
}

interface TokenCreationFormProps {
    onSuccess?: () => void
    onTokenCreated?: () => void
}

export function TokenCreationForm({ onSuccess, onTokenCreated }: TokenCreationFormProps) {
    const { connection } = useConnection()
    const { connected, publicKey, sendTransaction, signTransaction } = useWallet()
    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        description: '',
        image: null,
        supply: 1000000,
        curveType: CurveType.LINEAR,
        basePrice: 0.0001,
        slope: 0.1,
        exponent: 2,
        logBase: Math.E
    })
    const [isCreating, setIsCreating] = useState(false)
    const [transactionStatus, setTransactionStatus] = useState<string>('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!publicKey) return;

        try {
            // Validate bonding curve config before proceeding
            validateBondingCurveConfig({
                curveType: formData.curveType,
                basePrice: Number(formData.basePrice),
                slope: formData.curveType === CurveType.LINEAR ? Number(formData.slope) : undefined,
                exponent: formData.curveType === CurveType.EXPONENTIAL ? Number(formData.exponent) : undefined,
                logBase: formData.curveType === CurveType.LOGARITHMIC ? Number(formData.logBase) : undefined
            });

            setIsCreating(true);
            setTransactionStatus('Creating token...');

            const tokenTransactionService = new TokenTransactionService(
                connection,
                {
                    publicKey,
                    sendTransaction: async (transaction: Transaction) => {
                        const signature = await sendTransaction(transaction, connection);
                        setTransactionStatus('Confirming transaction...');
                        return signature;
                    },
                    signTransaction: signTransaction!
                }
            );

            const result = await tokenTransactionService.createToken({
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                totalSupply: formData.supply,
                bondingCurve: {
                    curveType: formData.curveType,
                    basePrice: Number(formData.basePrice),
                    slope: formData.curveType === CurveType.LINEAR ? Number(formData.slope) : undefined,
                    exponent: formData.curveType === CurveType.EXPONENTIAL ? Number(formData.exponent) : undefined,
                    logBase: formData.curveType === CurveType.LOGARITHMIC ? Number(formData.logBase) : undefined
                }
            });

            setTransactionStatus('Token created successfully!');
            if (onSuccess) onSuccess();
            if (onTokenCreated) onTokenCreated();
        } catch (error) {
            console.error('Error creating token:', error);
            setTransactionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="token-creation-form">
            <div className="network-warning" style={{
                backgroundColor: '#fff3cd',
                color: '#856404',
                padding: '1rem',
                marginBottom: '1rem',
                borderRadius: '4px'
            }}>
                ⚠️ You are creating a token on {connection.rpcEndpoint.includes('devnet') ? 'Devnet' : 'Mainnet'}. Make sure your wallet is connected to the correct network.
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

                <div className="form-group">
                    <label>Curve Type</label>
                    <select
                        value={formData.curveType}
                        onChange={e => setFormData({ ...formData, curveType: e.target.value as CurveType })}
                    >
                        <option value={CurveType.LINEAR}>Linear</option>
                        <option value={CurveType.EXPONENTIAL}>Exponential</option>
                        <option value={CurveType.LOGARITHMIC}>Logarithmic</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Base Price (SOL)</label>
                    <input
                        type="number"
                        step="0.0001"
                        value={formData.basePrice}
                        onChange={e => setFormData({ ...formData, basePrice: Number(e.target.value) })}
                        required
                    />
                </div>

                {formData.curveType === CurveType.LINEAR && (
                    <div className="form-group">
                        <label>Slope</label>
                        <input
                            type="number"
                            step="0.01"
                            value={formData.slope}
                            onChange={e => setFormData({ ...formData, slope: Number(e.target.value) })}
                            required
                        />
                    </div>
                )}

                {formData.curveType === CurveType.EXPONENTIAL && (
                    <div className="form-group">
                        <label>Exponent</label>
                        <input
                            type="number"
                            step="0.1"
                            value={formData.exponent}
                            onChange={e => setFormData({ ...formData, exponent: Number(e.target.value) })}
                            required
                        />
                    </div>
                )}

                {formData.curveType === CurveType.LOGARITHMIC && (
                    <div className="form-group">
                        <label>Log Base</label>
                        <input
                            type="number"
                            step="0.1"
                            value={formData.logBase}
                            onChange={e => setFormData({ ...formData, logBase: Number(e.target.value) })}
                            required
                        />
                    </div>
                )}

                <button type="submit" disabled={!connected || isCreating}>
                    {isCreating ? 'Creating Token...' : 'Create Token'}
                </button>
            </form>
            {transactionStatus && <div className="transaction-status">{transactionStatus}</div>}
        </div>
    )
} 