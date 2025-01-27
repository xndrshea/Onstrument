/// <reference types="vite/client" />



//test test test
interface ImportMetaEnv {
    readonly MODE: 'development' | 'production'
    readonly VITE_DOCKER: string
    readonly PROD: boolean
}

interface ImportMeta {
    readonly env: ImportMetaEnv
} 