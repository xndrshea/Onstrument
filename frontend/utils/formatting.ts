export function formatMarketCap(marketCap: number): string {
    if (marketCap >= 1_000_000_000) {
        return `$${(marketCap / 1_000_000_000).toFixed(2)}B`;
    } else if (marketCap >= 1_000_000) {
        return `$${(marketCap / 1_000_000).toFixed(2)}M`;
    } else if (marketCap >= 1_000) {
        return `$${(marketCap / 1_000).toFixed(2)}K`;
    }
    return `$${marketCap.toFixed(2)}`;
}

export function convertBigIntToNumber(value: bigint | undefined): number {
    if (value === undefined) {
        return 0;
    }
    // Safely convert BigInt to number, handling potential overflow
    try {
        return Number(value);
    } catch (error) {
        console.warn('Error converting BigInt to number:', error);
        return 0;
    }
} 