import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
    // Set default value if not already set
    process.env.VITE_DOCKER = process.env.VITE_DOCKER || 'false'

    const isDocker = process.env.VITE_DOCKER === 'true'

    const backendUrl = isDocker ? 'http://backend:3001' : 'http://localhost:3001'
    const wsUrl = isDocker ? 'ws://backend:3001' : 'ws://localhost:3001'

    return {
        root: './frontend',
        plugins: [react()],
        envDir: './',
        envPrefix: ['VITE_'],
        define: {
            'import.meta.env': {
                VITE_DOCKER: JSON.stringify(process.env.VITE_DOCKER),
                PROD: process.env.NODE_ENV === 'production',
                MODE: JSON.stringify(process.env.NODE_ENV)
            }
        },
        build: {
            cssCodeSplit: true,
            cssMinify: true,
            sourcemap: true,
            outDir: 'dist',
            assetsDir: 'assets',
            // Add this to ensure all assets are copied
            rollupOptions: {
                input: {
                    main: './frontend/index.html',
                },
                output: {
                    assetFileNames: (assetInfo) => {
                        // Keep charting library files in their original structure
                        if ((assetInfo as any).fileName?.includes('charting_library')) {
                            return '[name][extname]'
                        }
                        return 'assets/[name]-[hash][extname]'
                    },
                }
            }
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
        publicDir: './frontend/public',
        base: '/'
    }
})
