import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { CurveType, CreateTokenParams } from '../../../shared/types/token'
import { BN } from 'bn.js'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { TokenFormData } from '../../../shared/types/token';

const PARAM_SCALE = 10_000; // Fixed-point scaling for curve parameters

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

    const generateTestMetadataJson = () => {
        return {
            name: formData.name,
            symbol: formData.symbol,
            description: formData.description,
            image: "", // Optional for testing
            seller_fee_basis_points: 0,
            attributes: [],
            properties: {
                files: [],
                category: "token",
                creators: []
            },
            collection: null,
            uses: null
        };
    };

    const generateTestMetadataUri = () => {
        const metadata = generateTestMetadataJson();
        // Use base64 encoding to ensure the URI is valid and contains all metadata
        return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!validateForm()) {
            return;
        }

        setIsLoading(true);
        setError(null);

        // Generate test metadata URI
        const testMetadataUri = generateTestMetadataUri();

        const params: CreateTokenParams = {
            name: formData.name,
            symbol: formData.symbol,
            initial_supply: new BN(formData.supply),
            metadata_uri: testMetadataUri,
            curve_config: {
                curve_type: formData.curveType as CurveType,
                base_price: new BN(formData.basePrice * LAMPORTS_PER_SOL),
                slope: formData.slope ? new BN(Math.floor(formData.slope * PARAM_SCALE)) : null,
                exponent: formData.exponent ? new BN(Math.floor(formData.exponent * PARAM_SCALE)) : null,
                log_base: formData.log_base ? new BN(Math.floor(formData.log_base * PARAM_SCALE)) : null
            }
        };

        try {
            const result = await tokenTransactionService.createToken(formData);
            console.log('Token created successfully:', result);
            setSuccess(true);
            onSuccess?.();
            onTokenCreated?.();
        } catch (error) {
            console.error('Token creation failed:', error);
            setError(error instanceof Error ? error.message : 'Failed to create token');
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
                    onChange={e => setFormData({ ...formData, curveType: Number(e.target.value) as CurveType })}
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