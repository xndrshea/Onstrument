import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
    // Load env files from project root
    process.env = { ...process.env, ...loadEnv(mode, process.cwd()) }

    return {
        root: './frontend',
        plugins: [react()],
        envDir: './', // Look for .env in project root
        server: {
            port: 3000,
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false
                }
            }
        }
    }
})