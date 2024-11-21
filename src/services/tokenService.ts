import { PublicKey } from '@solana/web3.js'

export interface TokenData {
    mint_address: string;
    name: string;
    symbol: string;
    description?: string;
    creator?: string;
    total_supply: number;
    image_url?: string;
    network?: 'mainnet' | 'devnet';
    metadata: {
        bondingCurve?: string;
        bondingCurveATA: string;
        reserveAccount: string;
        initialSupply?: number;
        currentSupply?: number;
    };
    created_at?: string;
    bondingCurveConfig?: {
        initialPrice: number;
        slope: number;
        reserveRatio: number;
    };
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
            mint_address: backendToken.mint_address,
            name: backendToken.name,
            symbol: backendToken.symbol,
            description: backendToken.description,
            creator: backendToken.creator_id?.toString() || '',
            total_supply: backendToken.total_supply,
            image_url: backendToken.image_url,
            created_at: backendToken.created_at,
            network: 'devnet',
            metadata: {
                bondingCurveATA: '',
                reserveAccount: ''
            }
        }
    }

    // Combined Methods (using both local storage and API)
    async createToken(tokenData: Omit<TokenData, 'created_at'>): Promise<TokenData> {
        console.log('TokenService: Creating token with data:', tokenData)

        const newToken = {
            ...tokenData,
            created_at: new Date().toISOString()
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
                mint_address: tokenData.mint_address,
                name: tokenData.name,
                symbol: tokenData.symbol,
                description: tokenData.description,
                total_supply: tokenData.total_supply,
                image_url: tokenData.image_url,
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

            const response = await fetch(url)
            if (!response.ok) {
                throw new Error(`Backend error: ${response.statusText}`)
            }

            const backendTokens: BackendToken[] = await response.json()
            const tokens = (backendTokens || []).map(token => this.convertBackendToken(token))

            // Merge with local storage and validate
            const localTokens = this.getFromStorage()
            const mergedTokens = [...tokens, ...localTokens]

            // Remove duplicates
            return mergedTokens.filter((token, index, self) =>
                index === self.findIndex((t) => t.mint_address === token.mint_address)
            )
        } catch (error) {
            return this.getFromStorage() // Fallback to local storage
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

    clearLocalStorage() {
        localStorage.removeItem(this.STORAGE_KEY)
    }
}

export const tokenService = new TokenService() 