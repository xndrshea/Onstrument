import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
    const envFile = mode === 'production' ? '.env.production' : '.env.local'
    process.env = { ...process.env, ...loadEnv(mode, process.cwd(), envFile) }

    return {
        root: './frontend',
        plugins: [react()],
        envDir: './',
        server: {
            port: 3000,
            proxy: {
                '/api': {
                    target: process.env.NODE_ENV === 'development'
                        ? 'http://localhost:3001'
                        : process.env.API_URL,
                    changeOrigin: true,
                    secure: false
                }
            }
        },
        publicDir: 'public'
    }
})