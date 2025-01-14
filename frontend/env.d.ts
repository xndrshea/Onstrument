/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly MODE: 'development' | 'production'
    readonly VITE_API_URL: string
    readonly VITE_PINATA_JWT: string
    readonly VITE_PINATA_API_KEY: string
    readonly VITE_PINATA_SECRET_KEY: string
    readonly VITE_HELIUS_RPC_URL: string
    // Add other env variables here
}

interface ImportMeta {
    readonly env: ImportMetaEnv
} 