import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
    const isDocker = process.env.VITE_DOCKER === 'true'
    const backendUrl = isDocker ? 'http://backend:3001' : 'http://localhost:3001'
    const wsUrl = isDocker ? 'ws://backend:3001' : 'ws://localhost:3001'

    return {
        root: './frontend',
        plugins: [react()],
        envDir: './',
        build: {
            cssCodeSplit: true,
            cssMinify: true,
            sourcemap: true,
        },
        css: {
            postcss: {
                plugins: [require('tailwindcss'), require('autoprefixer')],
            },
        },
        server: {
            port: 3000,
            proxy: {
                '^/api/ws': {
                    target: wsUrl,
                    ws: true,
                    changeOrigin: true
                },
                '^/api': {
                    target: backendUrl,
                    changeOrigin: true
                }
            }
        },
        publicDir: 'public',
        base: '/'
    }
})