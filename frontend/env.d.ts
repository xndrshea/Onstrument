/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly MODE: 'development' | 'production'
    readonly VITE_API_URL: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
} 