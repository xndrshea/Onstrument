import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
    // Load env file based on mode
    const env = loadEnv(mode, process.cwd(), 'VITE_')

    // Create env object with all env variables
    const envWithProcessPrefix = {
        'process.env': Object.entries(env).reduce((prev, [key, val]) => {
            return {
                ...prev,
                [key]: val,
            }
        }, {})
    }

    return {
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
        define: envWithProcessPrefix
    };
})