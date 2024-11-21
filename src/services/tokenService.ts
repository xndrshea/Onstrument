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

export class TokenService {
    private readonly STORAGE_KEY = 'created_tokens'
    private readonly API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api'
    private tokens: TokenData[] = [];
    private retryDelay = 1000; // 1 second
    private maxRetries = 3;
    private cache: { tokens: TokenData[]; timestamp: number } | null = null;
    private cacheTimeout = 5000; // 5 seconds

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

    private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 0): Promise<any> {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                credentials: 'include',
            });

            if (response.status === 429 && retries < this.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retries + 1)));
                return this.fetchWithRetry(url, options, retries + 1);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (retries < this.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retries + 1)));
                return this.fetchWithRetry(url, options, retries + 1);
            }
            throw error;
        }
    }

    async getTokens(walletAddress?: string): Promise<TokenData[]> {
        // Check cache first
        if (this.cache && Date.now() - this.cache.timestamp < this.cacheTimeout) {
            return this.cache.tokens;
        }

        try {
            console.log('Fetching tokens for wallet address:', walletAddress);
            const url = `${this.API_URL}/tokens${walletAddress ? `?creator=${walletAddress}` : ''}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Backend error: ${response.statusText}`);
            }

            const backendTokens: BackendToken[] = await response.json();
            console.log('Backend tokens:', backendTokens); // Debug log

            const tokens = (backendTokens || []).map(token => this.convertBackendToken(token));

            // Merge with local storage and in-memory tokens
            const localTokens = this.getFromStorage();
            const allTokens = [...tokens, ...localTokens, ...this.tokens];

            // Remove duplicates based on mint_address
            const uniqueTokens = allTokens.filter((token, index, self) =>
                index === self.findIndex((t) => t.mint_address === token.mint_address)
            );

            console.log('Final merged tokens:', uniqueTokens); // Debug log

            // Update cache
            this.cache = {
                tokens: uniqueTokens,
                timestamp: Date.now()
            };

            return uniqueTokens;
        } catch (error) {
            console.error('Error fetching tokens:', error);
            // Return cached data if available, even if expired
            if (this.cache) {
                return this.cache.tokens;
            }
            // Fallback to local storage and in-memory tokens if API fails
            const localTokens = this.getFromStorage();
            return [...localTokens, ...this.tokens];
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

    async getAllTokens(): Promise<TokenData[]> {
        return this.getTokens(); // Use the existing getTokens method
    }

    async saveToken(token: TokenData): Promise<void> {
        try {
            // Add required fields with defaults if missing
            const tokenToSave = {
                mint_address: token.mint_address,
                name: token.name || 'Unnamed Token',
                symbol: token.symbol || 'UNKNOWN',
                description: token.description || '',
                total_supply: token.total_supply || 0,
                image_url: token.image_url || '',
                creator: token.creator || '',
                network: 'devnet' as const,
                metadata: {
                    bondingCurveATA: token.metadata?.bondingCurveATA || '',
                    reserveAccount: token.metadata?.reserveAccount || '',
                    currentSupply: token.metadata?.currentSupply || 0,
                    initialSupply: token.metadata?.initialSupply || 0
                },
                created_at: token.created_at || new Date().toISOString(),
                bondingCurveConfig: token.bondingCurveConfig || {
                    initialPrice: 0.1,
                    slope: 0.1,
                    reserveRatio: 0.5
                }
            };

            // Save to in-memory array
            this.tokens.unshift(tokenToSave);

            // Save to local storage
            const localTokens = this.getFromStorage();
            localTokens.unshift(tokenToSave);
            this.saveToStorage(localTokens);

            // Save to backend
            const backendToken = {
                ...tokenToSave,
                metadata: JSON.stringify(tokenToSave.metadata),
                bondingCurveConfig: JSON.stringify(tokenToSave.bondingCurveConfig)
            };

            console.log('Saving token to backend:', backendToken);

            const response = await fetch(`${this.API_URL}/tokens`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(backendToken)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Backend save error:', errorData);
                throw new Error(`Backend error: ${JSON.stringify(errorData)}`);
            }
        } catch (error) {
            console.error('Error saving token:', error);
            throw error;
        }
    }
}

export const tokenService = new TokenService() 