import { Connection, clusterApiUrl } from '@solana/web3.js'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'

export async function verifyDevnetConnection(connection: Connection): Promise<boolean> {
    try {
        const currentEndpoint = connection.rpcEndpoint
        const devnetEndpoint = clusterApiUrl(WalletAdapterNetwork.Devnet)

        if (currentEndpoint !== devnetEndpoint) {
            console.error('Not connected to devnet')
            return false
        }

        // Verify we can reach the network
        await connection.getLatestBlockhash()
        return true
    } catch (error) {
        console.error('Network verification failed:', error)
        return false
    }
} 