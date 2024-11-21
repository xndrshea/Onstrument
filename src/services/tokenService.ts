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

interface BackendToken {
    id: number
    mint_address: string
    creator_id: number | null
    name: string
    symbol: string
    description: string
    total_supply: number
    image_url?: string
    created_at?: string
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

    private convertBackendToken(backendToken: BackendToken): TokenData {
        return {
            mint: backendToken.mint_address,
            name: backendToken.name,
            symbol: backendToken.symbol,
            description: backendToken.description,
            creator: backendToken.creator_id?.toString() || '',
            supply: backendToken.total_supply,
            imageUrl: backendToken.image_url,
            createdAt: backendToken.created_at ? new Date(backendToken.created_at).getTime() : Date.now()
        }
    }

    // Combined Methods (using both local storage and API)
    async createToken(tokenData: Omit<TokenData, 'createdAt'>): Promise<TokenData> {
        console.log('TokenService: Creating token with data:', tokenData)

        const newToken = {
            ...tokenData,
            createdAt: Date.now()
        }

        // Save to local storage
        try {
            const tokens = this.getFromStorage()
            tokens.push(newToken)
            this.saveToStorage(tokens)
            console.log('TokenService: Saved to local storage successfully')
        } catch (error) {
            console.error('TokenService: Failed to save to local storage:', error)
        }

        try {
            // Convert to backend format
            const backendToken = {
                mint_address: tokenData.mint,
                name: tokenData.name,
                symbol: tokenData.symbol,
                description: tokenData.description,
                total_supply: tokenData.supply,
                image_url: tokenData.imageUrl,
                creator: tokenData.creator,
                network: 'devnet'
            }

            console.log('TokenService: Sending to backend:', backendToken)
            const response = await fetch(`${this.API_URL}/tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(backendToken)
            })

            const responseText = await response.text()
            console.log('Raw response from backend:', responseText)

            if (!response.ok) {
                throw new Error(`Backend error: ${responseText}`)
            }

            const savedBackendToken: BackendToken = JSON.parse(responseText)
            const savedToken = this.convertBackendToken(savedBackendToken)
            console.log('TokenService: Saved to backend successfully:', savedToken)
            return savedToken
        } catch (error) {
            console.error('TokenService: Backend save failed:', error)
            return newToken
        }
    }

    async getTokens(walletAddress?: string): Promise<TokenData[]> {
        try {
            console.log('Fetching tokens for wallet address:', walletAddress)
            const url = `${this.API_URL}/tokens${walletAddress ? `?creator=${walletAddress}` : ''}`
            console.log('Fetching from URL:', url)

            const response = await fetch(url)
            const responseText = await response.text()
            console.log('Raw response from backend:', responseText)

            if (!response.ok) {
                throw new Error(`Backend error: ${responseText}`)
            }

            const backendTokens: BackendToken[] = JSON.parse(responseText)
            console.log('Raw backend response:', backendTokens)

            // If backend returns null or undefined, use empty array
            const tokens = (backendTokens || []).map(token => this.convertBackendToken(token))
            console.log('Converted tokens:', tokens)

            // Merge with local storage tokens
            const localTokens = this.getFromStorage()
            console.log('Local storage tokens:', localTokens)

            const allTokens = [...tokens, ...localTokens]
            // Remove duplicates based on mint address
            const uniqueTokens = allTokens.filter((token, index, self) =>
                index === self.findIndex((t) => t.mint === token.mint)
            )

            console.log('Final merged tokens:', uniqueTokens)
            return uniqueTokens
        } catch (error) {
            console.error('Failed to fetch from backend:', error)
            // Fallback to local storage
            const tokens = this.getFromStorage()
            console.log('Falling back to local storage tokens:', tokens)
            return walletAddress
                ? tokens.filter(token => token.creator === walletAddress)
                : tokens
        }
    }

    async verifyToken(mintAddress: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.API_URL}/tokens/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mintAddress })
            })
            return response.ok
        } catch (error) {
            console.error('Error verifying token:', error)
            return false
        }
    }
}

export const tokenService = new TokenService()
export type { TokenData } 