import { PublicKey } from '@solana/web3.js'

export interface TokenData {
    mint: string
    name: string
    symbol: string
    description: string
    createdAt: number
    creator: string
    supply: number
    imageUrl?: string
}

class TokenService {
    private readonly STORAGE_KEY = 'created_tokens'
    private readonly API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api'

    // Local Storage Methods
    private getFromStorage(): TokenData[] {
        const stored = localStorage.getItem(this.STORAGE_KEY)
        return stored ? JSON.parse(stored) : []
    }

    private saveToStorage(tokens: TokenData[]) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(tokens))
    }

    // Combined Methods (using both local storage and API)
    async createToken(tokenData: Omit<TokenData, 'createdAt'>): Promise<TokenData> {
        const newToken = {
            ...tokenData,
            createdAt: Date.now()
        }

        // Save to local storage
        const tokens = this.getFromStorage()
        tokens.push(newToken)
        this.saveToStorage(tokens)

        try {
            // Save to backend
            const response = await fetch(`${this.API_URL}/tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newToken)
            })

            if (!response.ok) {
                throw new Error('Failed to save token to backend')
            }
        } catch (error) {
            console.error('Backend save failed, saved to local storage only:', error)
        }

        return newToken
    }

    async getTokens(walletAddress?: string): Promise<TokenData[]> {
        try {
            // Try to get from backend first
            const response = await fetch(`${this.API_URL}/tokens${walletAddress ? `?creator=${walletAddress}` : ''}`)
            if (response.ok) {
                return await response.json()
            }
        } catch (error) {
            console.error('Failed to fetch from backend, falling back to local storage:', error)
        }

        // Fallback to local storage
        const tokens = this.getFromStorage()
        if (walletAddress) {
            return tokens.filter(token => token.creator === walletAddress)
        }
        return tokens
    }
}

export const tokenService = new TokenService() 