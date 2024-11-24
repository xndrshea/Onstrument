import React, { useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { TokenTransactionService } from '../../services/TokenTransactionService'
import { CurveType } from '../../../shared/types/token'

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
    const wallet = useWallet()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [formData, setFormData] = useState({
        name: '',
        symbol: '',
        description: '',
        totalSupply: 0,
        basePrice: 0,
        curveType: CurveType.LINEAR,
        slope: 0,
        exponent: 0,
        logBase: 0,
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const service = new TokenTransactionService(connection, wallet)
            const result = await service.createToken(formData)
            console.log('Token created:', result)
            // Handle success (e.g., show success message, redirect)
        } catch (err) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <div>
                <label>Name:</label>
                <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
            </div>
            <button type="submit" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Token'}
            </button>

            {error && <div className="error">{error}</div>}
        </form>
    )
} 