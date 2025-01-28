// Import polyfills first
import './polyfills'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import '@solana/wallet-adapter-react-ui/styles.css'
import { getConnection } from './config'
import { generateFavicon } from './public/assets/favicon'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Create a client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 2,
            staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
            gcTime: 30 * 60 * 1000,   // Keep in cache for 30 minutes
        },
    },
})

const wallets = [
    new SolflareWalletAdapter(),
];

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

const connection = getConnection(import.meta.env.PROD ? false : true) // Only use devnet in development

// Add before React rendering
generateFavicon();

ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <ConnectionProvider endpoint={connection.rpcEndpoint}>
                <WalletProvider wallets={wallets} autoConnect>
                    <WalletModalProvider>
                        <App />
                    </WalletModalProvider>
                </WalletProvider>
            </ConnectionProvider>
        </QueryClientProvider>
    </React.StrictMode>
) 