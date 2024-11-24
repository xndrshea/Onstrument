import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    root: './frontend',
    plugins: [react()],
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false
            }
        },
        fs: {
            strict: false
        }
    },
    resolve: {
        alias: {
            stream: 'stream-browserify',
            buffer: 'buffer'
        }
    }
})