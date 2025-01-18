/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly MODE: 'development' | 'production'
    readonly VITE_DOCKER: string
    readonly PROD: boolean
}

interface ImportMeta {
    readonly env: ImportMetaEnv
} 