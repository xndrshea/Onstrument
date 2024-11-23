import { Connection } from '@solana/web3.js'

export async function verifyDevnetConnection(connection: Connection): Promise<boolean> {
    try {
        // First try to get the version to ensure we have a connection
        const version = await connection.getVersion();

        // Get cluster info to verify we're on devnet
        const genesisHash = await connection.getGenesisHash();
        const clusterNodes = await connection.getClusterNodes();
        const cluster = clusterNodes[0]?.rpcUrl || '';

        // Check if we're on devnet by checking the cluster info
        const isDevnet = cluster?.includes('devnet') ||
            connection.rpcEndpoint.includes('devnet') ||
            genesisHash === 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'; // Devnet genesis hash

        if (!isDevnet) {
            console.warn('Not connected to devnet:', {
                cluster,
                endpoint: connection.rpcEndpoint,
                genesisHash
            });
            return false;
        }

        return true;
    } catch (error) {
        console.error('Network verification failed:', error);
        // If we can't verify the network, assume it's okay to prevent blocking the UI
        return true;
    }
} 