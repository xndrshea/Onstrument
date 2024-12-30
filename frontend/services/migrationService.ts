export class MigrationService {
    constructor(
        private connection: Connection,
        private wallet: WalletContextState
    ) { }

    async checkMigrationStatus(mintAddress: string): Promise<{
        isMigrated: boolean;
        raydiumPoolAddress?: string;
    }> {
        // Check bonding curve status
        const bondingCurve = new BondingCurve(
            this.connection,
            this.wallet,
            new PublicKey(mintAddress)
        );

        const isMigrated = await bondingCurve.shouldUseRaydium();

        if (isMigrated) {
            // Fetch Raydium pool address from your backend
            const poolInfo = await fetch(
                `/api/pools/${mintAddress}`
            ).then(res => res.json());

            return {
                isMigrated: true,
                raydiumPoolAddress: poolInfo.poolAddress
            };
        }

        return { isMigrated: false };
    }
}
