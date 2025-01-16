/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly MODE: 'development' | 'production'
}

interface ImportMeta {
    readonly env: ImportMetaEnv
} 