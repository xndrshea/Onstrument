import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        open: true
    },
    resolve: {
        alias: {
            stream: 'stream-browserify',
            buffer: 'buffer',
            util: 'util',
            process: resolve(__dirname, 'node_modules/process/browser.js')
        }
    },
    define: {
        'process.env': {},
        'global': 'globalThis'
    },
    build: {
        commonjsOptions: {
            transformMixedEsModules: true
        }
    },
    optimizeDeps: {
        esbuildOptions: {
            define: {
                global: 'globalThis'
            }
        },
        include: [
            'buffer',
            'stream-browserify',
            'util',
            'process'
        ]
    }
}) 