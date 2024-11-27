// Import polyfills first
import './polyfills'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { clusterApiUrl } from '@solana/web3.js'
import { BaseWalletAdapter } from '@solana/wallet-adapter-base'
import {
    SolflareWalletAdapter,
    // Add other wallet adapters as needed
} from '@solana/wallet-adapter-wallets';
import { LocalWallet } from './utils/localWallet';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';

// Import the required wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css'

const network = clusterApiUrl('devnet');
const wallets = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    // Add other wallets as needed
];

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <ConnectionProvider endpoint={network}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <App />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    </React.StrictMode>
) 