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
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false
                }
            }
        },
        publicDir: 'public'
    }
})