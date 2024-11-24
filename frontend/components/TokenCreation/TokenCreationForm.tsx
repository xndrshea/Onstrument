import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { CurveType, Network } from '../../../shared/types/token'
import { getProgramErrorMessage } from '../../types/errors'
import { BN } from 'bn.js'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

const PARAM_SCALE = 10_000; // Fixed-point scaling for curve parameters

interface TokenFormData {
    name: string
    symbol: string
    description: string
    image: File | null
    supply: number
    curveType: CurveType
    basePrice: number
    slope: number | null
    exponent: number | null
    log_base: number | null
}

interface TokenCreationFormProps {
    onSuccess?: () => void
    onTokenCreated?: () => void
}

export function TokenCreationForm({ onSuccess, onTokenCreated }: TokenCreationFormProps) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const [formData, setFormData] = useState<TokenFormData>({
        name: '',
        symbol: '',
        description: '',
        image: null,
        supply: 1000000,
        curveType: CurveType.Linear,
        basePrice: 0.1,
        slope: 1,
        exponent: null,
        log_base: null
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
        if (formData.basePrice <= 0) {
            setError('Base price must be greater than 0')
            return false
        }

        // Slope is required for all curve types
        if (!formData.slope || formData.slope <= 0) {
            setError('Slope must be greater than 0')
            return false
        }

        // Additional curve-specific validations
        switch (formData.curveType) {
            case CurveType.Exponential:
                if (!formData.exponent || formData.exponent <= 0) {
                    setError('Exponent must be greater than 0 for exponential curves')
                    return false
                }
                break
            case CurveType.Logarithmic:
                if (!formData.log_base || formData.log_base <= 0) {
                    setError('Log base must be greater than 0 for logarithmic curves')
                    return false
                }
                break
        }

        return true
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('[TokenCreationForm] Form submitted with data:', formData);

        if (!validateForm()) {
            console.log('[TokenCreationForm] Form validation failed');
            return;
        }

        if (!wallet.connected || !wallet.publicKey) {
            console.error('[TokenCreationForm] Wallet not connected');
            setError('Please connect your wallet first');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccess(false);

        try {
            console.log('[TokenCreationForm] Creating TokenTransactionService...');
            const service = new TokenTransactionService(connection, wallet);

            console.log('[TokenCreationForm] Calling service.createToken...');
            const result = await service.createToken({
                name: formData.name,
                symbol: formData.symbol,
                description: formData.description,
                total_supply: new BN(formData.supply),
                base_price: new BN(formData.basePrice * LAMPORTS_PER_SOL),
                curve_type: formData.curveType,
                slope: formData.slope ? new BN(formData.slope * LAMPORTS_PER_SOL) : undefined,
                exponent: formData.curveType === CurveType.Exponential ? new BN(formData.exponent! * PARAM_SCALE) : undefined,
                log_base: formData.curveType === CurveType.Logarithmic ? new BN(formData.log_base! * PARAM_SCALE) : undefined,
            });

            console.log('[TokenCreationForm] Token creation successful:', result);
            setSuccess(true);
            onSuccess?.();
            onTokenCreated?.();
        } catch (err: any) {
            console.error('[TokenCreationForm] Token creation failed:', err);
            setError(getProgramErrorMessage(err) || err.message || 'Failed to create token');
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
                <label>Initial Supply</label>
                <input
                    type="number"
                    value={formData.supply}
                    onChange={e => setFormData({ ...formData, supply: parseInt(e.target.value) })}
                    min="1"
                    required
                />
            </div>

            <div className="form-group">
                <label>Base Price (SOL)</label>
                <input
                    type="number"
                    value={formData.basePrice}
                    onChange={e => setFormData({ ...formData, basePrice: parseFloat(e.target.value) })}
                    min="0.000001"
                    step="0.000001"
                    required
                />
            </div>

            <div className="form-group">
                <label>Curve Type</label>
                <select
                    value={formData.curveType}
                    onChange={e => setFormData({ ...formData, curveType: e.target.value as CurveType })}
                >
                    <option value={CurveType.Linear}>Linear</option>
                    <option value={CurveType.Exponential}>Exponential</option>
                    <option value={CurveType.Logarithmic}>Logarithmic</option>
                </select>
            </div>

            <div className="form-group">
                <label>Slope</label>
                <input
                    type="number"
                    value={formData.slope ?? ''}
                    onChange={e => setFormData({ ...formData, slope: parseFloat(e.target.value) })}
                    min="0.01"
                    step="0.01"
                    required
                />
            </div>

            {formData.curveType === CurveType.Exponential && (
                <div className="form-group">
                    <label>Exponent</label>
                    <input
                        type="number"
                        value={formData.exponent ?? ''}
                        onChange={e => setFormData({ ...formData, exponent: parseFloat(e.target.value) })}
                        min="0.01"
                        step="0.01"
                        required
                    />
                </div>
            )}

            {formData.curveType === CurveType.Logarithmic && (
                <div className="form-group">
                    <label>Log Base</label>
                    <input
                        type="number"
                        value={formData.log_base ?? ''}
                        onChange={e => setFormData({ ...formData, log_base: parseFloat(e.target.value) })}
                        min="0.01"
                        step="0.01"
                        required
                    />
                </div>
            )}

            <button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating Token...' : 'Create Token'}
            </button>
        </form>
    )
} 